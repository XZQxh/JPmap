# Supabase 个人行程同步

## 当前进度

用户已选择改试 Supabase Free；原 CloudBase 免费环境无法添加 GitHub Pages 来源，线上 CORS 验证失败。

浏览器代码已改用 Supabase 官方 SDK。所有者已提供项目 `https://lwxrifdcrhaizcobrpfp.supabase.co` 及 Publishable key，已填写公开配置。本地数据库权限、版本冲突、备份及界面检查不能代替真实云端验证；还需验证云端 SQL 初始化、认证和实际线上来源。

## 1. 创建项目并获取公开配置

在 https://supabase.com/dashboard 创建 Free 项目，地域优先东京（以控制台实际可选地域为准）。项目数据库密码由所有者自行设置和保管，不需要提供。

通过项目顶部 Connect 对话框获取 Project URL 和 Publishable key，也可在 Settings → API Keys 查看密钥。只提供 `sb_publishable_...` 或旧版 `anon` key，不能提供 `sb_secret_...`、`service_role` 或数据库连接密码。

配置写入 `supabase-config.js`。这里的值在公开网页中可见，私有行程依赖数据库账号权限隔离，而非隐藏这些配置。

## 2. 执行建表 SQL

进入新项目 SQL Editor，点击 New query。打开项目中的 [supabase/setup.sql](../supabase/setup.sql)，复制**文件的全部内容**粘贴进去，再点击 Run。不能把 Windows 文件路径当成 SQL 执行。

脚本创建：

- `public.jpmap_trips`：每个账号一行，所有者为 Supabase 的 UUID。
- `jpmap_load`：只允许已登录账号读取自己的行程。
- `jpmap_save`：只允许通过版本检查的保存，防止旧设备覆盖新版本。
- RLS 和最小权限：未登录账号不能读取，客户端不能绕过版本检查直接改表。

请使用本目录的 Supabase 脚本，不要继续执行历史 CloudBase 脚本。两个服务的用户 ID 类型不同。

## 3. 创建个人应用账号

打开 Authentication → Users，通过 Add user → Create new user 创建自己的邮箱和密码账号；若有 Auto Confirm User 选项，可在确认邮箱归本人所有后选中。若界面只提供邀请流程，先报告实际页面选项，再决定使用哪种登录流程。

此邮箱密码属于旅行地图的应用账号，与 Supabase 控制台密码、项目数据库密码是不同的凭据。无需将密码发给开发者。

本版网页只提供邮箱密码登录，不提供开放注册、邀请链接处理或密码找回。

## 4. 从实际网站验证，再开始同步

开发者需先执行 `npm run check:online`，从真实 `https://xzqxh.github.io/JPmap/` 来源确认能够收到已初始化数据库的匿名权限拒绝，而非网络失败或 CORS 错误。必须明确报告真实账号的保存/读取尚未验证，不能以匿名探测证明全部同步成功。

然后由所有者进行真实账号验证：

1. 电脑刷新在线网站，先导出本机备份。
2. 用个人应用邮箱和密码登录，首次选择“上传本机行程”，确认状态为“已同步”。
3. 手机在同一网址登录同一账号，选择“使用云端行程”。
4. 电脑修改一条备注，等待“已同步”；手机返回网页或点击“立即同步”，确认备注更新。

本版没有要求购买 HTTP 网关跨域域名套餐。实际项目仍须验证大陆网络及真实线上来源，不能提前保证连接稳定。

## 数据保留与备份

- 本机现有行程、导出 JSON、自动备份格式保持兼容；改后端不会清空它们。
- 云端同步记录按项目网址隔离，旧 CloudBase 的同步版本不会被当成新 Supabase 的版本。
- 原来在本地 `127.0.0.1` 地址编辑的行程需先从原地址导出，再到线上地址导入。
- CloudBase 账号和数据不会自动迁移到 Supabase，本次不删除原云端资源。
- Free 项目低活跃一周后可能暂停；出发前确认项目正常并在手机同步最新行程，同时保留导出备份。
- 本版不包含离线网页缓存，无法保证断网后重新打开整个网站；已打开页面的本地保存仍然可用。

## 开发验证

`npm ci` 安装开发工具；`npm test` 检查现有功能和真实嵌入式 PostgreSQL 权限/版本行为。

`npm run check:browser` 检查桌面及手机界面、官方 SDK、备份导入导出/恢复，项目尚未配置时也可运行。

`npm run check:online` 验证实际部署地址和真实项目的匿名权限拒绝；配置缺失、函数缺失、错误密钥、CORS 或网络失败都应判定失败。它不代替真实账号的跨设备测试。

官方 SDK 2.119.2 作为本地静态资源分发；更新时运行 `npm run vendor:supabase`。本地网页服务仍无需 npm 运行时依赖。

## 官方参考

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/reference/javascript/initializing
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/users
- https://supabase.com/pricing
