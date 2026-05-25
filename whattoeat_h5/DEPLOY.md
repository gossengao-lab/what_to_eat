# GitHub Pages 部署说明

## 前置条件

1. 将本项目推送到 GitHub 仓库（例如 `your-username/whattoeat_h5`）。
2. 在仓库中启用 GitHub Pages：
   - 打开 **Settings → Pages**
   - **Build and deployment → Source** 选择 **GitHub Actions**（不要选 “Deploy from a branch”）。

## 自动部署

向 `main` 或 `master` 分支推送代码后，`.github/workflows/deploy-pages.yml` 会：

1. 使用 [html-validate](https://html-validate.org/) 校验入口页 `index.html`
2. 校验通过后，将仓库根目录的静态文件部署到 GitHub Pages

也可在 **Actions** 页手动运行 **Deploy to GitHub Pages**（`workflow_dispatch`）。

## 访问地址

部署成功后，在 Actions 运行记录的 **Deploy to GitHub Pages** 步骤或仓库 **Settings → Pages** 中可看到站点 URL。

| 仓库类型 | 访问地址格式 |
|----------|----------------|
| 用户/组织站点（仓库名为 `用户名.github.io`） | `https://<用户名>.github.io/` |
| 项目站点（本仓库常见情况） | `https://<用户名>.github.io/<仓库名>/` |

**示例**（用户 `gossen`，仓库 `whattoeat_h5`）：

- 首页：`https://gossen.github.io/whattoeat_h5/`
- 测试用例页（若需）：`https://gossen.github.io/whattoeat_h5/text.html`

首次部署或 DNS 生效可能需要 1～5 分钟；若 404，请确认 Pages 的 Source 已设为 **GitHub Actions**，并查看 Actions 是否全部通过。

## 本地校验（可选）

```bash
npx html-validate@9.4.0 index.html
```

规则配置见项目根目录 `.htmlvalidate.json`。

## 故障排查

| 现象 | 处理 |
|------|------|
| Actions 中 HTML 校验失败 | 根据日志修复 `index.html`，或调整 `.htmlvalidate.json` |
| 页面样式/脚本 404 | 确认资源使用相对路径（如 `styles.css`、`app.js`），勿写绝对根路径 `/styles.css` |
| 部署成功但打不开 | 检查 Settings → Pages 是否启用；项目站点 URL 需包含仓库名路径 |
