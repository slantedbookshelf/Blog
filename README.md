# Personal Blog

一个轻量级 Astro 个人博客模板，结构参考 `Katrina55553/My-Blog`：Markdown 文章、标签和分类筛选、文章详情页、暗黑模式、响应式布局，并内置 GitHub Pages 自动部署。

## 技术选型

- Astro：静态站点生成器，适合内容博客和 GitHub Pages。
- Markdown Content Collections：管理文章元数据和正文。
- Shiki：Astro 内置代码高亮。
- 原生 CSS：无额外 UI 依赖，便于长期维护。

## 项目结构

```text
.
├── .github/workflows/deploy.yml
├── astro.config.mjs
├── package.json
├── public/
│   └── favicon.svg
└── src/
    ├── components/
    │   ├── Header.astro
    │   ├── PostCard.astro
    │   └── ThemeToggle.astro
    ├── content/
    │   ├── config.ts
    │   └── posts/
    ├── layouts/
    │   └── BaseLayout.astro
    ├── lib/
    │   └── site.ts
    ├── pages/
    │   ├── index.astro
    │   ├── about.astro
    │   ├── blog/index.astro
    │   ├── posts/[...slug].astro
    │   ├── tags/
    │   └── categories/
    └── styles/global.css
```

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址是 `http://localhost:4321`。

## 构建预览

```bash
npm run build
npm run preview
```

## 修改个人信息

编辑 `src/lib/site.ts`：

```ts
export const SITE = {
  title: 'My Blog',
  author: 'Your Name',
  description: 'A quiet place for notes, essays, and technical experiments.',
  github: 'https://github.com/your-username',
  email: 'mailto:you@example.com',
  location: 'Somewhere on Earth'
};
```

## 添加文章

在 `src/content/posts/` 新建 `.md` 文件：

```md
---
title: "文章标题"
description: "文章摘要"
pubDate: 2026-06-29
category: "Blog"
tags: ["Astro", "Markdown"]
---

正文内容。
```

## 部署到 GitHub Pages

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 打开仓库 Settings -> Pages。
3. Source 选择 GitHub Actions。
4. 推送后 workflow 会自动部署。

部署 workflow 会自动设置：

```yaml
SITE_URL: https://${{ github.repository_owner }}.github.io
BASE_PATH: /${{ github.event.repository.name }}
```

如果你使用用户主页仓库，例如 `your-username.github.io`，可以把 `BASE_PATH` 改成 `/`。
