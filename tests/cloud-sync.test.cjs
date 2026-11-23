const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createController } = require('../cloud-sync.js');
let pg;
before(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims', true)::jsonb->>'sub' $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims', true)::jsonb->>'role' $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;`);
  await pg.exec(fs.readFileSync(path.join(__dirname, '../cloudbase/setup.sql'), 'utf8'));
});
after(async () => { await pg?.close(); });
function asUser(id, sql, params = [], role = 'authenticated') {
  return pg.transaction(async tx => {
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role })]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return (await tx.query(sql, params)).rows;
  });
}
const payload = name => ({ places: [{ id: 'p1', name, category: 'sight', lat: 35, lng: 139 }], flights: [], works: [], accommodationRevision: 3 });
function transport(id) {
  return {
    load: async () => (await asUser(id, 'SELECT * FROM public.jpmap_load()'))[0] || null,
    save: async (data, version) => (await asUser(id, 'SELECT * FROM public.jpmap_save($1::jsonb, $2::bigint)', [JSON.stringify(data), version]))[0] || null
  };
}
function device(id, initial, t) {
  let data = initial;
  const cache = new Map();
  const storage = { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) };
  const controller = createController({ transport: transport(id), storage, getSnapshot: () => data, applySnapshot: next => { data = next; } });
  t.after(() => controller.disconnect());
  return { controller, read: () => data, edit: name => { data = payload(name); controller.changed(); }, cache };
}
test('database permits only owner reads and version-checked writes, rejecting anonymous and direct client writes', async () => {
  const alice = transport('policy-alice'), bob = transport('policy-bob');
  assert.equal((await alice.save(payload('private'), 0)).version, 1);
  assert.equal(await bob.load(), null);
  assert.equal((await asUser('policy-bob', 'SELECT * FROM public.jpmap_trips')).length, 0);
  await assert.rejects(asUser('policy-alice', "UPDATE public.jpmap_trips SET payload = '{}'::jsonb"), /permission denied/);
  await assert.rejects(asUser('anon', 'SELECT * FROM public.jpmap_load()', [], 'anon'), /permission denied/);
  await assert.rejects(asUser('anon', 'SELECT * FROM public.jpmap_save($1::jsonb, 0)', [JSON.stringify(payload('bad'))], 'anon'), /permission denied/);
  await assert.rejects(alice.save({ places: [] }, 1), /Invalid itinerary/);
  assert.equal((await alice.load()).payload.places[0].name, 'private');
});
test('concurrent versions cannot overwrite a newer itinerary, including duplicate initial uploads', async () => {
  const cloud = transport('cas');
  const first = await cloud.save(payload('first'), 0);
  assert.equal(await cloud.save(payload('duplicate'), 0), null);
  assert.equal((await cloud.save(payload('second'), first.version)).version, 2);
  assert.equal(await cloud.save(payload('stale'), first.version), null);
  assert.equal((await cloud.load()).payload.places[0].name, 'second');
});
test('first connection keeps local edits until an explicit upload; another device can then download and refresh', async t => {
  const pc = device('cross-device', payload('computer'), t), phone = device('cross-device', payload('phone default'), t);
  await pc.controller.connect('cross-device');
  assert.equal(pc.controller.state().choose, true);
  assert.equal(await transport('cross-device').load(), null);
  await pc.controller.chooseLocal();
  await phone.controller.connect('cross-device');
  assert.equal(phone.read().places[0].name, 'phone default');
  await phone.controller.chooseCloud();
  assert.equal(phone.read().places[0].name, 'computer');
  pc.edit('computer changed'); await pc.controller.sync(); await phone.controller.sync();
  assert.equal(phone.read().places[0].name, 'computer changed');
  assert.ok([...phone.cache.keys()].some(key => key.startsWith('jpmap-backup-')));
});
test('two edited devices report conflict and retain the losing device changes', async t => {
  const pc = device('conflict', payload('initial'), t), phone = device('conflict', payload('default'), t);
  await pc.controller.connect('conflict'); await pc.controller.chooseLocal();
  await phone.controller.connect('conflict'); await phone.controller.chooseCloud();
  pc.edit('new PC'); phone.edit('new phone');
  await pc.controller.sync(); await phone.controller.sync();
  assert.equal(phone.controller.state().choose, true);
  assert.equal(phone.read().places[0].name, 'new phone');
  assert.equal((await transport('conflict').load()).payload.places[0].name, 'new PC');
  await phone.controller.chooseLocal();
  assert.equal((await transport('conflict').load()).payload.places[0].name, 'new phone');
});
test('logging into a different account never uploads the previous account itinerary automatically', async t => {
  const pc = device('account-a', payload('A itinerary'), t);
  await pc.controller.connect('account-a'); await pc.controller.chooseLocal(); pc.controller.disconnect();
  await pc.controller.connect('account-b');
  assert.equal(pc.controller.state().choose, true);
  assert.equal(await transport('account-b').load(), null);
});
