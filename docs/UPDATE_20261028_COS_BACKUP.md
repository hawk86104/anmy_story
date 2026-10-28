# 本次更新：本地测试与宝塔升级步骤

适用版本：2026-10-28 的 COS 日期目录、清空资料、完整 ZIP 备份与整体还原。

当前部署分工：前台 `https://anmy.icegl.cn` 由 EdgeOne Pages 发布；后台 `https://story.icegl.cn`、SQLite 和视频消费者由宝塔维护。下面按服务器项目目录 `/www/wwwroot/anmy_story`、PM2 名称 `anmy-cms` / `anmy-media` 编写，执行前核对实际路径和进程名。

编写本文时，本地分支为 `feat/roadmap-reliability`，本次修改尚未提交。推荐顺序是：本地测试 → 提交并推送功能分支 → 宝塔部署该提交 → 后台验收 → 合入 EO 生产分支并发布前台。本文仅提供步骤，没有执行线上更新。

## 一、本地日常调试

### 1. 安装依赖并启动

先在原启动终端按 `Ctrl+C` 停止已有开发服务，再打开 PowerShell：

```powershell
Set-Location D:\anmy\anmy_story
node --version
npm ci
npm run typecheck
npm test
npm run dev
```

Node 沿用 `24.18.0`。`npm ci` 用于首次拿到本次更新或依赖变化时；日常改代码直接运行 `npm run dev`。已有本地账号和资料继续使用，不需要重新 `setup` 或 `seed`。

`npm run dev` 会依次准备本地开发库，再启动前台、CMS 和视频处理。开发库结构由 `dev:prepare` 同步，变更前会备份数据库；已有正式迁移记录的生产库不使用这套开发同步。

| 入口 | 地址 |
| --- | --- |
| 前台 | http://localhost:3000 |
| 家长设置、备份与清空 | http://localhost:3000/app/manage/settings |
| AI 与保留原件设置 | http://localhost:3000/app/manage/ai |
| Payload 后台 | http://localhost:3001/admin |

本地 `apps/cms/.env` 已配置真实 COS。前台本地配置应指向本地 CMS；请参照 `apps/web/.env.example`，避免把本地操作发往正式后台。

视频处理需要 FFmpeg/FFprobe。若视频失败提示找不到工具，检查 PATH 或 `.env` 的 `FFMPEG_PATH` / `FFPROBE_PATH`，修正后重启整个开发服务。

### 2. 独立检查 COS/CDN

另开 PowerShell，在同一仓库执行：

```powershell
Set-Location D:\anmy\anmy_story\apps\cms
node --import tsx src/scripts/check-storage.ts
```

这会上传一个随机验证文件，校验后删除。成功输出应包含：

```json
{
  "uploadAndHead": true,
  "downloadHashMatches": true,
  "cdnStatus": 200,
  "cdnBytesMatch": true,
  "cdnRangeStatus": 206,
  "cdnRangeMatches": true,
  "unsignedStatus": 403,
  "unsignedDenied": true
}
```

无签名访问 403 是正常结果。若带签名访问失败，先检查服务端 COS 配置、CDN 查询参数透传和回源 Host，再继续迁移。

### 3. 本地目前有一条已知缺失资料

此前已将 15 份本地素材上传 COS 并清理本地副本。录音 #6 `我的声音-1792990933207.webm` 在改动前就缺少实际文件，记录仍保留。

查看 `apps/cms/data/media-migration-report.json`。当前真实家庭导出的 ZIP 会在 `missing-files.json` 列出该录音，补齐前不能整体还原该包。它不影响用下面的新测试库演练完整流程。

## 二、用临时数据库测试上传、清空和整体还原

**清空按整个家庭执行。只增加一个“测试成员”仍属于原家庭，不能用于隔离。请使用下面的新数据库和新上传的测试文件。** 本地与正式环境共用 COS 时，也应避免用真实家庭库演练删除。

### 1. 启动一套临时测试资料

停止原开发服务。新开一个 PowerShell 窗口，以下命令都在这个窗口执行：

