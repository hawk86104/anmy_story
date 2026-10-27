# Roadmap 迭代：并发保护、历史导入与离线记事

基于 `main` 的 `1497c8c`（乌萨奇的第一次改版）继续开发。保留两种隐私、孩子直接公开、现有主题、项目、AI 和档案功能。

## 本轮功能

### 记录并发保护

家长和孩子同时打开一条记录时，首先保存的一方生成新版本；另一方保存旧版本会收到 HTTP 409，编辑器中的设备草稿继续保留。数据库以版本号作为写入条件，正文、附件 / 项目关系、公开快照、原生版本和长期历史在同一个事务中提交。后续钩子或提交失败会整体撤销，不会显示为成功。

冲突面板可对照最新文字、日期、附件数量和可见范围。可以明确放弃设备草稿、载入最新版本；也可以保留自己的内容，按新版本号继续编辑并先保持私密，之后再次保存。刷新恢复了旧版本设备草稿时同样会显示对照入口。

SQLite 启用 WAL；单个进程内排队写入，不同进程之间由 SQLite 锁协调，短暂占用时重试。CMS 继续使用一个实例，视频进程单独运行。WAL 会在数据库旁生成 `-wal` / `-shm` 文件；备份继续使用 SQLite `.backup`，不能只复制正在运行的 `.db`。

### 外部历史文字导入

家长登录后进入 **家长后台 → 导入**（`/app/manage/import`）：

1. 下载 CSV 空模板，或选择已有 UTF-8 CSV / JSON 文件；也可直接粘贴。
2. 选择记录归属的孩子或家长，填写稳定的来源标识，例如“幼儿园旧日记”。
3. 点击预览，核对日期、内容、重复及错误。预览不写入数据库。
4. 修正所有错误后，点击“导入 N 条私密记录”。整批成功才提交；发生错误时本批全部撤销。
5. 打开导入后的记录，补照片、关联项目，再自行选择是否公开。

每次 1–200 条、最多 1 MB。此入口导入文字、时间、标签、感受和收获；媒体文件通过记录编辑器关联。全量本站 ZIP 使用原来的 `npm run restore`，两种入口的格式不同。

CSV 支持以下列；只有 `content` 必须提供有效文字，其余列可省略或留空：

| 列                       | 内容                                                          |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| `externalId`             | 外部唯一 ID；同一来源与成员重复导入时据此跳过                 |
| `type`                   | `quick` / `story` / `work` / `honor`，默认 `quick`            |
| `title`, `content`       | 标题、正文                                                    |
| `occurredAt`             | `2020`、`2020-05`、`2020-05-12`；留空表示时间不确定           |
| `datePrecision`          | 可选 `year` / `month` / `day` / `unknown`，通常从日期自动判断 |
| `dateNote`               | 时间补充说明                                                  |
| `tags`                   | CSV 中用 `                                                    | ` 分隔；JSON 中可用字符串数组，最多 8 个 |
| `reflection`, `learning` | 感受、收获                                                    |

JSON 接受数组或 `{ "entries": [...] }`：

```json
[
  {
    "externalId": "diary-001",
    "type": "story",
    "title": "一段旧日记",
    "content": "这里填写当时写下的原文。",
    "occurredAt": "2020-05",
    "tags": ["日记"]
  }
]
```

CSV 的正文含逗号或换行时，需要用双引号包围；单元格中的双引号写成两个。没有外部 ID 时，按规范化内容识别完全相同的资料。重复导入会保留现有记录及后来的修改，不覆盖；修改来源标识或无 ID 的内容会视为另一条资料。外部文件中的公开状态、家庭、作者、原文和版本号不会作为可信内部数据使用。

### 安装与离线记事

登录成长空间后可点击“添加到主屏幕”。支持安装提示的浏览器会弹出原生提示；iPhone 使用 Safari 的“分享 → 添加到主屏幕”。正式站点使用 HTTPS。

至少联网打开一次成长空间，等待离线资源准备完成。之后断网重新打开时会显示离线文字页；也可以点击“离线记事”直接打开 `/offline.html`。离线页会自动保存标题、正文和发生日期，支持刷新继续；一台设备保留一份待带回的离线草稿。

联网登录后打开“记一件事”，点击“带回编辑器”。内容会和当前文字合并，先设为私密；设备编辑器草稿保存成功后才移除那份离线草稿，最后按正常流程保存到家庭空间。离线页不自动上传或公开，共享设备上可主动清除草稿。另一页面已更新的草稿不会被旧页面覆盖或删除。

只有公共离线 HTML、样式、脚本和图标会进入外壳缓存。账号接口、记录 API、媒体、管理后台、已登录页面 HTML 和服务端组件响应不缓存。新版外壳按内容更新缓存版本；“更新并刷新”会先等待记录编辑器保存设备草稿，录音过程中会提示先结束录音。

## 本地调试

使用仓库指定的 **Node.js 24.18.0**、npm、FFmpeg / FFprobe。本轮沿用该版本及已有依赖兼容说明，见 [README](../README.md)。

已有本地项目先停止旧的 `npm run dev`，在仓库根目录运行：

