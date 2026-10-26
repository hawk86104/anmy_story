# 运行与部署

## 环境变量

后台配置位于 `apps/cms/.env`，前台位于 `apps/web/.env`。模板是各自的 `.env.example`；生成的配置和 SQLite/媒体目录均被 Git 忽略。

| 变量                      | 用途                                           |
| ------------------------- | ---------------------------------------------- |
| PAYLOAD_SECRET            | 至少 32 位随机认证密钥，正式环境独立配置       |
| DATABASE_URL              | 默认 `file:./data/mylife.db`，相对后台工作目录 |
| MEDIA_ROOT                | 默认后台 `./media`，必须持久化并定期备份       |
| WEB_ORIGIN                | 前台完整源地址，正式环境使用 HTTPS             |
| CMS_ORIGIN                | 后台完整源地址，用于 CORS/CSRF 与管理界面      |
| MAX_UPLOAD_MB             | 单文件上限，默认 100；代理限制须同时不低于此值 |
| VIDEO_TIMEOUT_SECONDS     | 视频单次转码超时，默认 600 秒                  |
| MEDIA_WORKER_LOCK         | 可选，独立媒体进程的锁文件路径                 |
| CMS_INTERNAL_URL          | 前台服务器访问后台的内网源地址                 |
| NEXT_PUBLIC_CMS_ADMIN_URL | 浏览器访问家长后台的完整 URL                   |

`PARENT_*`、`CHILD_*` 仅用于首次账号初始化；没有公开注册入口。第二位家长由现有家长在后台新建用户，系统强制使用当前家庭 ID。

## 正式运行方式

1. 在 Node.js 服务器或容器准备 FFmpeg/FFprobe、持久数据与素材目录。
2. `npm ci`，准备持久目录和后台 `.env`，配置正式域名和密钥。`npm run setup` 是本地起步工具，指定服务器部署可直接使用 `deploy/tencent/cms.env.example`。
3. 先运行 `NODE_ENV=production npm run db:migrate --workspace @mylife/cms` 建表，再运行 `NODE_ENV=production npm run seed` 初始化账号，然后构建。不要在同一数据库混用开发自动 push 与生产迁移；本地开发库不是生产初始化模板。
4. 分别运行 `npm run start --workspace @mylife/cms`、`npm run start --workspace @mylife/web`、`npm run media:worker`，由进程管理器维护。
5. HTTPS 反向代理将前台与后台管理入口映射到配置的域名，保持前台 `/api` 同源。请求体、连接超时与单文件大小配置一致。

当前工程需要 Node.js 进程、可写持久磁盘和 FFmpeg，不是仅靠静态页面托管就能运行的站点。本次交付为私有 GitHub 源码；尚未绑定正式服务器、域名和云存储。部署需要在目标环境运行并验收，不能将本地服务地址视为在线地址。

生产默认不自动推数据库结构。结构修改需通过 Payload 迁移提交；开发期自动 push 只用于本地与隔离测试。请不要在已有数据的生产库上直接尝试破坏性的迁移。

## 备份与边界

本阶段至少备份 SQLite（含一致性处理）与整个媒体目录，密钥另行安全保存；正式部署前应进行一次实际恢复。停机冷备份时可停止三个进程后复制数据库和媒体目录，避免仅复制写入中的 `.db` 文件。自动备份、对象存储和用户导出界面尚未交付。

目前没有配置邮件适配器，也没有密码找回界面；由家长后台管理账号。多实例水平扩展、跨主机任务锁及转码沙箱资源隔离需要下一阶段部署工作，不适用当前 SQLite 单机方案。

本次腾讯云目标的完整顺序见 [Ubuntu 宝塔 + EO Pages 部署](DEPLOY_TENCENT.md)。前台设置 `NEXT_PUBLIC_API_ORIGIN` 后使用带 Cookie 的直连请求，不再通过 EO 函数转发媒体。
