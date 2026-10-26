---
title: "REA 逆向工程入门：当 AI Agent 开始自己拆软件"
description: "介绍近期火爆的 REA（Reverse Engineer Anything）项目，从传统逆向痛点、REA 架构到一次 Electron 应用分析实战，聊聊 Agent 时代逆向工程的新可能。"
pubDate: 2026-10-16
category: "Security"
tags: ["逆向工程", "REA", "AI Agent", "MCP", "安全研究"]
---

2026 年 10 月，GitHub 上一个叫 REA（Reverse Engineer Anything）的项目在短短几天内收获了十几万颗星。它的口号很直接：**让 AI Agent 自己拆软件**。

这不是又一个“AI 帮你读代码”的玩具。REA 解决的是一个真正的硬问题：没有源码的情况下，如何理解一个程序内部某个功能是怎么实现的？过去这件事依赖逆向工程师多年积累的经验和手搓工具链；现在，REA 试图把整条调查流程交给 Agent 自动完成。

这篇文章会介绍 REA 出现的背景、它的核心设计，以及一次基于 Electron 应用的实战分析流程。

## 传统逆向工程卡在哪

逆向工程不是破解软件，而是在缺少源码时理解程序行为。正经用途包括恶意软件分析、协议理解、旧系统兼容、丢失源码的恢复、软件互操作性研究等。

但传统逆向有几个明显的痛点：

| 痛点 | 表现 |
| --- | --- |
| 工具门槛高 | IDA、Ghidra、Hopper、JADX 各有各的操作方式，光是熟悉界面就要几个月 |
| 流程黑盒 | 为什么追这个 XRef、为什么进这个函数，整个过程都在工程师脑子里 |
| 经验难复用 | 每个人的套路不同，换个人、换个目标往往要重新摸索 |
| 结论难验证 | 最终给出一个答案，但缺少可追溯的证据链 |

本质上，逆向不是单次算力问题，而是一套**调查流程**：搜索线索 → 追踪引用 → 查看调用图 → 反编译 → 重建逻辑。问题是，这套流程长期没有被标准化、接口化。

## REA 的核心思路

REA 的定位很克制：**它不自研反编译引擎，而是做一个 MCP 服务器，把已有的专业工具包装成 Agent 能直接调用的接口。**

MCP（Model Context Protocol）是 Anthropic 推动的开放协议，让 AI Agent 可以调用本地工具。REA 通过 MCP 把 Ghidra、Hopper、IDA、JADX、Chrome DevTools 等工具统一暴露出来，Agent 只需要用自然语言提问，REA 负责调度工具、收集证据、返回结构化结果。

整个工作流可以概括为三步：

1. **反编译**：根据目标类型选择合适工具，拿到原始证据。
2. **理解**：Agent 在函数、字符串、调用图之间追踪，解释功能机制。
3. **重建**：基于证据为你的项目生成对应的实现版本。

## 架构上的四个关键设计

REA 的仓库是 TypeScript + Node.js 的 monorepo。真正值得说的不是代码量，而是四个设计取舍：

### 1. 桥接层：多引擎可插拔

Hopper、Ghidra、IDA 的 API 各不相同，REA 用 `bridge/` 层把它们封装成一致的 MCP 工具接口。增加一个新的反编译引擎，只需要新增桥接实现，上层接口不变。

```bash
# 可通过环境变量切换引擎或调整超时
REA_HOPPER_STARTUP_TIMEOUT_MS=60000
REA_GHIDRA_STARTUP_TIMEOUT_MS=60000
```

### 2. 静态与运行时分离

不同目标的分析方式差异很大：

| 类别 | 目标 | 引擎 |
| --- | --- | --- |
| 原生二进制 | ELF / PE / Mach-O | Hopper / Ghidra / IDA |
| 托管代码 | JavaScript / Electron / .NET | 内置静态解析 |
| 移动端 | Android APK / Flutter / Apple 包 | JADX / Apktool |
| 网络固件 | HAR / pcap / 固件 | TShark / Binwalk |

静态分析直接读取文件，不运行目标；运行时捕获才与目标进程交互。

### 3. 结果契约：发现必须带证据

REA 要求每条结论都附带证据和局限性说明。Agent 拿到的不是“这个函数干这个”，而是“函数在地址 X、被 Y 调用、反编译伪代码是 Z、置信边界是 W”。

### 4. 安装即注入工作流指令

```bash
npx rea-agents setup
```

这条命令会完成三件事：注册 MCP 服务器、注入工作流指令（skill）、备份现有配置。重启 Agent 后，它就具备了逆向调查能力。官方支持 Claude Code、Cursor、Codex、Gemini CLI、Grok Build 等。

## 实战：分析一个 Electron 应用的剪贴板功能

下面以一个虚构的 Electron 笔记应用 `NotesApp` 为例，演示 REA 的一次完整分析流程。目标：找出它富文本剪贴板功能的实现链路。

### 准备工作

确保环境满足：

- Node.js ≥ 22
- 已安装 REA 支持的 Agent，例如 Claude Code
- 目标应用已本地安装

运行安装命令：

```bash
npx rea-agents setup
```

根据提示选择你要集成的 Agent，确认配置变更。setup 会自动备份原配置。

