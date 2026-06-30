---
title: "用 Astro 开始我的个人博客"
description: "记录这个博客模板的基本结构，以及为什么它适合托管在 GitHub Pages。"
pubDate: 2026-06-29
category: "Blog"
tags: ["Astro", "GitHub Pages", "Markdown"]
---

Astro 很适合内容型站点：文章可以直接写 Markdown，构建结果是静态文件，部署到 GitHub Pages 时不需要服务器。

这个模板把内容放在 `src/content/posts`，每篇文章都有 frontmatter：

```yaml
---
title: "文章标题"
description: "文章摘要"
pubDate: 2026-06-29
category: "Blog"
tags: ["Astro", "Notes"]
---
```

## 写作流程

1. 在 `src/content/posts` 新建 Markdown 文件。
2. 写好标题、摘要、日期、分类和标签。
3. 提交到 GitHub，Actions 会自动构建并部署。

代码块会使用 Astro 内置的 Shiki 高亮：

```ts
export function hello(name: string) {
  return `Hello, ${name}`;
}
```
