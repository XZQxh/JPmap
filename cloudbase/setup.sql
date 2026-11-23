-- Run once in this environment's PostgreSQL SQL editor as its administrator.
-- Client users can read their own row, but writes must use the version-checked RPC.
BEGIN;
CREATE TABLE IF NOT EXISTS public.jpmap_trips (
  owner_id text PRIMARY KEY,
  payload jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.jpmap_trips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jpmap_trips FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jpmap_trips TO authenticated;
DROP POLICY IF EXISTS jpmap_select_own ON public.jpmap_trips;
CREATE POLICY jpmap_select_own ON public.jpmap_trips
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.jpmap_load()
RETURNS SETOF public.jpmap_trips LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $$
  SELECT * FROM public.jpmap_trips WHERE owner_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.jpmap_save(p_payload jsonb, p_expected_version bigint)
RETURNS SETOF public.jpmap_trips LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE v_owner text := auth.uid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_owner IS NULL OR v_owner = 'anon' THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload->'places') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'flights') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'works') IS DISTINCT FROM 'array'
     OR octet_length(p_payload::text) > 2000000 THEN
    RAISE EXCEPTION 'Invalid itinerary payload' USING ERRCODE = '22023';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'Invalid version' USING ERRCODE = '22023';
  END IF;
  IF p_expected_version = 0 THEN
    RETURN QUERY INSERT INTO public.jpmap_trips(owner_id, payload)
      VALUES (v_owner, p_payload) ON CONFLICT (owner_id) DO NOTHING
      RETURNING *;
  ELSE
    RETURN QUERY UPDATE public.jpmap_trips
      SET payload = p_payload, version = version + 1, updated_at = now()
      WHERE owner_id = v_owner AND version = p_expected_version
      RETURNING *;
  END IF;
  -- No returned row means another device has saved first. Never overwrite it silently.
END;
$$;
REVOKE ALL ON FUNCTION public.jpmap_load() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jpmap_save(jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jpmap_load() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jpmap_save(jsonb, bigint) TO authenticated;
COMMIT;
