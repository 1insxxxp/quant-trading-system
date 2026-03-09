# Topbar Simplification Design

## Goal

进一步压缩后台壳层的视觉占用，删除顶部导航右侧的状态块，并修复信息提示层被顶栏遮挡的问题。

## Changes

- 顶部导航只保留左侧折叠按钮和标题 `后台工作台`
- 删除右侧 `市场 / 标的 / 周期 / 连接` 四个状态块
- 让 tooltip 层级高于固定顶栏，避免提示被遮挡

## Rationale

- 顶栏的核心职责应该是提供全局导航入口，而不是重复展示页面内部已经能看到的信息
- 市场、标的、周期和连接状态在主工作区里已经有足够上下文，继续保留在顶栏只会增加噪音
- tooltip 被固定顶栏遮挡会直接破坏信息可读性

## Files To Touch

- `frontend/src/components/SystemTopbar.tsx`
- `frontend/src/components/SystemTopbar.test.tsx`
- `frontend/src/components/InfoTip.tsx`
- `frontend/src/index.css`

## Validation

- 顶栏只剩折叠按钮和标题
- tooltip 在顶栏之上显示，不被遮挡
- 前端测试通过
- 前端构建通过
