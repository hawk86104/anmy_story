# Ubuntu 22.04 宝塔 + EdgeOne Pages 部署

本部署适配分支：`deploy/tencent-edgeone-baota`。合并到 `main` 后按本文部署；合并前可检出此分支测试。下列域名按本次确定的值配置。

| 部分               | 地址 / 位置                                        |
| ------------------ | -------------------------------------------------- |
| 前台与手机记录界面 | `https://anmy.icegl.cn`，EdgeOne Pages             |
| 后台 REST API      | `https://story.icegl.cn/api`，Ubuntu 宝塔服务器    |
| 家长后台           | `https://story.icegl.cn/admin`                     |
| 数据库             | SQLite，`/www/server-data/anmy_story/db/mylife.db` |
| 图片、视频、录音   | `/www/server-data/anmy_story/media`                |

## 1. 这套部署的数据和请求走向

GitHub `main` 更新 → EdgeOne Pages 自动构建前台。

浏览器打开 `anmy.icegl.cn`；登录、记录、文件上传与媒体播放直接访问 `story.icegl.cn`。宝塔 Nginx 把后台请求转发给本机 `127.0.0.1:3001`，Payload 读写 SQLite 与素材目录。另一个后台进程执行 FFmpeg 视频处理。

选择直连有两个实际原因：EO 官方目前不支持 Next.js 内置 `rewrites`；函数请求体有大小限制，不适合代理当前 100MB 上限的媒体上传。前台页面与静态资源依然在 EO 部署与分发，视频不经过 EO 函数。

两个 HTTPS 子域都属于 `icegl.cn`。登录 Cookie 保持 `HttpOnly`、`Secure`、`SameSite=Lax`，只绑定后台主机；前台请求使用 `credentials: include`，后台 CORS 精确允许 `https://anmy.icegl.cn`。不需要把令牌放到 LocalStorage，也不需要开放任意 Origin。

EO 默认 `*.edgeone.app` 预览地址与 `story.icegl.cn` 跨站，不能直接用于当前 Cookie 策略下的完整登录验收。先绑定正式前台域名；如需预览登录，另配同主域的预览子域与后台白名单。

## 2. 先准备服务器和 DNS

1. `story.icegl.cn` 的 A 记录指向腾讯云服务器公网 IP。
2. 宝塔准备 Nginx；系统安装 Git、FFmpeg，以及用于备份/检查的 SQLite 命令行工具：

```bash
sudo apt-get update
sudo apt-get install -y git ffmpeg sqlite3
```

3. 用宝塔 Node 版本管理器或现有 Node 管理工具安装 **Node.js 24.22.1+**。不要使用 Ubuntu 默认仓库中的旧版 Node。以下命令须在该 Node 环境下运行：

```bash
node --version
npm --version
ffmpeg -version
ffprobe -version
npm install -g pm2
```

应用由 PM2 管理，宝塔负责 Nginx、域名与 HTTPS。

## 3. 拉取代码并配置持久目录

先为这台服务器配置 GitHub 仓库的只读 Deploy Key，再拉取私有仓库。不要把私钥或访问令牌写入 Git URL。

```bash
git clone git@github.com:hawk86104/anmy_story.git /www/wwwroot/anmy_story
cd /www/wwwroot/anmy_story
npm ci

mkdir -p /www/server-data/anmy_story/db
mkdir -p /www/server-data/anmy_story/media
mkdir -p /www/server-data/anmy_story/backups

# 首次部署创建配置；-n 不覆盖已经存在的 .env。
cp -n deploy/tencent/cms.env.example apps/cms/.env
chmod 600 apps/cms/.env
```

数据库和媒体目录的读写权限要授予运行 CMS / 视频进程的同一部署用户。宝塔面板若选择 `www` 用户运行，目录所有者也应与之对应。代码更新或重新构建不应删除 `/www/server-data/anmy_story`。

打开 `apps/cms/.env` 填写：

