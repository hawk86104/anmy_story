# 宝塔后台一键更新

脚本 `deploy/tencent/update-server.sh` 针对现有部署：项目目录 `/www/wwwroot/anmy_story`、PM2 进程 `anmy-cms` 和 `anmy-media`、SQLite 数据库、宝塔后台端口 `3001`。它只更新宝塔后台，由你现有的流程处理前台发布。

## 首次使用

先将本次源码、迁移和脚本提交并推送到 GitHub 的 `main`。本地修改尚未推送时，服务器上的 `main` 取不到它们。

在宝塔终端中，使用**原来管理这两个 PM2 进程的同一个 Linux 用户**执行：

```bash
cd /www/wwwroot/anmy_story
BOOTSTRAP="$(mktemp /tmp/anmy-story-update.XXXXXXXX)" && \
git fetch origin main && \
git show FETCH_HEAD:deploy/tencent/update-server.sh > "$BOOTSTRAP" && \
bash "$BOOTSTRAP"
```

首次命令从远端 `main` 取出脚本；脚本随后会再次核对并更新仓库。之后脚本已经在服务器项目中，可直接执行：

```bash
cd /www/wwwroot/anmy_story
bash deploy/tencent/update-server.sh
```

如果下次更新也修改了脚本，使用首次命令可以先取得远端最新版脚本。脚本运行时会将自身装入内存，Git 更新脚本文件不会中断本次执行。

## 执行过程

1. 检查 Git、Node、npm、PM2、SQLite、curl 等工具，以及两个 PM2 进程的工作目录和实际配置。Node 版本必须与远端 `main` 的 `.nvmrc` 一致；当前版本不符时，会尝试查找常见安装目录中的指定版本，只在本次脚本内调整 `PATH`。
2. 获取 `origin/main`，核对服务器当前提交和本地 `main` 都能安全快进。遇到一般的已跟踪文件未提交修改、分支存在未合并提交，或 PM2 配置与当前终端不一致时，会直接停止，不执行强制重置。对于下文列出的 Next.js 自动生成路径变化，脚本会先备份并恢复该文件。
3. 暂停 `anmy-cms`，让 `anmy-media` 继续处理现有视频队列。队列清空后停止媒体进程。默认最多等待 900 秒，等待期间会打印剩余数量。
4. 按服务器实际 `.env` 和 PM2 环境识别数据库、素材及原件路径。备份 SQLite 并执行 `quick_check`，备份 `.env`、PM2 进程配置和存在的本地素材目录；数据库仍引用本地素材而对应目录不存在时停止。COS 云端对象不包含在这份服务器目录备份中，本地素材目录内的符号链接会保留为链接，链接目标需另行备份。
5. 切换到本地 `main` 并以 `--ff-only` 合并目标提交；执行 `npm ci --include=dev`、Payload 生产迁移及后台构建。
6. 按 `deploy/tencent/ecosystem.config.cjs` 重启两个 PM2 进程，检查本机健康接口和进程状态，再执行 `pm2 save`。公网健康地址失败会打印警告，供排查 Nginx / 域名。

更新期间后台接口会暂时不可用。脚本不会重新执行 `setup`、`seed`、开发数据库同步或数据库重置，也不会主动迁移、删除 COS 或本地素材。

Next.js 构建可能把 `apps/cms/next-env.d.ts` 中的 `.next/dev/types/` 改为 `.next/types/`。如果运行前发现这一文件仅有上述 `routes.d.ts` 或 `root-params.d.ts` 路径变化、没有暂存或其他已跟踪文件修改，脚本会在完成前置检查后将它备份到 `/www/backup/anmy_story/logs/next-env-before-update-*.d.ts`，再恢复 Git 中的版本。构建之后也会只在确认变化仅限这些路径时恢复构建前内容；`NEXT_DIST_DIR` 指定的构建目录也会被识别。其他修改会保留并报错。可使用 `git diff -- apps/cms/next-env.d.ts` 查看实际差异。

如果日志显示未找到要求的 Node 版本，请先通过宝塔的 Node 版本管理器或现有工具安装项目 `.nvmrc` 所要求的版本。已经安装在非标准位置时，可指定该版本的 `bin` 目录：

```bash
NODE_BIN_DIR=/实际Node版本目录/bin bash deploy/tencent/update-server.sh
```

脚本会验证目录中的 `node --version`，不会安装或修改服务器的全局 Node 配置。请仍使用管理现有 PM2 的用户运行；若刚推送的是新脚本，应在前面的首次命令中把最后一行改为 `NODE_BIN_DIR=/实际Node版本目录/bin bash "$BOOTSTRAP"`。

## 日志、备份与失败处理

默认日志保存在 `/www/backup/anmy_story/logs/`，每次生成独立文件；启动和结束时都会打印完整路径。数据库、配置、本地素材和更新前后的提交号保存在 `/www/backup/anmy_story/时间戳-进程号/`。

```bash
ls -lt /www/backup/anmy_story/logs | head
tail -n 100 /www/backup/anmy_story/logs/日志文件名.log
pm2 status
pm2 logs anmy-cms --lines 50 --nostream
pm2 logs anmy-media --lines 50 --nostream
```

日志和备份权限默认仅限当前用户。备份中的 `cms.env` 和 `pm2-processes.json` 可能含服务器密钥，应妥善保管；脚本不会直接打印配置中的密钥。失败时附带的 PM2 原有日志由应用产生，也应注意私密保管。

代码和依赖开始更新**之前**发生错误时，脚本会尝试恢复本次暂停的旧进程。开始切换代码、安装依赖或迁移后失败时，脚本保留故障现场，不自动回滚旧数据库或强行启动旧程序；先查看日志和本轮备份，再按[部署文档的回滚章节](DEPLOY_TENCENT.md#97-更新失败与回滚)处理。启动或健康检查失败时，脚本会同时打印两个 PM2 进程最近的日志。

需要自定义目录或等待时间时，可以在同一条命令中指定：

```bash
PROJECT_DIR=/实际项目目录 BACKUP_ROOT=/实际备份目录 \
MEDIA_DRAIN_TIMEOUT_SECONDS=1800 bash deploy/tencent/update-server.sh
```

本地验证使用隔离 Git 仓库、真实 SQLite 测试库和模拟 PM2 / npm / 网络命令，覆盖快进更新、自动处理 Next.js 类型文件、Node 版本选择、配置和分支不一致、素材缺失、队列超时及迁移失败。尚未连接实际宝塔服务器执行；运行时请根据日志确认真实路径与服务状态。
