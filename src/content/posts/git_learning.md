---
title: "Git 的日常使用"
description: "从初始化、提交、分支到推送，整理一套够日常项目使用的 Git 基础流程。"
pubDate: 2026-07-06
category: "Deployment"
tags: ["Git", "GitHub", "Workflow"]
---

Git 最有价值的地方，不是记住很多命令，而是让项目的变化有迹可循。它能帮你知道自己改了什么、为什么改、什么时候可以回到上一个稳定状态。

## 为什么需要 Git

在写课程作业、实验代码或个人项目时，我们很容易得到一堆类似 `final_v2_real.py` 的文件。短期看像是备份，时间一长就很难判断哪个版本可靠。

Git 把这些变化放进一条清楚的历史线里。你可以放心尝试新想法，也可以在出错时退回到之前的提交。

## 一个最小工作流

进入项目目录后，先初始化仓库：

```bash
git init
```

查看当前状态：

```bash
git status
```

把准备提交的文件加入暂存区：

```bash
git add .
```

提交一次清楚的记录：

```bash
git commit -m "docs: add Git learning notes"
```

## 分支适合用来试错

如果你要尝试一个不确定的新功能，不建议直接在主分支上改。可以先开一个分支：

```bash
git checkout -b feature/new-idea
```

确认这个方向可行后，再回到主分支合并：

```bash
git checkout main
git merge feature/new-idea
```

## 和 GitHub 同步

第一次把本地项目推到远程仓库时，可以设置上游分支：

```bash
git push --set-upstream origin main
```

之后日常同步通常只需要：

```bash
git pull
git push
```

## 常用命令备忘

```bash
git status
git log --oneline
git diff
git branch
git switch main
git restore path/to/file
```

我的建议是：先把 `status`、`add`、`commit`、`push` 这条线用熟，再逐步理解分支、合并和回滚。工具应该先服务于项目，而不是变成新的负担。
