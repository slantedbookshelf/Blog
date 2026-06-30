---
title: "GitHub Pages 自动部署笔记"
description: "使用 GitHub Actions 将 Astro 构建产物发布到 GitHub Pages。"
pubDate: 2026-06-28
category: "Deployment"
tags: ["GitHub Actions", "Astro", "Deploy"]
---

项目已经包含 `.github/workflows/deploy.yml`。当代码推送到 `main` 分支时，它会完成三件事：

- 安装依赖
- 执行 `npm run build`
- 上传 `dist` 到 GitHub Pages

仓库第一次部署前，需要在 GitHub 仓库的 Settings -> Pages 中，将 Source 设置为 GitHub Actions。

如果你的仓库地址是：

```text
https://github.com/your-username/my-blog
```

部署后的项目站点通常是：

```text
https://your-username.github.io/my-blog/
```