```powershell
Set-Location D:\anmy\anmy_story
$qaStamp = Get-Date -Format 'yyyyMMdd-HHmmss'

$env:NODE_ENV = 'development'
$env:MYLIFE_MANAGED_SCHEMA = 'true'
$env:DATABASE_URL = "file:./data/cos-qa-$qaStamp.db"
$env:MEDIA_ROOT = "./.tmp/cos-qa-$qaStamp/media"
$env:ORIGINALS_ROOT = "./.tmp/cos-qa-$qaStamp/originals"
$env:MEDIA_WORKER_LOCK = "./data/cos-qa-$qaStamp-worker.lock"
$env:BACKUP_TEMP_ROOT = "./.tmp/cos-qa-$qaStamp/backups"
$env:MEDIA_STORAGE = 'cos'
$env:WEB_ORIGIN = 'http://localhost:3000'
$env:CMS_ORIGIN = 'http://localhost:3001'
$env:CMS_INTERNAL_URL = 'http://localhost:3001'
$env:NEXT_PUBLIC_API_ORIGIN = ''
$env:NEXT_PUBLIC_CMS_ADMIN_URL = 'http://localhost:3001/admin'
$env:PAYLOAD_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"

$env:PARENT_EMAIL = 'qa-parent@example.invalid'
$env:PARENT_PASSWORD = 'LocalParent-20261028!'
$env:PARENT_NAME = '测试家长'
$env:CHILD_EMAIL = 'qa-child@example.invalid'
$env:CHILD_PASSWORD = 'LocalChild-20261028!'
$env:CHILD_NAME = '测试孩子'

npm run dev:prepare
npm run seed
npm run dev
```

环境变量只作用于这个窗口及其启动的进程，不改真实 `.env`。`seed` 在这里仅初始化新测试库。用无痕窗口打开 `http://localhost:3000/login`，使用上面的测试账号登录。测试文件选几张普通图片、一段短视频、一份 PDF 和一段录音即可。

### 2. 按顺序验收

| 顺序 | 操作 | 应看到的结果 |
| --- | --- | --- |
| 1 | 孩子新建记录，上传图片、视频、录音和 PDF | 保存、刷新后附件仍可用；视频从排队变为可播放 |
| 2 | 将记录的“发生日期”改为过去，再上传附件 | COS 目录仍按记录创建日期，采用上海时区；发生日期不决定目录 |
| 3 | 在 COS 查看新文件，并检查本地测试目录 | 对象位于 `media/YYYY-MM-DD/`；处理完成后本地不保留附件副本 |
| 4 | 打开记录详情、首页、时间轴、素材库；上传头像、主页封面、项目封面 | 图片正常，视频和录音可播放；最终文件访问域名为 `anmy-story.icegl.cn` |
| 5 | 家长开启“保留上传原件”，再新传一张图片或视频 | COS 日期目录下有 `originals/`；家长能下载原件，孩子不能下载原件 |
| 6 | 建一个项目、修改主题和主页资料，编辑记录留下历史 | 记下记录、项目、素材数量及设置，供还原时对照 |
| 7 | 公开一条记录，退出登录后以游客查看；重新登录撤回，再退出验证 | 公开时游客可读；撤回后重新请求公开详情应返回不可查看 |
| 8 | 家长从设置页下载 ZIP，解压检查 | 有 `archive.json`、`entries/`、`media/`、可选的 `originals/`；`missing-files.json` 为 `[]` |
| 9 | 选择刚才 ZIP，点击“预检备份” | 显示正确的记录、素材、项目数量；预检本身不替换资料 |
| 10 | 在测试库输入“清空所有历史记录以及素材”后执行 | 记录、历史、项目和附件删除，主页图片移除；账号、主页文字、主题、服务设置保留 |
| 11 | 检查 COS 对应测试对象 | 对象被删除；若提示待清理，可点击重试，或等媒体消费者重试 |
| 12 | 重新选择 ZIP 预检，输入“还原整体备份”执行 | 记录、附件、项目、主页、主题、设置及可用历史恢复；公开范围沿用备份 |
| 13 | 用孩子账号访问家长管理入口 | 清空、备份和还原等管理操作不可用 |

两条确认文字要完整输入，不包含引号和多余空格。预检令牌 30 分钟有效，过期就重新预检。还原后从列表重新进入记录，编号可能重新分配。

CDN 已签发的访问链接有效期为 1 小时。撤回公开时以重新请求页面和公开 API 为准；旧签名在有效期内仍可能访问文件。

### 3. 测试结束恢复日常调试

可最后再清空一次临时测试家庭，清理本轮上传的测试对象。然后按 `Ctrl+C` 停止服务，关闭这个 PowerShell 窗口和无痕窗口。新开普通 PowerShell：

