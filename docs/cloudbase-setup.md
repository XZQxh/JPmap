# CloudBase PostgreSQL 接入步骤

本方案已归档：用户决定改试 Supabase。当前接入步骤见 [supabase-setup.md](supabase-setup.md)，不要继续用本文初始化新的 Supabase 项目。

## 当前阻塞：免费环境无法添加线上来源

用户已在控制台确认：添加跨域域名需要升级套餐。随后从真实 `https://xzqxh.github.io` 页面执行 SDK 的 `jpmap_load` 匿名只读探测，浏览器明确报告预检响应缺少 `Access-Control-Allow-Origin`，请求以 `Failed to fetch` 失败。

因此，当前免费环境尚不能支持 GitHub Pages 上的同步功能；不要将下面的设置步骤理解为免费版一定可完成。此前 localhost 探测成功，只证明默认获准的本地来源能访问项目，不代表线上来源已获准。账号隔离和版本冲突的本地测试仍然有效，但不能替代线上连接验证。

所有者尚未选择付费或迁移。暂不升级套餐、不迁移后端、不删除已有环境与数据。可比较 CloudBase 的实际付费报价与 Supabase 免费版（仍需验证大陆网络，并接受低活跃项目可能暂停）。

已选环境：`jpmap-d2gsyqixu8b7f8714`，上海，PostgreSQL 模式。

浏览器配置位于 `cloudbase-config.js`，仅含环境 ID 和匿名角色的 Publishable Key；任何管理员 API Key、SecretId、SecretKey、数据库密码均不应写入项目。

## 所有者需要完成

1. 在该环境的 PostgreSQL 管理页面打开 SQL 编辑器，执行 [setup.sql](../cloudbase/setup.sql) 的全部内容。脚本创建行程表、账号隔离规则、读取接口和带版本检查的保存接口。重复执行不会删除现有行程。不要关闭 RLS，也不要将表设为所有人可读写。
2. 在身份认证中开启账号密码登录，并通过用户管理创建一个供本人使用的账号。用户名或邮箱按控制台实际支持填写。登录这里使用的是应用个人账号，不是腾讯云控制台账号；密码不需要发给开发者。若该页面只有邮箱验证码或其他方式，应先核对当前环境认证类型，不要随意放开匿名权限。
3. 在 Web 安全域名/安全来源中添加 `xzqxh.github.io`（不带 `/JPmap/` 路径）。本机验证还可添加 `127.0.0.1:18765`、`127.0.0.1:8765` 及 `localhost:8765`。以控制台支持的域名格式为准。
4. 网站发布后，在电脑打开同一在线地址，点击“登录 / 同步”，用个人账号登录。先“导出本机备份”，再选择“上传本机行程”。第一次不会自动把默认行程上传。
5. 手机访问相同在线地址，用同一账号登录，首次选择“使用云端行程”。之后电脑修改会先保存本地，再自动上传；手机打开/返回页面或点击“立即同步”会检查更新。

如果原先是在 `http://127.0.0.1:8765` 编辑，先在那个地址导出备份，再到在线网站导入；不同网址的浏览器存储互相独立，不会自动搬过去。

## 数据和冲突

`public.jpmap_trips` 每个账号一条行程，保存地点、日期、住宿、航班个人备注和关注作品。坐标查询记录、定位轨迹、地图底图和天气缓存不上传。

每次更新由数据库原子检查版本。如果电脑和手机都修改了同一份旧行程，第二次写入会被拒绝，页面会让用户明确选择云端或本机版本。没有自动合并，也不会默默覆盖。

替换前的自动备份保存在当前浏览器，可以在同步窗口的“替换前的自动备份”恢复。导出备份是普通 JSON，可在任一设备通过“导入备份”恢复。清理浏览器数据会删除本机缓存和自动备份，但不会删除已经成功保存的云端行程。

退出登录保留当前浏览器的行程缓存；在共用设备上请自行清理。切换账号时不会自动把上一账号的数据上传到新账号。

本次未增加 Service Worker：页面已经打开时可以继续本地编辑，但不能保证断网后重新打开网页或加载地图；需要网络恢复后才能上传修改。

## 验证与已知边界

- `npm ci` 安装开发验证工具；本地网页服务本身仍不需要 npm 依赖。
- `npm test`：现有功能，以及在 PGlite 真实 PostgreSQL 引擎下验证 SQL 权限、版本冲突和跨设备控制器。
- `npm run check:browser`：使用本机 Edge 检查桌面、手机登录界面、真实官方 SDK 接口、备份导出/恢复及本地资源。截图在 `previews/cloud-desktop.png` 和 `previews/cloud-mobile.png`。
- 本地 PostgreSQL 验证不等于真实 CloudBase 验证。只有所有者执行 SQL、设置认证和域名，并实际在两台设备登录后，才能确认完整云端链路。
- 接入时使用真实 Publishable Key 做匿名只读探测，接口返回 `DATABASE_PGRST202`（尚未找到 `jpmap_load`）。这证明验证环境能够连接到当前项目网关，但函数尚未初始化；不是登录和同步成功的证明。
- 原来写在公开代码中的默认行程依然公开；后端账号权限只保护新增的云端私有数据。

## 官方参考

- https://docs.cloudbase.net/en/authentication-v2/auth/auth-pg
- https://docs.cloudbase.net/database/postgresql/data-permission
- https://docs.cloudbase.net/api-reference/webv3/initialization
- https://docs.cloudbase.net/api-reference/webv3/authentication
- https://docs.cloudbase.net/service/safety-domain
