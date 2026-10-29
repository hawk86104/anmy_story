# 开源前检查

公开家庭项目时，需要同时检查源码、Git 历史、设计素材和发布配置。

1. 本项目源代码使用 MIT 许可证。确认插画、角色、字体等素材是否允许公开和再分发；`apps/web/public/themes/usagi/` 与 `design/usagi-theme/` 中的素材及设计稿不属于该 MIT 授权范围。
2. 检查待提交文件：不要包含 `.env`、数据库、家庭附件、备份、私钥或日志。`.gitignore` 只防止普通添加，不能移除已被 Git 跟踪的文件，也不能保护被强制添加的文件。
3. 用密钥扫描工具检查待发布文件及其 Git 历史，人工核对截图、文档和示例是否包含私人内容。扫描无结果不能保证绝对没有敏感信息。
4. 发布前检查部署环境变量。百度统计默认关闭，只有设置自己的 `NEXT_PUBLIC_BAIDU_ANALYTICS_ID` 才会启用；COS 凭据只配置在后台。已有站点的数据库和正式密钥应继续保留。

## 保留私有生产仓库，另建公开仓库

原仓库的旧提交、分支、标签和拉取请求可能仍保存已经从当前版本删除的信息。直接将原仓库改成公开，即使只推送一个新的 `main` 提交，也会公开可访问的旧历史。可保留原仓库为私有，再用已审查并提交的源码生成新的公开仓库：

```sh
# 在原仓库中先审查并提交所有准备公开的修改，再从该提交生成源码归档。
git status --short
git diff --cached --name-only
git archive --format=tar --output=../mylife-public-source.tar HEAD
mkdir ../mylife-public
tar -xf ../mylife-public-source.tar -C ../mylife-public
cd ../mylife-public
git init -b main
git status --short
```

归档只包含已提交、被跟踪的文件，不包含 `.git`、未提交内容和被忽略的 `.private`、数据库、环境配置或媒体目录。确认许可证、素材权利、归档内容和密钥扫描结果后，再在新仓库提交并推送；推送前也要确认 Git 提交作者信息适合公开。新仓库应只配置预期公开的分支和标签。

如确实需要公开原仓库并保留历史，需要另行检查和处理所有可访问分支、标签、历史提交及 GitHub 上的其他内容；单纯删除当前文件或修改 `.gitignore` 不会清除历史。