```powershell
Set-Location D:\anmy\anmy_story
npm run dev
```

此时重新使用真实 `.env` 的本地开发库。需要验证生产构建时，先停止开发服务，再在普通窗口运行 `npm run build`，成功后重新 `npm run dev`。

## 三、先提交本次代码，暂不发布 EO 生产前台

编写本文时本地分支是 `feat/roadmap-reliability`。核对后提交本次修改，使用你平时的 Git / SourceTree 推送这个功能分支。确认提交里没有 `.env`、数据库、上传素材和下载的备份 ZIP。记下提交 SHA。

```powershell
git branch --show-current
git status --short
git diff --check
git add README.md package.json package-lock.json apps/cms apps/web packages/shared deploy/tencent docs
git diff --cached --stat
```

核对暂存文件均为本次源码和文档后，再执行提交及推送（也可通过 SourceTree 完成）：

```powershell
git commit -m "feat: COS media storage and full backup restore"
git push -u origin feat/roadmap-reliability
git rev-parse HEAD
```

下面先让宝塔运行这个提交，后台通过后再合入 `main`。先核对 EO 当前生产分支确为 `main`；如果它已经监听本功能分支，需要先暂缓其生产发布。EO 的 Git 推送与生产分支发布机制见[官方部署说明](https://edgeone.cloud.tencent.com/pages/document/162936814287618048)。

## 四、宝塔后台升级

### 1. 核对进程、目录和待发布版本

使用管理现有 PM2 的同一个 Linux 用户，后续命令在同一终端逐段执行。每一步成功后再继续；`set -e` 会在命令失败时停止这次终端会话。

```bash
set -e
cd /www/wwwroot/anmy_story
node --version
pm2 status
git status --short
test -z "$(git status --porcelain --untracked-files=no)" || { echo '服务器有未提交的源码修改，先保留并处理。'; exit 1; }
git rev-parse HEAD
git fetch origin feat/roadmap-reliability
RELEASE_SHA=$(git rev-parse FETCH_HEAD)
git show --no-patch --oneline "$RELEASE_SHA"
grep -E '^(DATABASE_URL|MEDIA_ROOT|ORIGINALS_ROOT|MEDIA_WORKER_LOCK)=' apps/cms/.env
```

Node 应为 `v24.18.0`。待发布 SHA 应与本地确认的提交一致。若服务器有源代码改动，先保存并处理；不覆盖正式 `.env`、数据库或素材目录。下面备份变量按现有部署模板填写，必须与实际 `.env` 一致。

### 2. 等视频处理完成，停机并备份

先暂停新上传，等排队/处理中的视频完成。停止应用后，前台的动态接口会暂时不可用；在维护窗口内操作。

```bash
DB=/www/wwwroot/anmy_story/db/mylife.db
MEDIA=/www/wwwroot/anmy_story/media
ORIGINALS=/www/wwwroot/anmy_story/media-originals
BACKUP=/www/backup/anmy_story/$(date +%Y%m%d-%H%M%S)

pm2 stop anmy-cms anmy-media
umask 077
mkdir -p "$BACKUP/db"
git rev-parse HEAD > "$BACKUP/code-commit.txt"
printf '%s\n' "$RELEASE_SHA" > "$BACKUP/release-commit.txt"
cp -a apps/cms/.env "$BACKUP/cms.env"

test -f "$DB"
sqlite3 "$DB" ".backup '$BACKUP/db/mylife.db'"
test "$(sqlite3 "$BACKUP/db/mylife.db" 'PRAGMA quick_check;')" = ok
echo '数据库备份 quick_check 通过'
cp -a "$MEDIA" "$BACKUP/media"
if [ -d "$ORIGINALS" ]; then cp -a "$ORIGINALS" "$BACKUP/media-originals"; fi
printf '本轮备份目录：%s\n' "$BACKUP"
```

必须看到 `quick_check 通过`。记下最后输出的备份目录，确认备份文件存在再继续。若素材目录已不存在，先核实此前是否已全部迁云，不把路径错误当作备份成功。服务器没有 `sqlite3` 时，先通过宝塔终端安装系统的 SQLite 命令行工具。

如果中途重新打开终端，先恢复 `DB`、`MEDIA`、`ORIGINALS`、`BACKUP`、`RELEASE_SHA` 变量：`BACKUP` 使用已经记录的本轮备份目录，`RELEASE_SHA` 使用已核对的目标提交。保留原备份，再继续剩余步骤。

这份停机前备份很重要：后面的素材迁移成功后会删除服务器本地附件。若此前已有 COS 素材，数据库/配置备份还需与可用的云端对象一起保管。

### 3. 更新代码和依赖

```bash
git switch --detach "$RELEASE_SHA"
git rev-parse HEAD
npm ci
```

服务器现在运行核对过的固定提交。任一步失败先停止，不继续迁移或启动应用。

### 4. 在正式 `.env` 中追加 COS 配置

编辑 `/www/wwwroot/anmy_story/apps/cms/.env`，补齐以下项。两项凭据填你提供的真实值；如果已经有同名项，直接修改现有项。

```dotenv
MEDIA_STORAGE=cos
COS_APP_ID=100000838747
COS_SECRET_ID=填写真实SecretId
COS_SECRET_KEY=填写真实SecretKey
COS_BUCKET=anmy-story-1253949117
COS_REGION=ap-nanjing
COS_DOMAIN=anmy-story-1253949117.cos.ap-nanjing.myqcloud.com
COS_CDN_ORIGIN=https://anmy-story.icegl.cn
MAX_BACKUP_MB=1024
MAX_BACKUP_EXPANDED_MB=4096
```

保持正式 `PAYLOAD_SECRET`、`DATABASE_URL`、`MEDIA_ROOT`、`ORIGINALS_ROOT`、正式域名与原有 AI 配置不变。现有 `MEDIA_ROOT` 和 `ORIGINALS_ROOT` 是迁移时查找旧文件的依据。HTTPS 和 Host 签名已在代码中配置，无需另填 PHP 的 `schema` / `signHost` 字段。COS 凭据只配在宝塔后台，不放到 EO 前台环境变量。

保存后，确认 `.env` 仍由实际运行用户读取，并限制文件权限：

```bash
chmod 600 apps/cms/.env
```

### 5. 正式迁移数据库，构建后台

```bash
NODE_ENV=production npm run db:migrate --workspace @mylife/cms
sqlite3 "$DB" 'SELECT name,batch FROM payload_migrations ORDER BY id;'
NODE_ENV=production npm run build --workspace @mylife/cms
```

迁移清单应包含 `20261028_021906_media_cos_backup`；执行过的迁移会跳过。它新增媒体存储位置字段和持久清理队列。生产环境执行仓库已有迁移，参考 [Payload 迁移说明](https://payloadcms.com/docs/database/migrations)。

**宝塔升级不执行 `setup`、`seed`、`dev:prepare` 或 `npm run dev`；不执行重置数据库、fresh、reset 或手动删表。** 构建成功后再继续。

### 6. 验证服务器 COS，再迁移服务器旧附件

```bash
cd /www/wwwroot/anmy_story/apps/cms
NODE_ENV=production node --import tsx src/scripts/check-storage.ts
cd /www/wwwroot/anmy_story

# 先预览：不上传或删除旧文件。
NODE_ENV=production npm run media:migrate
```

COS 检查应与本地成功结果一致。预览确认目录正确，且无缺失文件、无排队/处理中素材后，再执行：

```bash
NODE_ENV=production npm run media:migrate -- --apply
cat apps/cms/data/media-migration-report.json
```

每个文件依次上传、读回核对 SHA-256、提交数据库新位置，然后删除服务器本地副本。报告要求 `pending: 0`、`missing: []`；`migrated` 是本次实际迁移数，已迁云的记录会跳过，重复执行时可以为 0。

若有 `missing`，脚本会以非零退出，且可能已经迁移了其余可用文件。保留报告并找回相应原文件，再预览和迁移；不要重置数据库或把非零状态当作全部回滚。本地 #6 的缺失不代表服务器一定缺失，以服务器报告为准。

若 `pending` 大于 0，旧视频还在排队/处理中：先完成队列处理，再重跑迁移并核对报告。迁移步骤需要在服务器执行，本地已迁移 15 份不等于服务器已迁移。

### 7. 更新 Nginx 的备份请求限制

在宝塔网站 `story.icegl.cn` 的现有配置中，按仓库 `deploy/tencent/nginx-cms.conf` 修改这些项，保留原证书和反代配置：

```nginx
# server 块
client_max_body_size 1100m;
client_body_timeout 600s;

# 原 location / 块内
proxy_read_timeout 1800s;
proxy_send_timeout 600s;
proxy_request_buffering off;
proxy_buffering off;
proxy_cache off;
```

通过宝塔的 Nginx 配置检查后重载。后台 API、下载和带签名的素材访问遵循 no-store，CDN 回源保留查询参数与 Range。普通附件上限仍由 `MAX_UPLOAD_MB` 控制。

1024 MB 是备份上传配置上限；大包还原还需要足够内存。仓库当前 CMS 的 PM2 内存重启阈值为 1G，先用小备份验收，大包操作前评估服务器内存及进程限制。

### 8. 重启并检查宝塔服务

```bash
cd /www/wwwroot/anmy_story
pm2 restart deploy/tencent/ecosystem.config.cjs --update-env
pm2 status
pm2 logs anmy-cms --lines 40 --nostream
pm2 logs anmy-media --lines 40 --nostream
curl -f http://127.0.0.1:3001/api/health
curl -f https://story.icegl.cn/api/health
pm2 save
```

两个进程都应为 online。`--update-env` 用于更新 PM2 的环境参数，见 [PM2 说明](https://pm2.keymetrics.io/docs/usage/process-management/)。媒体消费者要保持运行，负责视频转码、重试文件清理和清理过期的备份临时文件。

先访问 `https://story.icegl.cn/admin`，用已有家长账号登录，确认备份与清空区域出现、旧记录与附件可读。正式家庭只检查按钮和下载，不执行清空或整体还原。

## 五、再发布 EO 前台

宝塔检查通过后，在本地普通 PowerShell 合入生产分支：

```powershell
Set-Location D:\anmy\anmy_story
git switch main
git pull --ff-only origin main
git merge --ff-only feat/roadmap-reliability
git push origin main
git rev-parse HEAD
```

如果不能快进合并，先处理分支差异、重新验证发布提交，再继续；不强行重置分支。需要保持 EO 和宝塔运行同一份确认过的代码。

EO 项目按当前仓库配置：

| 项目项 | 值 |
| --- | --- |
| 根目录 | `apps/web` |
| Node | `24.18.0` |
| 安装命令 | `npm ci --prefix ../..` |
| 构建命令 | `npm run build` |
| 输出目录 | `.next` |

前台环境变量保持：

```dotenv
NEXT_PUBLIC_API_ORIGIN=https://story.icegl.cn
NEXT_PUBLIC_CMS_ADMIN_URL=https://story.icegl.cn/admin
CMS_INTERNAL_URL=https://story.icegl.cn
```

确认 EO 对新 `main` 提交构建、发布成功，生产域名仍为 `anmy.icegl.cn`。如果没有自动触发，在部署记录中针对目标提交重新部署。只推代码或只看到 GitHub CI 成功，都不等于 EO 已发布成功。

## 六、正式域名验收与回滚

在仓库根目录执行只读接口检查：

```bash
node scripts/verify-deployment.mjs --api-origin https://story.icegl.cn --web-origin https://anmy.icegl.cn
```

之后在电脑和手机上检查：旧账号登录、旧记录和头像封面、图片/视频/录音播放、新上传经 CDN 可读、家长设置入口、孩子管理权限，以及实际 ZIP 的 `missing-files.json`。清空和整体还原继续使用隔离环境演练。

如果更新失败，先保持新前台未发布，保存错误日志。需要整套回滚时：

1. 停止 `anmy-cms` 和 `anmy-media`，另备份故障时的数据库、WAL/SHM、附件和 `.env`，保留新增资料。
2. 从本轮 `$BACKUP/code-commit.txt` 取得旧提交，切回该提交并安装对应依赖。
3. 把当前数据库及其 `-wal` / `-shm` 移至故障备份目录，再按本轮停机备份恢复数据库、`media`、原件目录和 `.env`。迁移曾删除本地附件，因此只退代码不能恢复旧站。
4. 构建旧 CMS，重启两个 PM2 进程并验证；EO 切回对应的旧成功部署。

上线后若已产生新记录，先保存新数据再选择修复或回滚，直接覆盖旧备份会丢失新增内容。不要用迁移 down 代替完整回滚；COS 中的对象先保留，避免破坏其他仍在使用它们的环境。
