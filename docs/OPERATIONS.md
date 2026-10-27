# 运行与部署

## 环境变量

后台配置位于 `apps/cms/.env`，前台位于 `apps/web/.env`。模板是各自的 `.env.example`；生成的配置和 SQLite/媒体目录均被 Git 忽略。

| 变量                       | 用途                                                    |
| -------------------------- | ------------------------------------------------------- |
| PAYLOAD_SECRET             | 至少 32 位随机认证密钥，正式环境独立配置                |
| DATABASE_URL               | 默认 `file:./data/mylife.db`，相对后台工作目录          |
| MEDIA_ROOT                 | 默认后台 `./media`，必须持久化并定期备份                |
| ORIGINALS_ROOT             | 默认 MEDIA_ROOT 加 `-originals`，私有原件目录，纳入备份 |
| FFMPEG_PATH / FFPROBE_PATH | 可选，转码工具不在 PATH 时指定绝对路径                  |
| SITE_FAMILY_ID             | 可选，多个家庭时指定公开主页的家庭；默认首份主页资料    |
| WEB_ORIGIN                 | 前台完整源地址，正式环境使用 HTTPS                      |
| CMS_ORIGIN                 | 后台完整源地址，用于 CORS/CSRF 与管理界面               |
| MAX_UPLOAD_MB              | 单文件上限，默认 100；代理限制须同时不低于此值          |
| VIDEO_TIMEOUT_SECONDS      | 视频单次转码超时，默认 600 秒                           |
| MEDIA_WORKER_LOCK          | 可选，独立媒体进程的锁文件路径                          |
| CMS_INTERNAL_URL           | 前台服务器访问后台的内网源地址                          |
| NEXT_PUBLIC_CMS_ADMIN_URL  | 浏览器访问家长后台的完整 URL                            |

`PARENT_*`、`CHILD_*` 仅用于首次账号初始化；没有公开注册入口。第二位家长由现有家长在后台新建用户，系统强制使用当前家庭 ID。

## 正式运行方式

1. 在 Node.js 服务器或容器准备 FFmpeg/FFprobe、持久数据与素材目录。
2. `npm ci`，准备持久目录和后台 `.env`，配置正式域名和密钥。`npm run setup` 是本地起步工具，指定服务器部署可直接使用 `deploy/tencent/cms.env.example`。
3. 先运行 `NODE_ENV=production npm run db:migrate --workspace @mylife/cms` 建表，再运行 `NODE_ENV=production npm run seed` 初始化账号，然后构建。不要在同一数据库混用开发自动 push 与生产迁移；本地开发库不是生产初始化模板。
4. 分别运行 `npm run start --workspace @mylife/cms`、`npm run start --workspace @mylife/web`、`npm run media:worker`，由进程管理器维护。
5. HTTPS 反向代理将前台与后台管理入口映射到配置的域名，保持前台 `/api` 同源。请求体、连接超时与单文件大小配置一致。

后台需要 Node.js 进程、可写持久磁盘和 FFmpeg。前台可由 EdgeOne Pages 提供 SSR 与静态资源，数据和媒体继续由宝塔服务。你已确认首版部署成功；新版本仍需按部署文档单独升级后台、运行数据库迁移，之后发布前台并验收。

生产默认不自动推数据库结构。结构修改需通过 Payload 迁移提交；开发期自动 push 只用于本地与隔离测试。请不要在已有数据的生产库上直接尝试破坏性的迁移。

## 备份与边界

备份 SQLite（含一致性处理）、整个媒体目录、上传原件目录与正式配置；密钥另行安全保存。完整快照前停止 CMS 和媒体消费者，使用 SQLite `.backup` 并复制媒体，具体命令见[宝塔更新](DEPLOY_TENCENT.md#9-已部署站点的版本更新与回滚)。不要只复制正在写入的 `.db` 文件。

手机家长端 `/app/manage/ai` 提供 ZIP / JSON 导出。ZIP 解压后可直接阅读 Markdown，并包含记录、项目、可用版本、媒体与缺失报告；不含登录密码及服务密钥。本站档案恢复命令默认只检查，步骤见[本版说明](USAGI_ITERATION.md)。已在临时数据库完成真实 ZIP 导出、解压和重新导入验证，生产环境仍需单独演练。定时异地备份和对象存储尚未接入。

AI 默认关闭。家长填写兼容服务的公网 HTTPS 根地址、模型与密钥并授权后，孩子才能主动使用整理或转写；用户实际服务尚未配置验收。PAYLOAD_SECRET 用于认证和加密服务密钥，更新时保持不变。原件策略只作用于之后的新上传，不会补回已经丢失的旧原件。

目前没有配置邮件适配器，也没有密码找回界面；由家长后台管理账号。多实例水平扩展、跨主机任务锁及转码沙箱资源隔离需要下一阶段部署工作，不适用当前 SQLite 单机方案。

本次腾讯云目标的完整顺序见 [Ubuntu 宝塔 + EO Pages 部署](DEPLOY_TENCENT.md)。前台设置 `NEXT_PUBLIC_API_ORIGIN` 后使用带 Cookie 的直连请求，不再通过 EO 函数转发媒体。

## 本地开发启动与旧开发库修复

在仓库根目录使用 `npm run dev`。它先运行 `dev:prepare` 单独同步开发库，成功后才启动 CMS、前台和媒体进程；三个服务运行期间不再同时自动改表。单独执行 `npm run dev:prepare` 可检查开发库，`npm run media:worker -- --once` 可处理一轮队列后退出。

开发库需要结构变更时，先在数据库旁的 `backups/` 创建 SQLite 在线备份，再执行事务内的同步与记录数量、外键检查；失败回滚。对旧版 Drizzle 表重建中“复制不存在的新列”和“重复创建索引”做了兼容。上次同步留下的空临时表仅在备份后清理；有内容的临时表、数据删除警告、生产模式或带正式迁移记录的库均不会被自动改写。

`serverActions`、`proxyClientMaxBodySize` 的 `Experiments` 属于 Next.js 配置提示。若启动失败，应查看更早的具体错误；媒体进程异常退出会让开发启动器停止其他服务。FFmpeg / FFprobe 缺失只影响视频处理，检查 PATH 或使用相应路径变量。

这套准备流程仅用于本地 SQLite，不能替代宝塔生产迁移，也不用于将生产库直接切换成开发库。
