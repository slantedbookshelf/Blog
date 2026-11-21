# Personal Blog

一个轻量级 Astro 个人博客，使用 Markdown Content Collections 管理文章，原生 CSS 管理视觉样式，通过 GitHub Pages 自动部署。当前版本新增了一个“博客 AI 导览员”，用于帮助访客了解博主、文章、项目和联系方式。

## 技术栈

- Astro 5
- TypeScript
- Markdown Content Collections
- 原生 CSS
- GitHub Pages
- 暗黑模式
- 响应式布局
- Netlify Functions 作为独立 AI Serverless API
- OpenAI-compatible Chat Completions Provider

## 项目结构

```text
.
├─ .github/workflows/deploy.yml
├─ astro.config.mjs
├─ netlify.toml
├─ package.json
├─ public/
├─ netlify/
│  └─ functions/
│     └─ chat.ts
└─ src/
   ├─ components/
   │  ├─ AiChat.astro
   │  ├─ Header.astro
   │  ├─ PostCard.astro
   │  └─ ThemeToggle.astro
   ├─ content/
   │  ├─ config.ts
   │  └─ posts/
   ├─ data/
   │  └─ profile.ts
   ├─ layouts/
   │  └─ BaseLayout.astro
   ├─ lib/
   │  ├─ site.ts
   │  └─ ai/
   │     ├─ knowledge.ts
   │     ├─ provider.ts
   │     ├─ systemPrompt.ts
   │     └─ types.ts
   ├─ pages/
   │  ├─ ai-context.json.ts
   │  ├─ index.astro
   │  ├─ about.astro
   │  ├─ blog/index.astro
   │  ├─ posts/[...slug].astro
   │  ├─ tags/
   │  └─ categories/
   └─ styles/global.css
```

## 本地开发

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

## JavaScript / TypeScript 学习

启动博客后，从 `/practice/` 的课程卡片进入。课程主页位于 `/practice/js-ts/`，各节位于 `/practice/js-ts/<知识点 ID>/`。使用 GitHub Pages 项目路径时，链接会自动带上站点前缀。

新增一节时，在 `src/data/js-ts/chapters.ts` 加入唯一的知识点 ID 和教程，在 `exercises.ts` 用同一个 ID 加入题目，最后在 `test-cases.ts` 录入至少一个公开用例。练习实现 `solve` 函数，可直接返回值或返回 Promise。判题支持正常 JSON 形状的返回值，并严格比较类型、数组顺序与对象字段。运行练习时使用第一个用例，提交时执行全部用例。

Monaco 和语言 Worker 仅在进入学习工作区后加载。JS 与编译后的 TS 以 ES 模块在隔离 iframe 创建的临时 Worker 中执行。该 iframe 使用不透明源，CSP 禁止联网，有独立的 Worker 执行时限。Fetch、浏览器存储和页面 DOM 相关课程使用离线夹具。测试输入和期望输出均可从前端读取。代码、通过记录和最近学习位置保存在当前浏览器。沙箱限制浏览器能力，无法提供独立进程级内存配额。

## Go 语言学习

课程位于 `/practice/go/`，与 JS/TS 学习共用编辑器、阅读工作区和判题界面。两门课程分别保存进度。Go 的教程、题目及用例位于 `src/data/go/`。每个测试用例在 `args` 中保存 Go 参数表达式，在 `expected` 中保存可与返回值比较的 JSON 数据。

安装与 `tools/go-runner/go.mod` 对应的 Go 工具链后，在项目根目录运行：

```bash
npm ci
npm run go:build
npm run dev
```

GitHub Pages 工作流会先生成 Go 沙箱产物，再构建整站。Go WebAssembly 和对应的 `wasm_exec.js` 在点运行时才加载。Yaegi 在限时 Worker 中解释单文件 `package main`。Monaco 提供 Go 高亮和关键字补全，解析和类型错误在运行时显示。运行器只暴露课程使用的标准库 API，文件访问、联网和第三方包不可用。HTTP 章节用离线数据练习服务边界。

个别行为与原生 Go 有差异，例如类型化 nil、直接把可变变量作为 defer 参数，以及直接返回 channel 接收表达式。课程示例选用两种环境下结果一致的写法。

## AI Chat 功能结构

