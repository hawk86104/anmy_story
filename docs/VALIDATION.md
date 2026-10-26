# 验证范围

`npm test` 在独立临时 SQLite 和媒体目录运行真实 Payload 集成测试，不触及家庭数据：

- 孩子提交即时保存，默认家庭可见，拒绝伪造家庭、记录人、原文和公开快照。
- 匿名与跨家庭读取、修改、版本访问受限；孩子不能提升角色与公开权限。
- 公开申请、家长批准、公开后修改、立即撤回的快照规则。
- 历史补录的年/月/未知精度，不接受未来日期与无内容记录。
- 旧版本冲突、重复 `clientId`、家长协助修改与版本历史。
- 真正生成大图、验证 WebP/2048px、移除 EXIF 与受保护素材关系。
- 真正生成测试视频、调用独立 FFmpeg 进程，验证 H.264/720p 和成功后原件清理。

## 2026-10-26：Node.js 24.18.0 本地复验

仓库当前统一使用 **Node.js 24.18.0**：根目录与前台 `.nvmrc`、根 `package.json` 和锁文件的项目 `engines.node`、EdgeOne `nodeVersion` 均已同步；GitHub Actions 从根 `.nvmrc` 读取版本。本次实际环境为 Windows、Node.js v24.18.0、npm 11.16.0。

| 检查 | 本次结果 |
| --- | --- |
| 从 `apps/web` 执行 `npm ci --prefix ../..` | 通过；有 Payload 的 `EBADENGINE` 警告 |
| `npm run setup` | 通过；保留原有 `.env` |
| `npm run typecheck` | 前后台均通过 |
| `npm test` | 10/10 通过，包含真实图片压缩和视频转码 |
| 生产数据库迁移及 `npm run seed` | 独立临时库完成三次迁移和家长、孩子账号初始化 |
| `npm run build` | CMS 与前台生产构建均通过 |
| 生产服务启动与 HTTP 检查 | 前台四个页面返回 200，同源 API 代理、后台健康、CORS、匿名权限及公开快照接口通过 |
| `npm run dev` 使用的统一启动脚本 | 前台、CMS、媒体进程启动成功，登录页面及同源健康接口返回 200 |
| EdgeOne CLI 1.6.46 `edgeone makers build` | 安装、构建、`onBuild`、`onPostBuild` 均通过，生成 SSR 函数和 16 条路由配置 |

视频测试子进程改由 `process.execPath --import tsx` 启动，解决 Windows 无法直接执行 Unix `.bin/tsx` 的问题；临时目录删除增加有限重试，以处理 Windows SQLite 文件句柄短暂占用。转码测试使用临时工具目录中的 FFmpeg / FFprobe 9.0.2，并仅为验证进程补充 PATH。本次没有把 FFmpeg 安装到系统 PATH。

Payload、`@payloadcms/next` 和 `@payloadcms/ui` 3.92.0 仍声明 Node `^22.23.4 || >=24.22.1`，不包含 24.18.0。保留第三方原始声明；默认 npm 配置下警告不阻止上述本地执行，但启用 `engine-strict` 时会拒绝安装。本次实测通过不能替代上游兼容性承诺。开发启动另有 Node `DEP0190` 弃用提示，不影响本次启动。

所有账号、迁移和服务验证使用独立临时数据库与媒体目录，原有家庭数据未改动。验证进程已停止。本次没有发布到 EO 或宝塔，也没有执行真实手机或浏览器交互验收。

## 历史验证记录

以下保留此前验证时的环境信息；历史记录中的 Node 版本不代表当前配置。

2026-10-24 本地验证通过：两个工程 TypeScript 检查、10 项集成测试、生产数据库三次迁移、两个工程生产构建；生产依赖 `npm audit --omit=dev` 为 0 个已知漏洞。使用 Payload 3.92.0、Next.js 16.4.3、Sharp 0.35.5 与 Node.js 24.22.1。

HTTP 联调包含登录、提交、真实 multipart 图片上传、授权文件访问、公开申请、批准快照、撤回和退出登录；GitHub Actions 已配置在每次 push / PR 重跑类型、测试、迁移、构建与依赖审计。

腾讯云独立部署适配额外验证：前台直连构建产物无 Next.js rewrites；PM2 配置能定位实际可执行文件；用本地生产服务及 `https://anmy.icegl.cn` 的 Origin 检查精确 CORS、登录预检、Secure/HttpOnly/SameSite=Lax Cookie、带凭据图片上传与读取、匿名文件访问拒绝。这里的接口验证没有连接真实宝塔或 EO 项目，真实域名、HTTPS、平台适配和手机 Cookie 行为仍需按部署清单验收。

EO 安装命令修正后，在不含 `node_modules` 或本地 `.env` 的全新代码目录，使用 Node 24.22.1，从 `apps/web` 执行 `npm ci --prefix ../..`，再以正式后台地址执行 `npm run build`，均通过。CI 同样从该目录安装依赖。

2026-10-26 使用 EdgeOne CLI 1.6.46 的 `edgeone makers build` 复现 `onBuild` 扫描应用 `node_modules` 目录失败。加入前台 `prebuild` 目录准备步骤后，在另一份全新代码目录完成官方构建器的安装、Next.js 构建和 `onBuild` / `onPostBuild` 打包，成功生成 SSR 函数及 16 条路由配置。CI 已改为运行这项完整打包检查；真实 EO 项目的发布和线上运行仍需重新部署验收。

当前会话没有可用的连接浏览器控制工具，因此不把 HTTP 检查写成已完成真机或浏览器交互验收。移动端摄像头、系统麦克风权限、录音编码、IndexedDB 恢复与各屏宽视觉效果，仍需在部署后用实际手机确认。界面为响应式布局，支持 320px 以上屏宽与安全区域。