```bash
git fetch origin
# 本次 PR 合并后使用 main；合并前可切到 feat/roadmap-reliability 调试。
git switch main
git pull --ff-only origin main
node --version
npm ci
npm run dev:prepare
npm run dev
```

`dev:prepare` 针对本地开发库检查 / 备份 / 同步，`npm run dev` 启动时也会再作检查，然后启动前台 3000、后台 3001 和视频进程。已有 `.env`、账号和本地素材继续使用。

全新克隆时，在 `npm ci` 之后先执行 `npm run setup`，填写 `apps/cms/.env` 的家长 / 孩子账号配置，再依次执行 `npm run dev:prepare`、`npm run seed`、`npm run dev`。`seed` 只用于空库初始化。

| 入口         | 地址                                    |
| ------------ | --------------------------------------- |
| 成长空间     | http://localhost:3000/app               |
| 历史资料导入 | http://localhost:3000/app/manage/import |
| 离线文字页   | http://localhost:3000/offline.html      |
| 高级后台     | http://localhost:3001/admin             |

```bash
npm run typecheck
npm test
npm run build
```

开发模式不注册 Service Worker。验收安装和断网重新打开时，先停止开发服务、执行 `npm run build`，再分别用三个终端运行：

```bash
# 终端 1
npm run start --workspace @mylife/cms
# 终端 2
npm run start --workspace @mylife/web
# 终端 3
npm run media:worker
```

使用 `http://localhost:3000`（localhost 被浏览器视为安全环境），联网登录并准备资源后，再模拟离线。切回开发模式时可在浏览器 Application → Service Workers 注销本地工作器。使用手机访问电脑的普通局域网 HTTP 地址时，安装、Service Worker 和录音权限可能不可用，应使用正式 HTTPS 环境验收。

## 更新已经部署的宝塔后台

本轮没有新增数据库迁移文件或必填环境变量。更新仍执行正式迁移，补齐可能尚未执行的旧迁移。数据库自动启用 WAL，不改变原 `DATABASE_URL`、密钥或文件位置。

生产更新前先按 [宝塔完整备份步骤](DEPLOY_TENCENT.md#93-宝塔核对现有路径停机备份)停写并备份数据库、媒体、原件、`.env` 和旧提交。使用现有 PM2 的同一部署用户，确认站点真实路径与当前分支。

```bash
cd /www/wwwroot/anmy_story
node --version
git status --short
git fetch origin
```

推荐先在宝塔检出本次发布分支部署后台，再合并到 `main` 触发 EO 前台发布；也可以暂时关闭 EO 自动部署，待同一提交的后台验证成功后重新部署前台。合并后常规更新命令为：

```bash
# 先完成备份；当前两个进程处于停止状态。
git switch main
git pull --ff-only origin main
npm ci
NODE_ENV=production npm run db:migrate --workspace @mylife/cms
npm run build --workspace @mylife/cms
pm2 restart deploy/tencent/ecosystem.config.cjs --update-env
pm2 status
pm2 logs anmy-cms --lines 40 --nostream
pm2 logs anmy-media --lines 40 --nostream
curl -f http://127.0.0.1:3001/api/health
curl -f https://story.icegl.cn/api/health
pm2 save
```

合并前在服务器验证时，将上面的两条 Git 命令改为 `git switch feat/roadmap-reliability` 与 `git pull --ff-only origin feat/roadmap-reliability`；先前的 `git fetch origin` 会拉取该分支。以实际测试通过的提交 SHA 为准。

任何安装、迁移、构建错误都先停止后续步骤。生产数据继续使用 `.env` 中的路径，`dev:prepare` 用于本地开发库。完整回滚按 [部署文档第 9.7 节](DEPLOY_TENCENT.md#97-更新失败与回滚)，代码回退不会自动回退数据库。

## EdgeOne 前台与上线验收

EO 生产分支核对为 `main`，根目录 `apps/web`，安装命令 `npm ci --prefix ../..`，构建命令 `npm run build`，输出 `.next`。`prebuild` 会生成带内容版本的 `sw.js` 并准备适配器所需目录。

前台环境变量使用现有 `https://story.icegl.cn`，域名为 `https://anmy.icegl.cn`。`sw.js` 的不缓存响应头及根作用域权限已写入 Next.js 与 `edgeone.json`；控制台已有额外缓存规则时，确保工作器脚本每次能重新验证版本。

在部署了对应提交的环境检查：

- 两个窗口编辑同一记录，先保存后，另一窗口应出现版本冲突；旧窗口文字和设备草稿仍在。
- 家长预览小文件，确认预览不生成记录；正式导入后归属正确、仅家庭可见；重复导入显示跳过。
- 原有公开、撤回、媒体、项目和 AI 设置仍可使用。
- 手机添加到主屏幕，至少联网打开一次后断网重新打开；写文字并刷新，草稿仍在。
- 联网登录后带回草稿，保存到家庭空间后刷新；没有自动公开。
- 离线外壳资源更新并发布后，工作器脚本版本变化，更新入口在保留草稿后刷新；录音中会阻止更新。

宝塔、EO 发布及真机操作需在目标环境验收。云对象存储、定时异地备份及生产恢复演练仍在 Roadmap 后续项。