AI Chat 分为三层：

1. 博客前端：`src/components/AiChat.astro`
   - 负责右下角入口、聊天面板、推荐问题、消息渲染、localStorage、加载态和错误提示。
   - 只调用公开的 `PUBLIC_AI_API_URL`。
   - 不读取、不保存、不暴露任何模型 API Key。

2. 静态知识上下文：`src/pages/ai-context.json.ts`
   - 使用 Astro Content Collections 读取 `src/content/posts/`。
   - 生成公开的文章索引，包括 title、description、category、tags、slug、pubDate、url 和精简正文 excerpt。
   - 使用 `withBase()` 处理 GitHub Pages 的 base path。

3. 独立 Serverless API：`netlify/functions/chat.ts`
   - 暴露 `POST /api/chat`。
   - 读取 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 等私密环境变量。
   - 拉取 `ai-context.json`，构造 system prompt。
   - 调用 OpenAI-compatible Chat Completions API。
   - 返回 `{ message: { role: "assistant", content: "..." } }`。

## AI Chat 数据流

```text
访客浏览器
  -> AiChat.astro
  -> POST PUBLIC_AI_API_URL
  -> Netlify Function /api/chat
  -> 读取 BLOG_CONTEXT_URL 或 /ai-context.json
  -> buildSystemPrompt()
  -> OpenAI-compatible /chat/completions
  -> 返回 AI 回答
  -> 前端渲染消息和文章链接
```

## 环境变量

复制 `.env.example` 作为本地参考，但不要提交真实 `.env`。

前端变量：

```bash
PUBLIC_AI_API_URL=https://your-netlify-site.netlify.app/api/chat
```

Serverless API 变量：

```bash
AI_API_KEY=your-real-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_MAX_TOKENS=700
AI_ALLOWED_ORIGINS=http://localhost:4321,http://127.0.0.1:4321,https://jiasuxie92-jpg.github.io
BLOG_CONTEXT_URL=https://jiasuxie92-jpg.github.io/Blog/ai-context.json
```

说明：

- `AI_API_KEY` 只能配置在 Netlify 等 Serverless 平台。
- `PUBLIC_AI_API_URL` 会进入前端构建产物，因为它只是 API 地址，不是密钥。
- `AI_ALLOWED_ORIGINS` 只填写 origin，不包含路径。GitHub Pages 项目页 `/Blog/` 的 origin 仍是 `https://jiasuxie92-jpg.github.io`。
- 如果 Netlify 也部署了同一份静态站点，`BLOG_CONTEXT_URL` 可以不填，函数会尝试读取同源 `/ai-context.json`。
- 如果博客继续只放在 GitHub Pages，而 Netlify 只作为 API 服务，建议设置 `BLOG_CONTEXT_URL` 指向 GitHub Pages 上的 `ai-context.json`。

## GitHub Pages 配置 API 地址

GitHub Actions 会读取仓库变量 `PUBLIC_AI_API_URL`：

```yaml
PUBLIC_AI_API_URL: ${{ vars.PUBLIC_AI_API_URL }}
```

配置步骤：

1. 打开 GitHub 仓库 Settings。
2. 进入 Secrets and variables -> Actions -> Variables。
3. 新增变量 `PUBLIC_AI_API_URL`。
4. 值填写 Netlify Function 地址，例如 `https://your-netlify-site.netlify.app/api/chat`。
5. 重新触发 GitHub Pages workflow。

不需要在 GitHub Pages 配置 `AI_API_KEY`。

## 部署到 GitHub Pages

当前 workflow 保持原有 GitHub Pages 部署方式：

1. 推送到 `main` 分支。
2. GitHub Actions 执行 `npm ci`。
3. 执行 `npm run build`。
4. 上传 `dist`。
5. GitHub Pages 发布静态站点。

workflow 会自动设置：

```yaml
SITE_URL: https://${{ github.repository_owner }}.github.io
BASE_PATH: /${{ github.event.repository.name }}
```

`astro.config.mjs` 会用这些变量生成正确的 `site` 和 `base`。

## 部署 AI Serverless API

推荐第一版使用 Netlify Functions：