```dotenv
NODE_ENV=production
PAYLOAD_SECRET=填入一次生成的随机密钥
DATABASE_URL=file:/www/server-data/anmy_story/db/mylife.db
MEDIA_ROOT=/www/server-data/anmy_story/media
MEDIA_WORKER_LOCK=/www/server-data/anmy_story/media-worker.lock
WEB_ORIGIN=https://anmy.icegl.cn
CMS_ORIGIN=https://story.icegl.cn
MAX_UPLOAD_MB=100
VIDEO_TIMEOUT_SECONDS=600
```

`openssl rand -hex 32` 可生成随机密钥。正式密钥生成后要持续保存，不要在每次更新时重新生成；它只放在后台，不填到 EO 前台。

同一个文件中再填写首次初始化使用的 `PARENT_EMAIL`、`PARENT_PASSWORD`、`CHILD_EMAIL`、`CHILD_PASSWORD`。两组邮箱不同，密码至少 12 位且不同。完成初始化后可删除这几个初始化密码配置，保留账号记录与正式密钥。

## 4. 初始化数据库，再建立账号

当前数据库是 **SQLite 文件**，由 Payload 的 SQLite 适配器读写。没有数据库端口、数据库服务或 MySQL 用户要新建。安装 `sqlite3` 命令行工具是为了检查、备份，不是启动另一个服务。

在仓库根目录按以下顺序执行：

```bash
NODE_ENV=production npm run db:migrate --workspace @mylife/cms
NODE_ENV=production npm run seed
npm run build --workspace @mylife/cms
```

先建表再建账号。不要在生产目录运行 `npm run dev` 触发开发模式的自动结构 push。数据库只保存账号、记录、关系、版本和文件元信息；图片/视频的文件本体在独立素材目录。

SQLite 适合当前一个家庭、一个 CMS 实例的阶段。不要使用 PM2 cluster 启动多个 CMS 实例。后续若需要多实例或更大协作规模，可规划 PostgreSQL 迁移；不能只把当前 `DATABASE_URL` 换成 MySQL 地址。

## 5. 启动后台与视频处理进程

```bash
pm2 start deploy/tencent/ecosystem.config.cjs
pm2 status
pm2 logs anmy-cms --lines 30
pm2 logs anmy-media --lines 30
pm2 save
pm2 startup
```

按 `pm2 startup` 打印的命令完成系统开机启动配置。应看到两个进程：`anmy-cms`（后台）与 `anmy-media`（转码消费者）。`.env`、SQLite、素材和锁文件路径均固定，两个进程都在 `apps/cms` 工作目录运行。

本机先验证：

```bash
curl -f http://127.0.0.1:3001/api/health
```

期望返回 `{"ok":true,"app":"mylife-cms"}`。

## 6. 宝塔配置 story.icegl.cn 与 HTTPS

在宝塔创建 `story.icegl.cn` 站点，申请并启用 HTTPS。应用统一反向代理到 `http://127.0.0.1:3001`，保留宝塔证书验证与续期配置。参考 [Nginx 配置片段](../deploy/tencent/nginx-cms.conf)：上传上限设为 110MB，请求正文与转发超时覆盖上传过程。

这个后台站点不启用静态扩展名缓存规则，不把素材目录直接映射成公开静态路径。`/api`、媒体文件和 `/admin` 都由 Payload / Next.js 提供。数据库目录始终在网站目录之外。Nginx 配置完成后，运行宝塔的配置检查并重载 Nginx。

对外验证：

```bash
curl -f https://story.icegl.cn/api/health
```

浏览器打开 `https://story.icegl.cn/admin`，使用初始化的家长账号登录。后台 API 与媒体不配置 CDN 强制缓存；身份验证、可见性撤回依赖每次服务端检查。

## 7. 再配置 EdgeOne Pages 前台

在 EO 的 **Pages 项目**里授权访问私有仓库 `hawk86104/anmy_story`，生产分支选 `main`。这是 Pages 的 Git 集成；单独添加普通 EO 加速站点不会自动拉取 GitHub 构建。

| 配置项   | 值                                                     |
| -------- | ------------------------------------------------------ |
| 根目录   | `apps/web`                                             |
| 框架     | `Next.js`，SSR 模式                                    |
| 安装命令 | `cd ../.. && npm ci`                                   |
| 构建命令 | `npm run build`                                        |
| 输出目录 | `.next`                                                |
| Node     | `apps/web/.nvmrc` 指定的 24.22.1，检查构建日志实际版本 |

