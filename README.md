# MyLife · 成长手记（anmy_story）

孩子自己记录，家长一起维护。乌萨奇主题的公开成长主页、手机记录空间与手机家长管理。

本项目按照[产品计划](https://chatgpt.com/share/6adc2896-faa8-83ea-98ab-d03ac3ce2e46)实施。当前版本包含移动记录、主题主页、成长项目、家长管理、可选 AI 与家庭档案；仓库为私有。

## 前后台分开

```text
apps/web/           Next.js 前台，公开主页与孩子的手机记录空间
apps/cms/           独立的 Next.js + Payload CMS 后台、认证、API 与媒体处理
packages/shared/    前后台共用的数据协议与显示规则
docs/               实施顺序、架构、运行与验证说明
```

前台只通过 API 访问后台，不导入 Payload、数据库或服务端密钥。后台复用 Payload 的认证、权限、内容管理与版本能力，不修改其源码。路由集成遵循 Payload 官方 Website Template，页面和业务集合按本项目重新组织。

## 第一阶段已实现

- 孩子与家长独立账号；家长可以在后台添加第二位家长。
- 手机端随手记、故事、作品、里程碑四种方式；照片、视频、录音、音频文件与 PDF 附件。
- 自动保存设备草稿，退出后恢复；可主动将草稿保存到家庭空间。
- 上传进度与失败重试；普通照片自动缩至最长边 2048px，证书模式 4096px；WebP 优化并移除 EXIF。
- 视频先上传、记录直接保存，独立 FFmpeg 进程生成兼容的 H.264/AAC MP4；验证替换成功后清理临时原视频，失败保留原件并支持重试。
- 历史补录与日、月、年、不确定四种时间精度；时间轴按事件发生时间排序，区分首次记录时间。
- 私人时间轴、筛选、搜索、详情、修改与归档；保留首次原文及修改版本。
- 只有两种可见范围：仅自己和家长可见、所有人可见（包括游客）。孩子可直接公开，无需家长审批或预授权；撤回立即取消公开记录及其附件权限。
- 公开首页可以打开独立详情，游客可阅读正文、感受、收获及附件；已公开记录的修改直接更新公开内容。
- 家长后台支持删除闲置素材并清理文件；仍被记录引用或正在转码的素材会给出保护提示。

新增公开时间轴、作品、里程碑、项目与详情；可维护公开资料、头像封面，切换乌萨奇 / 小八 / 吉伊三套色板，选择展示模块。记录支持项目关联、附件排序、指定封面与素材库复用。

手机家长端 `/app/manage` 提供概览、记录与版本、素材、成员、主题和服务设置；高级后台 `/admin` 保留。AI 默认关闭，家长配置兼容服务并授权后，孩子主动请求三个标题建议、原意整理或录音转写，人工采纳后再保存。没有配置服务时不返回模拟结果。

支持长期版本档案、JSON / Markdown / 媒体 / 项目 / 版本 ZIP 导出，以及默认只检查的恢复命令。新上传照片与视频可选择保留原件。功能、迁移与恢复说明见[本版迭代说明](docs/USAGI_ITERATION.md)。已有宝塔部署更新时先备份并执行迁移，具体见[更新部署](docs/DEPLOY_TENCENT.md#9-已部署站点的版本更新与回滚)。

现已补齐记录的数据库原子版本保护、家长端 CSV / JSON 历史文字批量导入，以及可安装的离线记事外壳。使用入口与本地 / 宝塔更新步骤见 [Roadmap 迭代说明](docs/ROADMAP_ITERATION.md)。

附件统一存入 COS 的 `media/记录创建日期/`，经 `anmy-story.icegl.cn` 的临时签名地址访问。家长设置页与 Payload 后台首页提供完整 ZIP 备份、预检与整体还原、清空所有历史记录和素材。部署配置、旧素材迁移与备份边界见 [COS 与完整备份](docs/COS_BACKUP.md)。

本次更新的日常调试、临时测试库、上传/备份/清空/还原验收、宝塔迁移和 EO 发布命令见 [本地测试与宝塔升级步骤](docs/UPDATE_20261028_COS_BACKUP.md)。

## 本地运行

统一使用 Node.js **24.18.0**、npm、系统 FFmpeg 和 FFprobe。可用 `.nvmrc` 选择版本，CI 同样读取该文件。Ubuntu/Debian 可安装 `ffmpeg` 包，macOS 可使用 `brew install ffmpeg`。

当前 Payload 3.92.0 的 Node 版本声明不包含 24.18.0，安装时会出现 `EBADENGINE` 警告；本地已在指定版本完成安装、测试、构建与启动验证，具体范围见[验证说明](docs/VALIDATION.md)。这不代表第三方依赖已声明支持该版本，启用 `engine-strict` 的环境仍会拒绝安装。

```bash
git clone https://github.com/hawk86104/anmy_story.git
cd anmy_story
npm ci
npm run setup
```

在 `apps/cms/.env` 中填写 `PARENT_EMAIL`、`PARENT_PASSWORD`、`CHILD_EMAIL`、`CHILD_PASSWORD`，使用不同的邮箱以及至少 12 位且不同的密码。`setup` 会生成随机服务端密钥，保留已有配置，不覆盖账号。不要提交 `.env`。

```bash
npm run dev:prepare
npm run seed
npm run dev
```

初始化仅在没有账号时创建一个家庭、一个家长和一个孩子，不覆盖已有账号或创建示例成长记录。完成后可以从 `.env` 移除初始化用的密码。

| 入口           | 本地地址                          |
| -------------- | --------------------------------- |
| 手机记录编辑器 | http://localhost:3000/app/new     |
| 私人成长时间轴 | http://localhost:3000/app/entries |
| 公开个人主页   | http://localhost:3000/            |
| 家长管理后台   | http://localhost:3001/admin       |
| 手机家长管理   | http://localhost:3000/app/manage  |

`npm run dev` 先单独准备本地 SQLite，再启动前台、后台和媒体处理进程。存在结构变更时自动创建备份；同步失败会在启动服务前停止。媒体进程不参与改表。也可使用 `npm run dev:prepare` 单独检查开发库；生产库仍使用正式迁移。浏览器通过前台同源的 `/api` 访问后台，设备录音需要 HTTPS 或 localhost。

```bash
npm run typecheck
npm test
npm run build
```

测试使用独立的临时数据库和素材目录，不改动真实家庭数据，包含真实图片压缩与 FFmpeg 转码。[验证说明](docs/VALIDATION.md)记录验证范围与限制。

## 继续完善

开发顺序见 [ROADMAP](docs/ROADMAP.md)，权限和数据边界见 [架构说明](docs/ARCHITECTURE.md)，正式环境配置见 [运行与部署](docs/OPERATIONS.md)。

本次指定的 `anmy.icegl.cn`（EO Pages）+ `story.icegl.cn`（Ubuntu 22.04 宝塔）部署步骤、SQLite 初始化、PM2 与 Nginx 模板见 [腾讯云部署清单](docs/DEPLOY_TENCENT.md)。