### 发起调查

在 Agent 中输入目标明确的任务。不要只说“分析这个应用”，而是限定功能和交付物：

```text
分析 /Applications/NotesApp.app，找出它富文本剪贴板复制功能的完整实现链路。
要求：
1. 展示渲染进程如何调用剪贴板 API
2. 追踪通过 preload 脚本的 IPC 调用
3. 找到主进程中实际写入剪贴板的函数
4. 给出证据：函数名、文件路径、关键代码片段
5. 最后为我生成一个最小可运行的 TypeScript 示例，复现相同的数据格式
```

### REA 的执行过程

Agent 接收到任务后，会通过 MCP 调用 REA 的工具链。典型调用链如下：

```text
Agent
  -> REA MCP Server
    -> analyze-javascript-application
      -> 解压 app.asar
      -> 解析 Webpack/Vite bundle
      -> 恢复 Source Map（如有）
    -> find-references
      -> 搜索 "clipboard" / "writeText" / "writeHTML"
    -> trace-call-graph
      -> 从渲染进程调用点追到 IPC 通道
    -> inspect-ipc-contract
      -> 解析 preload 脚本中的 channel 名称
    -> decompile-native / read-source
      -> 主进程中处理剪贴板的函数
```

### 预期发现的证据

REA 返回的结果通常是结构化证据，类似下面这样：

```json
{
  "observations": [
    {
      "type": "function",
      "location": "renderer/src/editor/clipboard.ts:42",
      "name": "copyRichText",
      "evidence": "调用 navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob })
      ])"
    },
    {
      "type": "ipc-channel",
      "location": "preload/clipboardBridge.ts:18",
      "name": "clipboard:copy-html",
      "evidence": "ipcRenderer.invoke('clipboard:copy-html', html, plainText)"
    },
    {
      "type": "main-process-handler",
      "location": "main/src/clipboardManager.ts:67",
      "name": "handleCopyHtml",
      "evidence": "clipboard.write({ text: plainText, html: html })"
    }
  ],
  "limitations": [
    "目标应用经过 minify，部分本地变量名已丢失",
    "未观测运行时加密或动态代码加载"
  ]
}
```

### 生成复现代码

基于证据，Agent 可以生成一个独立的最小示例：

```ts
// clipboard-demo.ts
import { clipboard, ipcMain, ipcRenderer } from "electron";

// 渲染进程调用侧
async function copyRichText(html: string, plainText: string) {
  return ipcRenderer.invoke("clipboard:copy-html", html, plainText);
}

// 主进程处理侧
ipcMain.handle(
  "clipboard:copy-html",
  (_event, html: string, plainText: string) => {
    clipboard.write({
      text: plainText,
      html,
    });
  }
);
```

这个例子展示了 REA 真正有价值的地方：它不仅告诉你“这个功能大概怎么做”，还给出了原应用中的具体调用链，并基于此生成可验证的实现。

## 社区中的硬核案例

REA 爆火的另一半原因是社区真的拿出了可验证的结果：

- **DX-Ball 声音算法**：从 1996 年的 x86 二进制中恢复声音左右声道定位函数，用 C 重写后 3205 个原始测试用例全部通过，63 个编译字节与原版一致。
- **Notion 剪贴板**：完整追踪 Electron 渲染进程 → preload → 主进程的剪贴板调用链，还原富文本数据格式。
- **Sony Sound Connect**：分析 Android 官方 App 的降噪功能链路，做出一个独立 App 直接开启 Wind Noise Reduction。
- **东方 TH04**：从 16 位汇编中恢复弹幕角度计算逻辑，并与历史编译器输出交叉验证。

这些案例的共同点：发布者大多不是专业逆向工程师，而是**会问问题的普通开发者**。

## 局限性与合法边界

REA 不是万能钥匙。遇到以下场景仍会卡住：

- 商业级混淆、虚拟机壳、反调试保护
- 内核驱动级逻辑
- 需要绕过 DRM 或授权验证的目标

REA 官方明确声明其仅用于合法研究、教育、互操作性、软件保存，或分析你拥有/被授权检查的软件。IDA Pro、Hopper 等商业工具也必须各自合法获取。社区案例大多集中在“逆向自家设备”或“分析自己有权使用的软件”，这条红线需要守住。

## 总结

REA 的真正意义，不在于它又造了一个反编译引擎，而在于它做了一件**编排层**的事：把几十年沉淀的专业工具接入 Agent，把原本只能装在脑子里的调查流程变成可复用的工作流指令，把“结论”变成“带证据的结论”。

它标志着 Agent 的能力边界正在从“读代码、写代码”扩展到“调用任何工具”。逆向工程只是最新被 Agent 化的领域之一。

对普通开发者来说，REA 让逆向的门槛从“熟练使用一堆 GUI 工具”降到了“清晰地提出问题”。这降掉的不是逆向本身的技术含量，而是经验的壁垒。最终，人仍然负责判断和验证，Agent 负责执行和收集证据。

如果你有兴趣尝试，建议从分析一个自己写的或拥有合法授权的小型应用开始，先把 `npx rea-agents setup` 跑通，再用一个具体功能点练手。理论和实践之间，往往只差一次完整的证据链追踪。
