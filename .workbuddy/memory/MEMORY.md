# 项目长期笔记：Personal Blog（Astro）

## 新增文章的固定格式
- 文章放 `src/content/posts/<slug>.md`，front matter 字段见 `src/content/config.ts`：`title`、`description`、`pubDate: YYYY-MM-DD`、`category`、`tags`，另有可选 `updatedDate`、`categories`、`pinned`、`draft`。
- `category` 是自由字符串（常用 Backend / Frontend / Database / AI / Deployment）；归档分类由 `src/lib/archiveCategories.ts` 映射，`categories` 可选字段只能取枚举里的中文值（Java 后端、前端开发、人工智能、开发工具、算法与数据、学习笔记）。
- 正文风格：开头 2~3 段引入与本文目标，章节用 `## 一、二、三…` 中文数字编号，多用表格、`text` 示意图、带语言标注的代码块、加粗的关键结论，结尾 `## 小结` + 参考资料链接；强调边界条件与常见误区，不写空泛套话。
- 校验：`npm run build`（构建成功即说明 front matter 和 Markdown 可解析），`dist/` 与 `.astro/` 已 gitignore。

## 写作偏好
- 用户要求技术文章「详细、结合实战、小白能看懂、干货不水」。技术长文可到 50KB+，代码示例应真实可编译，最好在本机建临时项目跑通 build/test 后再写进文章。

## 环境
- 本机 Go 1.27.4（Windows），`proxy.golang.org` 不通，`GOPROXY=https://goproxy.cn,direct` 可用。
