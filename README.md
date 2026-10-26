# MyLife · 成长手记（anmy_story）

孩子自己记录，家长一起维护。先把手机端记录体验做好，再逐步完善个人主页、作品展厅和 AI 整理。

本项目按照[产品计划](https://chatgpt.com/share/6adc2896-faa8-83ea-98ab-d03ac3ce2e46)实施。当前版本是 **阶段 A：移动记录与内容基础**，仓库为私有。

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

本阶段的故事正文使用纯文本与独立感受/收获字段；富文本、完整作品展厅、主题管理、AI 与打包导出按后续阶段推进，不提供模拟 AI 结果。

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

`npm run dev` 同时启动前台、后台和媒体处理进程。浏览器只通过前台同源的 `/api` 访问后台，因此登录 Cookie 和私人媒体保持同一访问入口。设备录音需要 HTTPS 或 localhost。

```bash
npm run typecheck
npm test
npm run build
```

测试使用独立的临时数据库和素材目录，不改动真实家庭数据，包含真实图片压缩与 FFmpeg 转码。[验证说明](docs/VALIDATION.md)记录验证范围与限制。

## 继续完善

开发顺序见 [ROADMAP](docs/ROADMAP.md)，权限和数据边界见 [架构说明](docs/ARCHITECTURE.md)，正式环境配置见 [运行与部署](docs/OPERATIONS.md)。

本次指定的 `anmy.icegl.cn`（EO Pages）+ `story.icegl.cn`（Ubuntu 22.04 宝塔）部署步骤、SQLite 初始化、PM2 与 Nginx 模板见 [腾讯云部署清单](docs/DEPLOY_TENCENT.md)。