1. 在 Netlify 创建新站点，连接这个 GitHub 仓库。
2. Build command 使用 `npm run build`。
3. Publish directory 使用 `dist`。
4. Netlify 会根据 `netlify.toml` 识别 `netlify/functions`。
5. 在 Netlify Site configuration -> Environment variables 中配置：
   - `AI_API_KEY`
   - `AI_BASE_URL`
   - `AI_MODEL`
   - `AI_MAX_TOKENS`
   - `AI_ALLOWED_ORIGINS`
   - `BLOG_CONTEXT_URL`
6. 部署后，API 地址通常是：

```text
https://your-netlify-site.netlify.app/api/chat
```

然后把这个地址填回 GitHub 仓库变量 `PUBLIC_AI_API_URL`。

## 切换 AI 模型

后端使用 OpenAI-compatible Chat Completions 格式。切换模型时只需要改 Netlify 环境变量：

```bash
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_API_KEY=你的 DeepSeek Key
```

或使用 OpenRouter、通义千问等兼容 OpenAI `/chat/completions` 的服务。

## 修改博主资料

编辑：

```text
src/data/profile.ts
```

这里维护：

- 博主简介
- 教育经历
- 研究方向
- 技术栈
- 项目
- 联系方式
- 当前关注
- TODO 占位资料

请优先在这里补充信息，不要把个人资料写散到组件里。

## 修改 AI System Prompt

编辑：

```text
src/lib/ai/systemPrompt.ts
```

这里定义 AI 的角色、回答边界、文章推荐方式和禁止编造原则。

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

新增文章后，`ai-context.json` 会在构建时自动更新，AI 就能读取新的文章索引。

## 基础安全与成本控制

第一版已经包含：

- 前端限制单条输入 `1000` 字符。
- API 再次限制单条消息 `1000` 字符。
- API 只保留最近 `16` 条历史消息。
- 前端 localStorage 只保存最近 `20` 条消息。
- API 设置 `AI_MAX_TOKENS`，默认 `700`。
- 空输入校验。
- 防止重复快速发送。
- API 失败时返回友好错误，不暴露服务端堆栈。
- Netlify Function 内存级简单 rate limit。
- CORS origin 白名单。

生产环境如果访问量变大，建议升级为平台级或 KV 级限流。

## 常见错误排查

### 聊天按钮能打开，但发送时报“AI API 尚未配置”

说明前端构建时没有设置 `PUBLIC_AI_API_URL`。在 GitHub Actions Variables 中添加该变量后重新部署。

### API 返回“AI API 尚未配置”

说明 Netlify 环境变量中没有设置 `AI_API_KEY`。

### 浏览器 CORS 报错

检查 Netlify 环境变量 `AI_ALLOWED_ORIGINS` 是否包含博客 origin，例如：

```text
https://jiasuxie92-jpg.github.io
```

### AI 不知道最新文章

检查：

1. GitHub Pages 是否已经重新构建。
2. `https://你的博客地址/Blog/ai-context.json` 是否能访问。
3. Netlify 的 `BLOG_CONTEXT_URL` 是否指向正确地址。

### 想隐藏 AI Chat

可以暂时不设置 `PUBLIC_AI_API_URL`，聊天入口仍会显示，但不会实际请求模型。若要完全移除入口，请从 `src/layouts/BaseLayout.astro` 删除 `<AiChat />`。

## 后续可升级方向

- 流式输出。
- 更精细的文章匹配和引用展示。
- Cloudflare KV 或 Netlify Blobs 限流。
- 单独的项目详情数据文件。
- 自动从 GitHub API 同步项目更新时间。
- 更完整的 About 页面资料和 AI profile。

第一版暂不包含登录、数据库、向量数据库、Embedding、复杂 RAG、语音聊天、图片生成、多 Agent 或管理后台。

### 文章归档分类

文章 frontmatter 的 `categories` 可填写一个或多个固定分类：`Java 后端`、`前端开发`、`人工智能`、`开发工具`、`算法与数据`、`学习笔记`。例如：

```yaml
category: "Backend" # 保留原有分类，供旧分类页面和链接使用
categories: ["Java 后端", "开发工具"]
```

未设置 `categories` 的历史文章会根据原 `category` 自动归入对应归档分类；原分类和标签数据不会被更改。新文章仍需填写 `category` 以兼容现有页面。