根目录只设置工作路径；安装命令回到仓库根目录以使用 npm workspaces、根锁文件和 `packages/shared`。配置已放在 `apps/web/edgeone.json`。不要把输出目录设成 `out`，当前前台含服务端渲染；也不要在 EO 调用仓库根的 `npm run build`，该命令会同时构建后台。

在 EO 项目设置中加入 [前台环境变量](../deploy/tencent/web.env.example)：

```dotenv
NEXT_PUBLIC_API_ORIGIN=https://story.icegl.cn
NEXT_PUBLIC_CMS_ADMIN_URL=https://story.icegl.cn/admin
CMS_INTERNAL_URL=https://story.icegl.cn
```

`NEXT_PUBLIC_*` 会在构建时写入浏览器代码，修改后要重新构建部署。EO 不需要 SQLite 文件、数据库权限或 `PAYLOAD_SECRET`。`.nvmrc` 是构建用 Node 版本；函数运行时的适配仍由 EO 管理。

添加自定义域名 `anmy.icegl.cn`，将它的 CNAME 配成 EO 控制台给出的目标，再启用 HTTPS。生产环境验收使用 `https://anmy.icegl.cn`。

首次 EO 部署仍需观察真实平台的构建与运行日志：仓库检查不能代替 EO 平台的实际部署验收。

## 8. 联调验收

可先运行只读检查，不会创建或修改任何成长记录：

```bash
node scripts/verify-deployment.mjs \
  --api-origin https://story.icegl.cn \
  --web-origin https://anmy.icegl.cn
```

然后用实际手机完成：

- 从前台登录孩子账号，写文字、传图片、保存后刷新，记录仍在。
- 上传一段 20MB 以上且不超过 100MB 的视频。浏览器网络请求目的地应为 `story.icegl.cn/api/media`，随后看到排队、处理与播放结果。
- 录音、播放，刷新后确认原音频仍可访问。
- 退出登录；未登录浏览器不能读取家庭记录和私人媒体地址。
- 申请公开、家长批准；撤回后刷新公开页与媒体地址，访问权限同步取消。

这些检查通过后，再把正式入口交给孩子长期使用。

## 9. 以后的自动发布与备份

前台：合并到 `main` 后，由 EO Git 集成自动部署。GitHub CI 和 EO 的 Git 构建默认各自触发；CI 全绿不会自动成为 EO 发布的门禁。建议把 `main` 配置为需 PR 和通过 CI 才能合并。

后台：EO 不会自动更新宝塔上的 Node 进程。初期先手动维护，涉及表结构或 API 改动时先备份、部署兼容后台，再发布依赖新接口的前台；后续可单独接 GitHub Actions 的受控服务器发布。

更新时保留正式 `.env`、密钥和所有 `/www/server-data/anmy_story` 文件。先暂停后台和媒体进程，做一次数据库与素材的一致备份，再拉取已审核代码、`npm ci`、执行迁移、构建 CMS、重启两个进程。代码回滚不代表数据库迁移自动回滚。

定期备份数据库、媒体目录，以及单独保存的正式密钥/配置。SQLite 可用 `.backup` 创建一致数据库副本；如果需要整套数据和媒体的一致快照，应暂停写入再备份，之后验证可恢复。

目前媒体保存在服务器磁盘。接入腾讯云 COS 是下一步独立工作，需要存储适配器及私人文件授权，不能直接照普通公开博客把整个桶设为公共读取。

## 官方依据

- [EO Pages Next.js 支持与 rewrites 限制](https://pages.edgeone.ai/document/framework-nextjs)
- [EO 构建指南与 .nvmrc](https://edgeone.cloud.tencent.com/pages/document/162936788693114880)
- [EO 函数请求体限制](https://pages.edgeone.ai/document/limits-and-quotas)

本次未连接宝塔、未修改 DNS、未创建或发布真实 EO 项目。上述外部状态要在目标环境操作后验证。
