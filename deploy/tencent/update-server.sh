#!/usr/bin/env bash
# 更新现有宝塔后台；不初始化数据库，也不处理前台发布。
set -Eeuo pipefail
umask 077

# Git 合并可能更新本脚本；先把当前脚本装入内存，避免执行中途读取到新内容。
if [[ "${ANMY_UPDATE_LOADED:-}" != "1" ]]; then
  script_text="$(cat -- "$0")"
  export ANMY_UPDATE_LOADED=1
  exec bash -c "$script_text" "$0" "$@"
fi
unset ANMY_UPDATE_LOADED

# 支持从仓库内执行，也支持在仓库目录中运行下载到 /tmp 的引导脚本。
PROJECT_DIR="${PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || (cd -- "$(dirname -- "$0")/../.." && pwd -P))}"
BACKUP_ROOT="${BACKUP_ROOT:-/www/backup/$(basename -- "$PROJECT_DIR")}"
MEDIA_DRAIN_TIMEOUT_SECONDS="${MEDIA_DRAIN_TIMEOUT_SECONDS:-900}"
MEDIA_DRAIN_INTERVAL_SECONDS="${MEDIA_DRAIN_INTERVAL_SECONDS:-5}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-}"

mkdir -p -- "$BACKUP_ROOT/logs"
LOG_FILE="$BACKUP_ROOT/logs/update-$(date +%Y%m%d-%H%M%S)-$$.log"
exec > >(tee -a -- "$LOG_FILE") 2>&1

