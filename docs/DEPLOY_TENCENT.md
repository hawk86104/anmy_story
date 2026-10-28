# Ubuntu 22.04 宝塔 + EdgeOne Pages 部署

当前部署采用 EdgeOne Pages 前台 + 宝塔后台。本文按当前 GitHub 主分支 `main` 说明；EO 控制台的生产分支也应与实际发布分支一致。

已经部署成功后的版本更新，直接看[第 9 节](#9-已部署站点的版本更新与回滚)。不要重新初始化数据库或账号。

| 部分               | 地址 / 位置                                     |
| ------------------ | ----------------------------------------------- |
| 前台与手机记录界面 | `https://anmy.icegl.cn`，EdgeOne Pages          |
| 后台 REST API      | `https://story.icegl.cn/api`，Ubuntu 宝塔服务器 |
| 家长后台           | `https://story.icegl.cn/admin`                  |
| 数据库             | SQLite，`/www/wwwroot/anmy_story/db/mylife.db`  |
| 图片、视频、录音   | `/www/wwwroot/anmy_story/media`                 |

## 1. 这套部署的数据和请求走向

GitHub `main` 更新 → EdgeOne Pages 自动构建前台。宝塔后台与数据库需要单独更新。

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

3. 用宝塔 Node 版本管理器或现有 Node 管理工具安装 **Node.js 24.18.0**，与本地、CI 和 EO 构建保持一致。以下命令须在该 Node 环境下运行：

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

mkdir -p /www/wwwroot/anmy_story/db
mkdir -p /www/wwwroot/anmy_story/media
mkdir -p /www/wwwroot/anmy_story/backups

# 首次部署创建配置；-n 不覆盖已经存在的 .env。
cp -n deploy/tencent/cms.env.example apps/cms/.env
chmod 600 apps/cms/.env
```

数据库和媒体目录的读写权限要授予运行 CMS / 视频进程的同一部署用户。宝塔面板若选择 `www` 用户运行，目录所有者也应与之对应。代码更新或重新构建不应删除 `/www/wwwroot/anmy_story`。

打开 `apps/cms/.env` 填写：

```dotenv
NODE_ENV=production
PAYLOAD_SECRET=填入一次生成的随机密钥
DATABASE_URL=file:/www/wwwroot/anmy_story/db/mylife.db
MEDIA_ROOT=/www/wwwroot/anmy_story/media
ORIGINALS_ROOT=/www/wwwroot/anmy_story/media-originals
MEDIA_WORKER_LOCK=/www/wwwroot/anmy_story/media-worker.lock
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

这个后台站点不启用静态扩展名缓存规则，不把素材目录直接映射成公开静态路径。`/api`、媒体文件和 `/admin` 都由 Payload / Next.js 提供。数据库与素材不配置为可直读的静态目录。Nginx 配置完成后，运行宝塔的配置检查并重载 Nginx。

对外验证：

```bash
curl -f https://story.icegl.cn/api/health
```

浏览器打开 `https://story.icegl.cn/admin`，使用初始化的家长账号登录。后台 API 与媒体不配置 CDN 强制缓存；身份验证、可见性撤回依赖每次服务端检查。

## 7. 再配置 EdgeOne Pages 前台

在 EO 的 **Pages 项目**里授权访问私有仓库 `hawk86104/anmy_story`，生产分支选 `main`。这是 Pages 的 Git 集成；单独添加普通 EO 加速站点不会自动拉取 GitHub 构建。

| 配置项   | 值                                                                  |
| -------- | ------------------------------------------------------------------- |
| 根目录   | `apps/web`                                                          |
| 框架     | `Next.js`，SSR 模式                                                 |
| 安装命令 | `npm ci --prefix ../..`                                             |
| 构建命令 | `npm run build`                                                     |
| 输出目录 | `.next`                                                             |
| Node     | `24.18.0`，由 `edgeone.json` 与 `.nvmrc` 指定；检查构建日志实际版本 |

根目录只设置工作路径；`npm ci --prefix ../..` 从 `apps/web` 使用仓库根目录的 npm workspaces、锁文件和 `packages/shared`。完整命令配置已放在 `apps/web/edgeone.json`。不要把输出目录设成 `out`，当前前台含服务端渲染；也不要在 EO 调用仓库根的 `npm run build`，该命令会同时构建后台。

`npm run build` 的 `prebuild` 会自动准备 `apps/web/node_modules` 目录。npm workspaces 的依赖实际安装在仓库根目录，而 EO 的 Next.js 适配器在复制已追踪的依赖时还会扫描应用目录；补建该目录解决 `onBuild hook: ENOENT ... scandir .../apps/web/node_modules`。此步骤已随源码提供，控制台构建命令继续使用 `npm run build`。

如果控制台安装命令输入框左侧已经固定显示 `npm`，只在后面的输入框填写 `ci --prefix ../..`；如果输入框要求完整命令，则填写 `npm ci --prefix ../..`。构建日志最终应显示 `[builder] InstallCommand: npm ci --prefix ../..`。不要填写 `cd ../.. && npm ci`，否则补上包管理器前缀后会成为 `npm cd ...`，报 `Unknown command: "cd"`。

构建日志里的实际 Node 版本应为 `v24.18.0`。如果版本不同，先确认部署提交已包含当前版本配置，根目录为 `apps/web`，并清除控制台中与仓库配置冲突的旧命令 / Node 设置，再基于最新提交重新部署。仓库根目录的 `engines.node` 固定为 `24.18.0`；第三方依赖的版本声明与本地实测结果见[验证说明](VALIDATION.md)。

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
- 孩子选择所有人可见并保存，无需家长审批；退出登录后可从公开首页打开完整详情及附件。撤回后刷新公开详情与媒体地址，访问权限同步取消。
- 家长后台删除闲置素材，确认文件被清理；仍被记录使用或正在转码的素材应提示先移除关联或等待处理。

这些检查通过后，再把正式入口交给孩子长期使用。

## 9. 已部署站点的版本更新与回滚

### 9.1 哪部分会自动更新

| 变更                                                                   | 更新位置           | 是否由 EO 自动完成                   |
| ---------------------------------------------------------------------- | ------------------ | ------------------------------------ |
| 首页、时间轴、作品、主题素材、孩子记录界面、`/app/manage` 手机管理界面 | EdgeOne `apps/web` | 推送到已监听的 `main` 后自动构建发布 |
| Payload `/admin`、认证、REST API、AI 调用、视频处理                    | 宝塔 `apps/cms`    | 否，需要拉代码、安装依赖、构建并重启 |
| SQLite 表结构与现有历史转存                                            | 宝塔数据库         | 否，需要执行随版本提交的迁移         |
| 正文、用户、照片、视频、录音、上传原件                                 | 宝塔持久目录       | 保留原目录；不从 Git 或 EO 覆盖      |

因此前台通常不需要手工上传，但仍要确认 EO 构建成功、生产提交正确、接口可用。核对 EO 实际监听的生产分支与本次发布提交一致；仅更新本地代码不会发布站点。GitHub CI 和 EO 各自触发，CI 成功不是 EO 的自动发布门禁。

### 9.2 新功能版本的发布顺序

这次新增了成长主页、项目、长期历史、家庭服务设置，记录增加封面与项目关系，素材增加原件信息；迁移文件为 `20261026_085202_usagi_theme`。原账号和成长内容继续使用，不运行 `setup`、`seed` 或数据库重置。

2026-10-27 的并发保护、历史导入与 PWA 更新没有新增表结构，操作步骤见 [Roadmap 迭代说明](ROADMAP_ITERATION.md)。旧版升级仍需完成下述乌萨奇迁移。

先让宝塔后台支持新接口，再发布依赖它的前台。本轮可按下列顺序操作：

1. 在 EO 项目暂时关闭生产环境的自动部署；旧的成功部署继续服务。不同控制台版本的开关位于 Git 管理或环境管理中。
2. 将已经验证的本次代码提交推送到 `main`，记下提交 SHA。
3. 按 9.3～9.5 升级宝塔，并验证新接口。
4. 在 EO 针对同一提交重新部署前台，检查成功后恢复自动部署；完成 9.6 的验收。

另一种做法是先把提交推到发布分支，宝塔按该提交升级；后台验收通过后再合入 `main`，由 EO 自动发布。纯前端样式更新且接口兼容时，可以直接保留自动部署流程。

### 9.3 宝塔：核对现有路径，停机备份

在宝塔终端使用管理现有 PM2 进程的同一个 Linux 用户，切到原项目目录。逐段执行，任何报错先停止处理，不继续后面的迁移和重启。

```bash
# 后续同一会话中，任一命令报错即停止，先处理错误再继续。
set -e
cd /www/wwwroot/anmy_story
node --version
pm2 status
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin main
git log -1 --oneline origin/main

# 只查看持久目录配置，不输出认证密钥或初始化密码。
grep -E '^(DATABASE_URL|MEDIA_ROOT|ORIGINALS_ROOT|MEDIA_WORKER_LOCK)=' apps/cms/.env
```

Node 应为 `v24.18.0`。如果 Git 显示服务器上有已跟踪文件的本地修改，先保留并合并这些修改，不使用强制重置。后续示例按你当前的 `/www/wwwroot/anmy_story` 路径填写；如果现有 `.env` 指向别处，以真实路径为准，调整下面的变量，**不更改现有 DATABASE_URL 来迁就示例**。

```bash
# 以下变量在同一个终端会话中继续使用。
DB=/www/wwwroot/anmy_story/db/mylife.db
MEDIA=/www/wwwroot/anmy_story/media
ORIGINALS=/www/wwwroot/anmy_story/media-originals
BACKUP=/www/backup/anmy_story/$(date +%Y%m%d-%H%M%S)

# 停止写入与视频处理后，备份数据库、文件、配置和旧提交。
pm2 stop anmy-cms anmy-media
umask 077
mkdir -p "$BACKUP/db"
git rev-parse HEAD > "$BACKUP/code-commit.txt"
cp -a apps/cms/.env "$BACKUP/cms.env"

test -f "$DB" || { echo '数据库路径不存在，停止更新'; exit 1; }
sqlite3 "$DB" ".backup '$BACKUP/db/mylife.db'"
test "$(sqlite3 "$BACKUP/db/mylife.db" 'PRAGMA quick_check;')" = ok || { echo '备份校验失败，停止更新'; exit 1; }
cp -a "$MEDIA" "$BACKUP/media"
if [ -d "$ORIGINALS" ]; then cp -a "$ORIGINALS" "$BACKUP/media-originals"; fi
printf '备份完成：%s\n' "$BACKUP"
```

如果自定义了 `ORIGINALS_ROOT`，上面的 ORIGINALS 也要一致；未配置时默认是 MEDIA_ROOT 加 `-originals`。第一次从旧版升级时没有原件目录是正常情况。备份放在站点之外，包含私密家庭文件和后台密钥，应另存一份并限制访问。仅复制正在写入的 `.db`，或仅备份 Git，都不构成完整备份。

### 9.4 宝塔：拉代码、安装依赖、迁移、构建

确认刚才的备份完成，仍在项目根目录，执行：

```bash
git pull --ff-only origin main
git rev-parse HEAD
npm ci

# NODE_ENV=production 禁止开发模式的自动结构 push。
NODE_ENV=production npm run db:migrate --workspace @mylife/cms

# 这里只构建宝塔后台；前台由 EO 构建。
npm run build --workspace @mylife/cms
```

核对拉取后的 SHA 与准备发布到 EO 的提交一致。迁移日志应包含 `Migrated: 20261026_085202_usagi_theme`；已经执行过的迁移会被跳过，`payload_migrations` 记录执行状态。生产库不要运行 `db:migrate:create`、`migrate:fresh`、`migrate:reset` 或开发服务器。

这次迁移增加表和字段，不删除旧记录；还会转存数据库中目前仍存在的原生历史版本。此前已经被 100 版滚动上限删除的旧历史不能凭空恢复。首次登录后生成默认成长主页，之后可在“我的资料 / 主题”中设置公开称呼、头像与封面。

**现有 `.env`、PAYLOAD_SECRET、数据库和媒体保持原值、原位置。** 不复制本地 `.env` 或本地测试库到服务器，不用模板覆盖正式配置。PAYLOAD_SECRET 还用于加密新版本的 AI 密钥，重新随机生成会使登录失效且已有 AI 密钥无法解密。

本轮无需新增必填配置。若希望明确指定上传原件目录，可只追加这一项，路径所有者与 PM2 用户一致：

```dotenv
ORIGINALS_ROOT=/www/wwwroot/anmy_story/media-originals
```

AI 与原件保留均默认关闭。通过手机家长端 `/app/manage/ai` 配置实际服务地址、模型、密钥并授权后才可主动调用；不把 AI 密钥写到 EO。开启“保留原件”仅影响之后的新上传，不能找回旧版已经清理的原件。

### 9.5 宝塔：重启并验证接口

只有迁移和构建都成功后才启动服务：

```bash
pm2 restart deploy/tencent/ecosystem.config.cjs --update-env
pm2 status
pm2 logs anmy-cms --lines 40 --nostream
pm2 logs anmy-media --lines 40 --nostream
curl -f http://127.0.0.1:3001/api/health
curl -f https://story.icegl.cn/api/health
curl -f https://story.icegl.cn/api/public/profile
curl -f 'https://story.icegl.cn/api/public/projects?limit=1'
pm2 save
```

两个进程都应为 online；后两个接口返回 JSON，空项目列表也正常。已有的 Nginx 反代、域名和 HTTPS 通常不需要重配。本次 AI 请求最长 90 秒、ZIP 流式导出使用现有 300 秒代理读取超时；不要给后台 API 和下载接口加 CDN 强制缓存。整个服务继续使用一个 CMS 实例，不启用 PM2 cluster。

数据库、备份、上传原件和 `.env` 不应直接暴露为网站静态文件。你目前把数据放在仓库路径下，需保留“全路径代理给 Node、无媒体 alias、无静态扩展名直读”的站点配置；不要用宝塔的静态目录浏览来提供这些文件。

### 9.6 EdgeOne：发布同一提交并验收

原有安装 / 构建设置保持第 7 节的值。前台环境变量仍为：

```dotenv
NEXT_PUBLIC_API_ORIGIN=https://story.icegl.cn
NEXT_PUBLIC_CMS_ADMIN_URL=https://story.icegl.cn/admin
CMS_INTERNAL_URL=https://story.icegl.cn
```

在 EO 对这次 `main` 的同一提交重新部署，确认成功、绑定域名仍为 `anmy.icegl.cn`，再恢复生产自动部署。更改 `NEXT_PUBLIC_*` 后需要重新构建；不需要向 EO 上传数据库、媒体或后台密钥。

在仓库根目录执行只读检查：

```bash
node scripts/verify-deployment.mjs \
  --api-origin https://story.icegl.cn \
  --web-origin https://anmy.icegl.cn
```

然后在真实手机检查：

- 旧账号可登录，旧记录、素材和最初表达仍在；编辑旧记录后能查看历史。
- 公开首页、时间轴、作品、里程碑与项目可打开；私密记录仍不出现在公开页面。
- 保存一条测试记录，选择封面与项目，刷新后仍在；公开后游客能看，撤回后游客不能看。
- 家长能进入 `/app/manage`，查看成员、素材、主题和版本；孩子不能进入家长管理功能。
- 视频排队后能完成播放，家长能下载家庭档案 ZIP 并检查 `missing-files.json`。

家庭内容变更由动态 API / SSR 获取，普通写记录不需要再次提交 Git 或重建 EO。AI 未配置真实服务时保持关闭；“程序测试通过”不代表你的付费服务或手机录音权限已经验收。

### 9.7 更新失败与回滚

若安装、迁移或构建失败，先保留错误日志和本轮备份，暂不发布 EO 新前台。迁移失败时不要继续重启新程序；先检查迁移记录和 SQLite 完整性，再决定修复或恢复。

代码回退不会自动回退数据库。尤其不要直接执行这次迁移的 down 来恢复生产，它会删除新表。需要整套回滚且确认可以放弃升级后新增内容时：

1. 停止两个 PM2 进程，并把当前数据库、可能存在的 `-wal` / `-shm` 文件、媒体和原件再备份到另一个目录，保留故障现场。
2. 从 `$BACKUP/code-commit.txt` 确认旧提交。保留服务器本地修改后检出旧提交，使用该提交执行 `npm ci`。
3. 把当前数据库及其 `-wal` / `-shm` 一并移出原目录，再将 `$BACKUP/db/mylife.db` 复制回原 DATABASE_URL；按同一份备份恢复媒体、原件和正式配置，避免把旧库与新文件混用。
4. 以旧代码重新构建 CMS，重启 PM2；验证旧记录和媒体。EO 切回对应的旧成功部署或重新部署旧提交。

若升级后已经产生新记录，先保存新数据，优先修复问题；直接用旧备份覆盖会丢失这些新内容。日常家庭 ZIP 可用于独立家庭内容恢复，命令见 [乌萨奇版本说明](USAGI_ITERATION.md)，它不包含密码和 AI 凭据，不能替代服务器数据库、文件和密钥的一致备份。

目前媒体保存在服务器磁盘。COS、自动服务器发布和定时异地备份仍是独立后续工作。

## 官方依据

- [EO Pages Next.js 支持与 rewrites 限制](https://pages.edgeone.ai/document/framework-nextjs)
- [EO 构建指南与 .nvmrc](https://edgeone.cloud.tencent.com/pages/document/162936788693114880)
- [EO 函数请求体限制](https://pages.edgeone.ai/document/limits-and-quotas)
- [EO 生产分支与自动触发部署](https://edgeone.cloud.tencent.com/pages/document/162936814287618048)
- [Payload 生产迁移](https://payloadcms.com/docs/database/migrations)

你已确认首版在宝塔部署成功。本次实现与迁移在本地隔离环境验证，未连接你的宝塔或 EO 控制台，也未替你更新生产数据。更新后的真实线上状态仍需按本文验收。
