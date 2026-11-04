# Shelfy · 第一阶段

独立 Astro + TypeScript 角色工作台。未接入博客页面，无新增运行时动画依赖。

## 运行

在本目录运行 `npm run dev`，打开终端显示的本地地址（通常 http://localhost:4323/）。当前可复用上级博客的 node_modules；单独复制项目后先运行 `npm install`。

`npm run build` 执行 Astro 类型检查与静态构建，`npm run preview` 预览构建产物。

## 结构

- src/components/Shelfy.astro：SVG 角色与书籍配置，部件使用 data-part 标识。
- src/lib/animator.ts：互斥动作、随机眨眼、暂停与清理；使用原生 Web Animations。
- src/pages/index.astro：独立调试页面与自定义元素生命周期。

Idle 保留 6° 右倾，轻微摆动与部件次级运动。Happy 约 1.8 秒，结束恢复 Idle。Blink 间隔 3–7 秒，22% 概率双眨眼。暂停同时冻结动作和眨眼等待；重置保持当前播放/暂停选择。系统减少动态效果时关闭 Idle 和自动眨眼，Happy 简化为短暂表情变化。

后续可在动画控制器新增 Greeting、Oops、Reading、Sleepy；SVG 可继续拆分为部件组件。当前不包含博客互动、聊天或 RAG。