step="初始化"
backup_dir=""
old_sha=""
target_sha=""
cms_stopped=0
media_stopped=0
changes_started=0
next_env_needs_restore=0

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "错误：$*"; return 1; }
next_env_paths_only() {
  node -e '
    const fs = require("node:fs");
    const read = (p) => fs.readFileSync(p === "-" ? 0 : p, "utf8");
    const dirs = new Set([".next", process.argv[3] || ".next"]);
    const normalize = (s) => s.replace(/\r\n/g, "\n").replace(/^(import ["\x27])(\.\/[^"\x27\r\n]+\/types\/(routes|root-params)\.d\.ts)(["\x27];?)$/gm,
      (whole, start, path, kind, end) => [...dirs].some((dir) => path === `./${dir}/types/${kind}.d.ts` || path === `./${dir}/dev/types/${kind}.d.ts`) ? `${start}NEXT_GENERATED_TYPE_${kind}${end}` : whole);
    if (normalize(read(process.argv[1])) !== normalize(read(process.argv[2]))) process.exitCode = 1;
  ' "$1" "$2" "${3:-.next}"
}

# PM2 可能把版本提示写到 jlist 的标准输出，不能直接当作 JSON。
# 只移除已知的版本提示；其他输出或无效数据仍报错，避免泄露进程环境变量。
pm2_jlist() {
  if pm2 jlist | node -e '
    const fs = require("node:fs");
    const output = fs.readFileSync(0, "utf8").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const banner = /(?:^|\r?\n)[ \t]*>>>>[ \t]+In-memory PM2 is out-of-date, do:[ \t]*\r?\n[ \t]*>>>>[ \t]+\$ pm2 update[ \t]*\r?\n[ \t]*In memory PM2 version:[^\r\n]*\r?\n[ \t]*Local PM2 version:[^\r\n]*(?:\r?\n|$)/g;
    let warnings = 0;
    const json = output.replace(banner, () => { warnings++; return "\n"; }).trim();
    let processes;
    try { processes = JSON.parse(json); } catch {
      console.error("错误：PM2 进程列表不是有效的 JSON，未输出可能包含密钥的原始内容。");
      process.exit(1);
    }
    if (!Array.isArray(processes)) {
      console.error("错误：PM2 进程列表不是 JSON 数组。");
      process.exit(1);
    }
    if (warnings) console.error("警告：PM2 守护进程与当前 PM2 命令的版本不同；已识别版本提示，继续核对进程。不会自动更新 PM2。");
    process.stdout.write(JSON.stringify(processes));
  '; then
    return 0
  fi
  printf '%s\n' '错误：无法读取 PM2 进程列表，请检查 PM2 状态；不会输出原始进程数据。' >&2
  return 1
}

on_error() {
  local code="$1" line="$2"
  trap - ERR INT TERM
  set +e
  log "更新失败：步骤「$step」，行 $line，退出码 $code。"
  log "日志：$LOG_FILE"
  [[ -n "$backup_dir" ]] && log "本轮备份：$backup_dir"
  [[ -n "$old_sha" ]] && log "更新前提交：$old_sha"
  [[ -n "$target_sha" ]] && log "目标提交：$target_sha"
  if [[ "$changes_started" == 0 ]]; then
    if [[ "$media_stopped" == 1 ]]; then
      log "代码和依赖尚未更改，尝试恢复原媒体进程。"
      pm2 start anmy-media || log "媒体进程未能自动恢复，请查看 PM2 日志。"
    fi
    if [[ "$cms_stopped" == 1 ]]; then
      log "代码和依赖尚未更改，尝试恢复原后台进程。"
      pm2 start anmy-cms || log "后台进程未能自动恢复，请查看 PM2 日志。"
    fi
  else
    log "代码、依赖或数据库可能已经变化，未自动回滚或重启旧版本。"
    log "请保留日志与备份，按 docs/DEPLOY_TENCENT.md 的回滚章节处理；不要重新 seed 或重置数据库。"
  fi
  if [[ "$step" == "重启 PM2 并检查健康状态" ]]; then
    log "输出两个进程最近的日志，便于定位启动失败原因。"
    pm2 logs anmy-cms --lines 30 --nostream || true
    pm2 logs anmy-media --lines 30 --nostream || true
  fi
  exit "$code"
}
trap 'on_error "$?" "$LINENO"' ERR
trap 'on_error 130 "$LINENO"' INT
trap 'on_error 143 "$LINENO"' TERM

log "开始更新宝塔后台，详细日志：$LOG_FILE"
log "当前用户：$(id -un)，请使用管理现有 PM2 的同一个用户。"

step="检查工具和项目目录"
for tool in git node npm pm2 sqlite3 curl flock realpath tee cmp; do
  command -v "$tool" >/dev/null 2>&1 || fail "缺少命令 $tool，请先安装或切换到正确的 Node / PM2 环境。"
done
[[ "$MEDIA_DRAIN_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail "MEDIA_DRAIN_TIMEOUT_SECONDS 必须是非负整数。"
[[ "$MEDIA_DRAIN_INTERVAL_SECONDS" =~ ^[0-9]+$ ]] && (( MEDIA_DRAIN_INTERVAL_SECONDS > 0 )) || fail "MEDIA_DRAIN_INTERVAL_SECONDS 必须是正整数。"
cd -- "$PROJECT_DIR"
PROJECT_DIR="$(pwd -P)"
CMS_DIR="$PROJECT_DIR/apps/cms"
ENV_FILE="$CMS_DIR/.env"
ECOSYSTEM="$PROJECT_DIR/deploy/tencent/ecosystem.config.cjs"
git rev-parse --is-inside-work-tree >/dev/null
[[ -r "$ENV_FILE" ]] || fail "无法读取 $ENV_FILE；不会创建或覆盖服务器配置。"
[[ -f "$ECOSYSTEM" ]] || fail "找不到现有 PM2 配置：$ECOSYSTEM"
log "项目目录：$PROJECT_DIR"
log "Node：$(node --version)，npm：$(npm --version)，Git：$(git --version)"

exec 9>"$BACKUP_ROOT/.update.lock"
flock -n 9 || fail "已有另一个更新脚本正在运行。"

step="检查 Git 并获取主分支"
tracked_changes="$(git status --porcelain --untracked-files=no)"
if [[ -n "$tracked_changes" ]]; then
  if [[ "$tracked_changes" == " M apps/cms/next-env.d.ts" ]]; then
    next_env_needs_restore=1
    log "发现 next-env.d.ts 未提交修改；完成配置检查后核实是否为 Next.js 自动生成的路径。"
  else
    git status --short --untracked-files=no
    fail "服务器存在非预期的已跟踪文件未提交修改；请先保存并处理，脚本不会覆盖或重置它们。"
  fi
fi
old_sha="$(git rev-parse HEAD^{commit})"
current_branch="$(git branch --show-current)"
log "当前分支：${current_branch:-detached HEAD}，当前提交：$old_sha"
log "拉取 origin 的 main 分支。"
git fetch --no-tags origin main
target_sha="$(git rev-parse FETCH_HEAD^{commit})"
log "目标 main 提交：$target_sha"
git merge-base --is-ancestor "$old_sha" "$target_sha" || fail "当前服务器提交不在远端 main 的历史中，请先检查并合并，脚本不会丢弃现有提交。"
if git show-ref --verify --quiet refs/heads/main; then
  git merge-base --is-ancestor refs/heads/main "$target_sha" || fail "本地 main 存在远端 main 中没有的提交，请先处理分支分歧。"
fi
required_node="$(git show "$target_sha:.nvmrc" | tr -d '[:space:]')"
actual_node="$(node --version)"
if [[ "${actual_node#v}" != "${required_node#v}" ]]; then
  log "当前 Node 为 $actual_node，目标代码要求 $required_node；尝试使用已安装的对应版本。"
  node_candidates=(
    "${NODE_BIN_DIR:-}"
    "${NVM_DIR:-${HOME:-}/.nvm}/versions/node/v${required_node#v}/bin"
    "${HOME:-}/.nvm/versions/node/v${required_node#v}/bin"
    "/www/server/nvm/versions/node/v${required_node#v}/bin"
    "/www/server/nodejs/v${required_node#v}/bin"
    "/www/server/nodejs/${required_node#v}/bin"
  )
  for candidate in "${node_candidates[@]}"; do
    [[ -n "$candidate" && -x "$candidate/node" ]] || continue
    candidate_version="$("$candidate/node" --version 2>/dev/null || true)"
    if [[ "${candidate_version#v}" == "${required_node#v}" ]]; then
      export PATH="$candidate:$PATH"
      hash -r
      actual_node="$(node --version)"
      log "本次更新使用已安装的 Node：$actual_node（$candidate）。"
      break
    fi
  done
fi
[[ "${actual_node#v}" == "${required_node#v}" ]] || fail "未找到项目要求的 Node $required_node。请切换宝塔 Node 版本，或设置 NODE_BIN_DIR 为该版本的 bin 目录后重试。"
command -v npm >/dev/null 2>&1 || fail "切换 Node 后找不到 npm。"
command -v pm2 >/dev/null 2>&1 || fail "切换 Node 后找不到原用户的 pm2 命令。"
log "Git 和 Node 版本检查通过；不使用强制重置。"

step="核对 PM2、数据库与存储配置"
# 只输出数据库和目录路径，不输出 .env / PM2 中的密钥。
runtime_json="$(
  cd -- "$CMS_DIR"
  pm2_jlist | node -e '
    const fs = require("node:fs"), path = require("node:path");
    const { fileURLToPath } = require("node:url");
    const dotenv = require("dotenv");
    const input = fs.readFileSync(0, "utf8");
    if (!input) process.exit(1);
    const apps = JSON.parse(input);
    const file = dotenv.parse(fs.readFileSync(".env"));
    const selected = ["anmy-cms", "anmy-media"].map((name) => {
      const matches = apps.filter((app) => app.name === name);
      if (matches.length !== 1) throw new Error(`PM2 必须恰好有一个 ${name}，请使用原部署用户。`);
      const app = matches[0], env = app.pm2_env || {};
      if (env.status !== "online") throw new Error(`${name} 当前不是 online，请先检查 PM2。`);
      const actualCwd = env.pm_cwd ? fs.realpathSync(env.pm_cwd) : "未设置";
      const expectedCwd = fs.realpathSync(process.cwd());
      if (actualCwd !== expectedCwd)
        throw new Error(`${name} 工作目录与当前项目不一致：${actualCwd}；期望：${expectedCwd}`);
      return { name, env };
    });
    const keys = new Set([...Object.keys(file), "DATABASE_URL", "MEDIA_ROOT", "ORIGINALS_ROOT", "MEDIA_STORAGE", "PAYLOAD_SECRET", "MEDIA_WORKER_LOCK", "NEXT_DIST_DIR", "FFMPEG_PATH", "FFPROBE_PATH", "COS_APP_ID", "COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION", "COS_DOMAIN", "COS_CDN_ORIGIN", "WEB_ORIGIN", "CMS_ORIGIN"]);
    keys.delete("NODE_ENV");
    for (const { name, env } of selected) {
      const nested = env.env || {};
      for (const key of keys) {
        const runtime = Object.hasOwn(env, key) ? env[key] : Object.hasOwn(nested, key) ? nested[key] : file[key];
        const cli = Object.hasOwn(process.env, key) ? process.env[key] : file[key];
        if (runtime !== cli) throw new Error(`${name} 与当前终端的 ${key} 配置不一致；请在同一部署环境运行，未打印配置值。`);
      }
    }
    const value = (key) => Object.hasOwn(process.env, key) ? process.env[key] : file[key];
    const raw = value("DATABASE_URL") || "file:./data/mylife.db";
    if (!raw.startsWith("file:") || /[?#\r\n]/.test(raw)) throw new Error("只支持无查询参数的本地 SQLite DATABASE_URL。");
    const db = raw.startsWith("file://") ? fileURLToPath(raw) : path.resolve(process.cwd(), decodeURIComponent(raw.slice(5)));
    const media = path.resolve(process.cwd(), value("MEDIA_ROOT") || "./media");
    const originals = path.resolve(process.cwd(), value("ORIGINALS_ROOT") || `${media}-originals`);
    const storage = value("MEDIA_STORAGE") || "local";
    const nextDistDir = path.relative(process.cwd(), path.resolve(process.cwd(), value("NEXT_DIST_DIR") || ".next")).split(path.sep).join("/") || ".";
    const commandPath = (v) => v.includes("/") ? path.resolve(process.cwd(), v) : v;
    const ffmpeg = commandPath(value("FFMPEG_PATH") || "ffmpeg"), ffprobe = commandPath(value("FFPROBE_PATH") || "ffprobe");
    let publicHealth = "";
    try {
      const origin = new URL(value("CMS_ORIGIN") || "");
      if (["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash)
        publicHealth = new URL("/api/health", origin).href;
    } catch {}
    for (const item of [db, media, originals, storage, ffmpeg, ffprobe, nextDistDir]) if (/[\r\n]/.test(item)) throw new Error("数据库或存储路径包含换行，无法安全处理。");
    process.stdout.write(JSON.stringify({ db, media, originals, storage, ffmpeg, ffprobe, nextDistDir, publicHealth }));
  '
)"
config_lines="$(printf '%s' "$runtime_json" | node -e 'const x=JSON.parse(require("node:fs").readFileSync(0,"utf8")); console.log([x.db,x.media,x.originals,x.storage,x.ffmpeg,x.ffprobe,x.nextDistDir,x.publicHealth].join("\n"));')"
mapfile -t config <<< "$config_lines"
DB_PATH="${config[0]}"
MEDIA_ROOT="${config[1]}"
ORIGINALS_ROOT="${config[2]}"
STORAGE_MODE="${config[3]}"
FFMPEG_BIN="${config[4]}"
FFPROBE_BIN="${config[5]}"
next_generated_dist_dir="${config[6]}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-${config[7]:-}}"
[[ -f "$DB_PATH" ]] || fail "数据库文件不存在：$DB_PATH；不会创建新库。"
command -v "$FFMPEG_BIN" >/dev/null 2>&1 || fail "找不到 FFmpeg：$FFMPEG_BIN；请检查媒体进程使用的 PATH 或 FFMPEG_PATH。"
command -v "$FFPROBE_BIN" >/dev/null 2>&1 || fail "找不到 FFprobe：$FFPROBE_BIN；请检查媒体进程使用的 PATH 或 FFPROBE_PATH。"
log "PM2 的两个进程均为 online，工作目录与配置一致。"
log "数据库：$DB_PATH；本地素材：$MEDIA_ROOT；本地原件：$ORIGINALS_ROOT；存储模式：$STORAGE_MODE"
log "FFmpeg：$(command -v "$FFMPEG_BIN")；FFprobe：$(command -v "$FFPROBE_BIN")"
pm2 status

if [[ "$next_env_needs_restore" == 1 ]]; then
  step="备份 Next.js 自动生成的类型文件"
  if ! git show HEAD:apps/cms/next-env.d.ts | next_env_paths_only - "$CMS_DIR/next-env.d.ts" "$next_generated_dist_dir"; then
    git status --short --untracked-files=no
    fail "next-env.d.ts 存在非预期的未提交修改；请先保存并处理，脚本不会覆盖或重置它。"
  fi
  log "发现 Next.js 自动生成的类型路径变化；先备份，再恢复该文件。"
  next_env_backup="$BACKUP_ROOT/logs/next-env-before-update-$(date +%Y%m%d-%H%M%S)-$$.d.ts"
  cp -p -- "$CMS_DIR/next-env.d.ts" "$next_env_backup"
  chmod 600 "$next_env_backup"
  git show HEAD:apps/cms/next-env.d.ts | next_env_paths_only - "$next_env_backup" "$next_generated_dist_dir" || fail "next-env.d.ts 已发生其他变化，未覆盖；备份：$next_env_backup"
  cmp -s -- "$next_env_backup" "$CMS_DIR/next-env.d.ts" || fail "next-env.d.ts 在检查时发生变化，未覆盖；备份：$next_env_backup"
  [[ "$(git status --porcelain --untracked-files=no)" == " M apps/cms/next-env.d.ts" ]] || fail "Git 工作区在检查时发生变化，未覆盖；备份：$next_env_backup"
  git restore --worktree -- apps/cms/next-env.d.ts
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "Git 工作区仍有未提交修改，请先检查。"
  log "已备份并恢复 Next.js 自动生成的类型路径：$next_env_backup"
fi

step="暂停后台写入并等待媒体队列"
log "停止 anmy-cms，媒体进程继续工作，等待排队和处理中的视频完成。"
cms_stopped=1
pm2 stop anmy-cms
deadline=$((SECONDS + MEDIA_DRAIN_TIMEOUT_SECONDS))
pending_count() {
  sqlite3 -cmd '.timeout 5000' "$DB_PATH" "SELECT COUNT(*) FROM media WHERE processing_status IN ('queued','processing');"
}
while :; do
  pending="$(pending_count)"
  [[ "$pending" =~ ^[0-9]+$ ]] || fail "无法确认视频处理队列。"
  if (( pending == 0 )); then break; fi
  log "还有 $pending 个视频排队或处理中，等待媒体进程完成。"
  (( SECONDS < deadline )) || fail "等待媒体队列超时，请检查 anmy-media 后重试。"
  sleep "$MEDIA_DRAIN_INTERVAL_SECONDS"
done
log "媒体队列为空，停止 anmy-media。"
media_stopped=1
pm2 stop anmy-media
[[ "$(pending_count)" == "0" ]] || fail "停止媒体进程后队列发生变化，请检查后重试。"

step="备份数据库、配置和本地素材"
BACKUP_ROOT="$(realpath -m -- "$BACKUP_ROOT")"
media_real="$(realpath -m -- "$MEDIA_ROOT")"
originals_real="$(realpath -m -- "$ORIGINALS_ROOT")"
case "$BACKUP_ROOT/" in "$media_real/"*|"$originals_real/"*) fail "备份目录不能位于素材或原件目录中。" ;; esac
[[ "$BACKUP_ROOT" != *"'"* && "$BACKUP_ROOT" != *$'\n'* ]] || fail "备份目录包含不支持的引号或换行。"
backup_dir="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p -- "$backup_dir/db"
printf '%s\n' "$old_sha" > "$backup_dir/code-commit.txt"
printf '%s\n' "$target_sha" > "$backup_dir/target-commit.txt"
cp -p -- "$ENV_FILE" "$backup_dir/cms.env"
chmod 600 "$backup_dir/cms.env"
pm2_jlist | node -e 'const s=require("node:fs").readFileSync(0,"utf8");if(!s)process.exit(1);const a=JSON.parse(s);const p=a.filter(x=>["anmy-cms","anmy-media"].includes(x.name));if(p.length!==2)throw new Error("无法备份两个 PM2 进程配置");process.stdout.write(JSON.stringify(p.map(({name,pm2_env})=>({name,pm2_env})),null,2))' > "$backup_dir/pm2-processes.json"
chmod 600 "$backup_dir/pm2-processes.json"
log "已备份后台配置和 PM2 进程配置；环境变量不会输出到日志。"
log "使用 SQLite 在线备份创建数据库快照。"
sqlite3 -cmd '.timeout 5000' "$DB_PATH" ".backup '$backup_dir/db/mylife.db'"
[[ "$(sqlite3 "$backup_dir/db/mylife.db" 'PRAGMA quick_check;')" == "ok" ]] || fail "数据库备份 quick_check 未通过。"
log "数据库备份校验通过。"
has_storage="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('media') WHERE name='storage';")"
has_original="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('media') WHERE name='original_filename';")"
if [[ "$has_storage" == "1" ]]; then
  local_condition="COALESCE(storage, 'local') <> 'cos'"
else
  local_condition="1 = 1"
fi
media_condition="(filename IS NOT NULL AND filename <> '')"
if [[ "$has_original" == "1" ]]; then
  media_condition="($media_condition OR (original_filename IS NOT NULL AND instr(original_filename, '/') > 0))"
fi
local_media_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM media WHERE $media_condition AND $local_condition;")"
if [[ ! -d "$MEDIA_ROOT" ]] && (( local_media_count > 0 )); then
  fail "数据库仍有 $local_media_count 个本地素材，但素材目录不存在；请先核实并备份。"
fi
local_original_count=0
if [[ "$has_original" == "1" ]]; then
  local_original_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM media WHERE original_filename IS NOT NULL AND original_filename <> '' AND instr(original_filename, '/') = 0 AND $local_condition;")"
fi
if [[ ! -d "$ORIGINALS_ROOT" ]] && (( local_original_count > 0 )); then
  fail "数据库仍有 $local_original_count 个本地原件，但原件目录不存在；请先核实并备份。"
fi
if [[ -d "$MEDIA_ROOT" ]]; then
  mkdir -p -- "$backup_dir/media"
  log "备份本地素材目录。"
  cp -a -- "$MEDIA_ROOT/." "$backup_dir/media/"
else
  log "没有检测到旧本地素材，跳过本地素材目录备份。"
fi
if [[ -d "$ORIGINALS_ROOT" ]]; then
  mkdir -p -- "$backup_dir/media-originals"
  log "备份本地原件目录。"
  cp -a -- "$ORIGINALS_ROOT/." "$backup_dir/media-originals/"
else
  log "本地原件目录不存在，跳过本地原件备份。"
fi
log "备份完成：$backup_dir；COS 云端对象不包含在本次服务器目录备份中。"

step="切换 main 并快进合并"
changes_started=1
if [[ "$current_branch" != "main" ]]; then
  if git show-ref --verify --quiet refs/heads/main; then
    git switch main
  else
    git switch -c main "$target_sha"
  fi
fi
git merge --ff-only "$target_sha"
[[ "$(git rev-parse HEAD^{commit})" == "$target_sha" ]] || fail "合并后的提交与目标不一致。"
log "当前 main 已更新到：$target_sha"

step="安装依赖"
log "执行 npm ci --include=dev，保留构建和媒体进程需要的依赖。"
npm ci --include=dev

step="执行生产数据库迁移"
log "执行 Payload 生产迁移。"
NODE_ENV=production npm run db:migrate --workspace @mylife/cms
[[ "$(sqlite3 "$DB_PATH" 'PRAGMA quick_check;')" == "ok" ]] || fail "迁移后数据库 quick_check 未通过。"
log "迁移后数据库 quick_check 通过。"

step="构建后台"
log "构建宝塔后台。"
if [[ -f "$CMS_DIR/next-env.d.ts" ]]; then
  cp -p -- "$CMS_DIR/next-env.d.ts" "$backup_dir/next-env.before-build.d.ts"
fi
NODE_ENV=production npm run build --workspace @mylife/cms
if [[ -f "$backup_dir/next-env.before-build.d.ts" && -f "$CMS_DIR/next-env.d.ts" ]] &&
  ! cmp -s -- "$backup_dir/next-env.before-build.d.ts" "$CMS_DIR/next-env.d.ts"; then
  next_env_paths_only "$backup_dir/next-env.before-build.d.ts" "$CMS_DIR/next-env.d.ts" "$next_generated_dist_dir" || fail "next-env.d.ts 含有超出 Next.js 自动类型路径的变化，未自动覆盖。"
  cp -p -- "$backup_dir/next-env.before-build.d.ts" "$CMS_DIR/next-env.d.ts"
  log "已恢复 Next.js 自动改写的类型声明路径，避免下次更新误报本地修改。"
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short --untracked-files=no
  fail "构建修改了其他已跟踪文件，请保留并检查这些改动，避免下次更新覆盖。"
fi

step="重启 PM2 并检查健康状态"
log "按现有 ecosystem 配置重启 anmy-cms 和 anmy-media。"
pm2 restart "$ECOSYSTEM" --update-env
healthy=0
for attempt in {1..20}; do
  if response="$(curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" 2>/dev/null)" &&
    printf '%s' "$response" | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{try{if(JSON.parse(s).ok!==true)process.exitCode=1}catch{process.exitCode=1}})'; then
    healthy=1
    break
  fi
  log "等待后台健康检查（$attempt/20）。"
  sleep 3
done
(( healthy == 1 )) || fail "本机后台健康检查失败：$HEALTH_URL；请查看 PM2 日志。"
log "本机后台健康检查通过，等待进程稳定。"
sleep 3
pm2_jlist | node -e 'const s=require("node:fs").readFileSync(0,"utf8");if(!s)process.exit(1);const a=JSON.parse(s);for(const n of ["anmy-cms","anmy-media"]){const p=a.filter(x=>x.name===n);if(p.length!==1||p[0].pm2_env?.status!=="online"){console.error(`${n} 未处于 online 状态`);process.exitCode=1}else console.log(`${n}: online`)}'
pm2 status
if [[ -z "$PUBLIC_HEALTH_URL" ]]; then
  log "未配置有效的 CMS_ORIGIN 或 PUBLIC_HEALTH_URL，跳过公网健康检查。"
elif curl --fail --silent --show-error --max-time 10 "$PUBLIC_HEALTH_URL" >/dev/null; then
  log "公网后台健康地址可访问：$PUBLIC_HEALTH_URL"
else
  log "警告：本机健康检查通过，但公网后台健康地址未通过，请检查 Nginx / 域名。"
fi
pm2 save

step="完成"
log "后台更新完成。当前提交：$(git rev-parse HEAD)"
log "备份：$backup_dir"
log "日志：$LOG_FILE"
log "如需查看进程日志：pm2 logs anmy-cms --lines 50 --nostream；pm2 logs anmy-media --lines 50 --nostream"
