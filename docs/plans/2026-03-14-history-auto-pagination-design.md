# 历史 K 线连续自动加载设计

**背景**

当前行情页在用户把图表拖到最左边时，只会触发一次历史分页。后端已经修复了 `hasMore` 的错误判定，但前端在 prepend 历史 K 线后会把当前视口整体右移，导致逻辑范围脱离左边缘阈值，后续不再继续自动加载。

**目标**

- 当用户已经把图表拖到最左边时，历史分页加载完成后自动继续加载下一页
- 只要图表仍然靠近左边缘且后端返回 `hasMore=true`，就持续自动补页
- 如果用户在加载过程中把视口拖离左边缘，则停止连续自动补页
- 失败时保留现有错误提示和重试能力

**设计**

1. 在图表层增加“左边缘连续加载锁定”状态
   - 当 `visibleFrom` 进入左边缘阈值并触发历史加载时，标记为 `edgePinned=true`
   - 如果用户在加载过程中继续操作并把视口移离阈值，立即取消该标记

2. prepend 历史 K 线时区分两种视口恢复方式
   - 常规模式：保持当前可见数据不跳动，沿用现有 `from + prependedCount`
   - 左边缘连续加载模式：不再把视口整体右移，而是将视口保持在新的左边缘，使下一页自动检测仍然成立

3. 加载完成后自动重检
   - 历史分页请求结束后，如果仍处于左边缘锁定状态、没有错误、且 `hasMoreHistoricalKlines=true`，则继续请求下一页
   - 通过前端单飞状态复用现有 `isLoadingOlderKlines`，避免并发分页

4. 错误与终止条件
   - 一旦 `olderKlineLoadError` 非空，停止自动连续加载，等待用户手动重试
   - 一旦 `hasMoreHistoricalKlines=false`，停止自动连续加载
   - 一旦用户把视口拖离左边缘阈值，停止自动连续加载

**影响范围**

- `frontend/src/components/KlineChart.tsx`
- `frontend/src/components/klineChartData.ts`
- `frontend/src/components/klineChartData.test.ts`
- 如有需要，补充 `frontend/src/components/KlineChart.test.tsx`

**测试策略**

- 为“左边缘连续自动加载”新增纯函数级测试，验证触发条件和 prepend 后视口锚定决策
- 运行现有图表数据测试与相关组件测试
- 构建前端确认类型和打包正常
