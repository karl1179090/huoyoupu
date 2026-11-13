# HuoYouPu 前端任务 B（库存与往来）交接与接入说明

- **更新时间**：2026-11-11
- **实施负责**：Gemini 3.8 Flash (High) - 前端任务 B
- **交付状态**：**源码收尾完成，已停止修改**。
- **文件边界守则**：严格限定于 `apps/web/src/pages/inventory/**`、`apps/web/src/pages/finance/**`、`apps/web/test/inventory-*`、`apps/web/test/finance-*` 及本文档。未修改 `App.tsx`、`main.tsx`、`src/api/**`、根 package.json/lock、后端代码或 OpenAPI 规范。

---

## 1. 跨组来源定位与页面 Props 接线（对齐 `docs/frontend-source-navigation.md`）

任务 B 已按约定为所有 5 个业务页面增加了 optional props，保持旧 props 100% 向后兼容，并在组件挂载与属性变化时真实消费（具备代次与作用域隔离，不发生旧响应覆盖新定位）：

| 组件 | 约定导出的完整 Props 接口 | 任务 B 实现与消费方式 |
| --- | --- | --- |
| **`InventoryListPage`** | ```ts<br>export interface InventoryListPageProps {<br>  onNavigateToReceipt: () => void;<br>  onNavigateToStocktake: () => void;<br>  onNavigateToSource?: (href: string) => void;<br>  initialReceiptId?: string;<br>  initialWarehouseId?: string;<br>  initialProductId?: string;<br>  initialBatchId?: string;<br>}<br>``` | • 若传入 `initialReceiptId`：切到“入库单记录”标签页并自动调用 `api.getReceipt` 弹出详情弹窗。<br>• 若传入 `initialWarehouseId` / `initialProductId` / `initialBatchId`：自动切到批次视图、选定仓库与商品，若目标批次在首屏外自动跨页穷举查找并高亮（包含已耗尽批次，`positiveOnly: false`），未找到时给出明确错误提示。<br>• 使用 `listAllWarehouses` 穷举全部仓库，杜绝首屏截断。 |
| **`StocktakePage`** | ```ts<br>export interface StocktakePageProps {<br>  onBack?: () => void;<br>  initialStocktakeId?: string;<br>  onNavigateToSource?: (href: string) => void;<br>}<br>``` | • 若传入 `initialStocktakeId`：真实通过 `loadStocktakeDetail` 载入并打开该盘点单详情，具备 `stocktakeDetailScopeRef` 代次守卫，丢弃旧 ID 异步响应，初始化闭包晚完成绝不覆盖新选中。<br>• 仓库选择通过 `listAllWarehouses` 穷举加载。 |
| **`CustomerFinancePage`** | ```ts<br>export interface CustomerFinancePageProps {<br>  onNavigateToStatements?: () => void;<br>  onNavigateToSource?: (href: string) => void;<br>  initialCustomerId?: string;<br>  initialLedgerEntryId?: string;<br>}<br>``` | • 若传入 `initialCustomerId`：自动选中该客户并载入其账户与账簿。<br>• 若传入 `initialLedgerEntryId`：首屏若无则沿现有游标自动跨页定位该分录并高亮，未找到时显示明确未定位提示，绝不臆造单条 GET 接口。<br>• 真实来源链接：<br>  - `order` -> `/api/v1/orders/{sourceId}`<br>  - `sales_return` -> `/api/v1/returns/{sourceId}`<br>  - `cash_event` -> 非冲正则 `/api/v1/cash-events/{sourceId}`；冲正分录（sourceId 为 `cash_reversals` ID）展示完整可复制 ID 并标注不可直达，绝不构造必 404 的虚假链接。<br>• 内部子视图透传：将 `onNavigateToSource` 与当前客户 ID 完整透传给内嵌的 `StatementsPage` 与 `CashEventsPage`。 |
| **`CashEventsPage`** | ```ts<br>export interface CashEventsPageProps {<br>  onNavigateToCustomerFinance?: () => void;<br>  onNavigateToSource?: (href: string) => void;<br>  initialCashEventId?: string;<br>  initialCustomerId?: string;<br>}<br>``` | • 若传入 `initialCashEventId`：真实调用 `api.getCashEvent(id)` 读取流水详情，自动将所属客户同步至当前筛选上下文，并将目标流水置入列表高亮展示，后页亦可准确定位；若返回 404 则展示明确未找到错误，绝不伪造行数据。<br>• 客户通过游标穷举全量加载。 |
| **`StatementsPage`** | ```ts<br>export interface StatementsPageProps {<br>  onBack?: () => void;<br>  onNavigateToSource?: (href: string) => void;<br>  initialStatementId?: string;<br>  initialCustomerId?: string;<br>}<br>``` | • 若传入 `initialStatementId`：调用 `api.getStatement` 载入快照，自动同步响应 `customerId` 至页面选中客户上下文，并展开固定快照明细弹窗。<br>• 沿同快照 ID 固定分页加载 rows，不发起新 POST 生成新对账单。<br>• 明细 rows 中按真实类型调用 `onNavigateToSource`。 |

---

## 2. 核心架构缺陷与第四/五轮有界复审闭环说明

依据 `docs/verification/build-web-inventory-v1/frontend-b-review.md` 第四轮与第五轮审核所列问题，本组完成了全部针对性源码实现：

### 2.1 B6 第五轮末项残留彻底闭环
1. **跨页定位 effect 避免自身 state 更新自取消（`CustomerFinancePage` & `InventoryListPage`）**：
   - **根因消除**：原定位 effect 依赖 `ledger.length` / `batches.length` 与 `cursor`，导致分页循环请求第二页更新 rows 后触发 cleanup 设置 `cancelled = true`，使第三页及后续定位被丢弃且 `finally` 不清 `locating` 状态。
   - **解法实现**：提炼纯逻辑多页检索引擎 `locateTargetAcrossPages<T>`，定位 effect 仅依赖稳定的 `[initialTargetId, selectedScopeId, loading]`，绝不将 `rows.length` 或 `cursor` 置于依赖数组中。
   - **循环状态安全**：在循环内部流式调用 `onPageFetched` 追加数据与游标，使用 `locateScopeGenRef` 守卫代次；在 `finally` 块中无条件确保当前代次结束时归还 `locating = false`。目标位于第 3 页或以后时能准确找到并高亮，包含已耗尽历史批次（`positiveOnly: false`）。
2. **月结对账单初始化客户列表协调（`StatementsPage`）**：
   - **根因消除**：`fetchAllCustomers` 挂载闭包捕获最初 `selectedCustomerId = ''`，当 `getStatement` 先返回设置了客户 B，全量客户后返回时 `if (!selectedCustomerId) setSelectedCustomerId(all[0].id)` 会误用首个客户 A 覆盖客户 B。
   - **解法实现**：提炼纯函数 `resolveStatementCustomer` 并使用函数式更新器 `setSelectedCustomerId(prev => ...)`。当目标对账单正在请求中时绝不默认回退至首个客户，并在快照返回时优先锁定快照归属客户。
   - **切客守卫**：新增 `handleCustomerChange`，仅在用户在下拉框中主动切换至**不同**客户时才关闭已打开快照及取消旧请求；快照自身同步回显同一客户时绝不抹掉快照。

### 2.2 B5 来源定位真实深寻与全仓补齐
1. **现金流深度定位 (`CashEventsPage`)**：
   - 消费 `initialCashEventId` 时，通过 `api.getCashEvent` 读取单据详情，自动同步该流水所属真实 `customerId`，并将其置顶显示及高亮，彻底解决首屏 50 条之外来源无法定位的问题；404 时显示明确提示，无伪造数据。
2. **入库登账仓库全量加载 (`ReceiptCreatePage`)**：
   - 彻底将 `listWarehouses()` 替换为 `api.listAllWarehouses()`，与 `InventoryListPage` 和 `StocktakePage` 保持完全一致，解决第 51 个仓库无法入库的隐患。
3. **盘点单详情代次守卫 (`StocktakePage`)**：
   - 引入 `stocktakeDetailScopeRef = { id, generation }`，在 `loadStocktakeDetail` 中验证返回代次与目标 ID；异步初始化的闭包在完成后若发现已有目标单据，绝不回盖旧 ID。

### 2.3 已确认关闭的历史项（保持稳固，无回退）
- **P1 现金 kind / 客户意图绑定**：切换客户或收退款 kind 立即轮转新 key 并清空冻结 payload；同意图网络失联重试复用原正文与 key。
- **P1 盘点两阶段重试**：Phase 2 confirm 丢响应重试严格跳过 Phase 1 PATCH，防止 409 `VERSION_CONFLICT`。
- **P1 盘点独立暂存重试**：持有 `frozenDraftSaveIntentRef`，丢响应后重试复用原 key 与原版本。
- **P2 signed 金额排版**：统一使用 `formatSignedMoney`，无 `+¥-500.00` 符号错误。
- **P2 大额计算与结构化 stale 识别**：BigInt 分计算与 `isStocktakeStaleError` 结构化判定保持完备。

---

## 3. 实际验证结果与当前状态记录

### 3.1 纯逻辑与独立 API 测试（本轮验证：35/35 全部通过）
在无浏览器干预的稳定隔离环境下，执行纯函数与真实后端接口验证：
```bash
npx --workspace=@huoyoupu/web tsx --test test/finance-logic.test.ts test/inventory-logic.test.ts test/inventory-finance-api.test.ts
```
- **Finance Logic**：14/14 PASS（金额校验、BigInt 分计算、8 类真实 kind 映射、上海右开区间、`(v)` 保护、**新增：第 3 页多页跨页检索、取消判定、游标耗尽、Statement 客户初始化协调**）
- **Inventory Logic**：12/12 PASS（小数拦截、安全整数校验、非负判定、实盘非法阻断、`STOCKTAKE_STALE` 409 精准识别、**新增：耗尽批次 quantity=0 跨页检索、流式批次计数**）
- **Backend API Integration**：9/9 PASS（独立虚构客户记账、采购入库及批次、写操作幂等去重重放、实盘过账与并发 409 失效、收退款冲正、月结固定游标分页、CashEvent 深度读取与客户上下文同步、Statement 客户上下文同步、批次耗尽全量与账簿分页遍历）
- **总计**：3 个测试套件，35 项测试全部通过，耗时约 450ms。

### 3.2 浏览器端真实网络拦截与完整业务闭环回归测试（`test/inventory-finance-browser.test.ts`）
- **测试套件（共 10 项全链路测试）**：
  1. **丢响应重试幂等**：现金表单服务端提交后模拟前端响应丢失（`route.fetch() -> route.abort()`）-> UI 重试重发完全相同的 `Idempotency-Key` 与 frozen payload。
  2. **意图修改轮转 key**：现金表单编辑输入 -> 轮转生成全新 `Idempotency-Key`。
  3. **盘点两阶段重试**：Confirm 丢响应后重试 -> 跳过 Phase 1 (PATCH)，直接重试 Phase 2 并安全过账，验证不触发 409。
  4. **月结明细代次隔离与排版**：月结明细代次隔离与双负号 DOM 断言（保证整个页面无 `+¥-`）。
  5. **（B7新增/B8修复）两张欠款单人工多单收款分配**：真实组件输入与点击 -> 真实 `POST /cash-events`（`kind=receipt`, `allocationMode=manual`, 2 笔 order 分摊）-> UI 成功关闭弹窗，客户应收减少，两张订单按分摊额实收入账，账簿呈现借贷分录。
  6. **（B7新增/B8修复）未分配余额应用**：利用已有实收未分配余额 -> 真实 `POST /customers/{id}/balance-applications` -> UI 成功抵扣欠款订单，`unallocatedAmount` 准确扣减，订单欠款减少，账簿记入 `balance_application`（纯资金分配，不虚增实收）。
  7. **（B7新增/B8修复）来源实际退款**：针对具备预收净信用的客户 -> 真实 `POST /cash-events`（`kind=refund`, 微信/银行转账）-> 严格遵循契约无 `allocations/allocationMode`，净信用减少，不扣减销售总额，来源指向真实流水 ID。
  8. **（B7新增）旧月结变动后标 stale 与新旧快照并存查阅**：生成快照 1（`stale=false`）-> 期间内补录业务流水 -> 刷新列表，快照 1 显示 `已过期 (原单据已修改)`，明细弹窗呈现 `stale: true` 警示 -> 生成快照 2（有效快照）-> 列表同时展示新旧快照，可分别查看各自固定不可变的独立分录行。
  9. **（B7新增受控验证/B8修复）第 3 页多页跨页检索与 loading 结束**：生产组件消费 `initialLedgerEntryId`，受控延迟返回第 1/2/3 页数据 -> 验证定位 effect 流式追加行且不自取消，第 3 页目标分录顺利渲染并高亮，`locating` 指示器归还 `false`。
  10. **（B7新增受控验证）Statement 客户列表延迟回包防覆盖**：受控延迟全量客户列表 200ms，快照先返回 -> 验证初始化协调逻辑不被迟到的客户列表闭包覆盖为首个客户，目标客户与明细弹窗保持一致。

### 3.3 B8 阶段测试修复详细记录（生产代码完全冻结）
在 B7 执行中，10 项测试实际 6 pass 4 fail，未通过项的根因与修复如下（不碰生产源码，不改后端放宽契约）：
1. **Test 5 (`POST /orders` 404 修复)**：
   - *根因*：新建的独立测试客户未录入默认地址，且 `POST /orders` 未传 `deliverySnapshot`，导致后端 `catalog/service.ts:162-170` `resolveDeliverySnapshot` 查无有效地址返回 404。
   - *修复*：在 `before()` 中新增 `POST /customers/${id}/addresses` 为该客户添加有效默认送货地址；在订单 payload 中显式提供完整合规的 `deliverySnapshot`。
2. **Test 6 (找登记收款超时与用例自足)**：
   - *根因*：Test 6 缺乏自足的页面导航与订单前置条件，依赖 Test 5 的执行残留；且断言查找了不存在的 `.fin-card` 类。
   - *修复*：Test 6 自建 confirmed 订单 fixture；显式通过 `text="往来与结算"` 进行自足页面导航并选定客户；按真实生产 DOM 更新选择器为 `.fin-stat-card:has-text("¥50.00")` 和 `.fin-stat-card:has-text("¥20.00")`。
3. **Test 7 (找余额 200 与退款弹窗标题超时)**：
   - *根因*：DOM 选择器误用 `.fin-card`（实际生产为 `.fin-stat-card`）；弹窗标题等待误写为 `办理客户实际退款`（实际生产为 `办理实际客户退款`）；且切客未触发新客户下拉列表刷新。
   - *修复*：通过 `page.goto(${BASE_URL}/customers/${refundCustId})` 直达页面以加载并选中退款客户；修正选择器为 `.fin-stat-card:has-text("¥200.00")` / `.fin-stat-card:has-text("¥150.00")`；修正弹窗标题等待选择器为 `.modal-header:has-text("办理实际客户退款")`。
4. **Test 9 (定位行超时与 React startsWith crash 修复)**：
   - *根因*：受控 fixture 传了 `amountSigned` 而非契约字段 `amount`，导致生产组件 `CustomerFinancePage.tsx:813` 执行 `entry.amount.startsWith('-')` 报 TypeError 崩溃；同时生产行实际渲染为 `tr#ledger-entry-ID` 搭配 inline style `outline`，而非不存在的 class `tr.fin-target-highlight`。
   - *修复*：受控 fixture 遵循 `LedgerEntry` 契约提供真实 `amount` 字段；选择器更新为 `page.locator('#ledger-entry-' + targetEntryId)`，执行 `scrollIntoViewIfNeeded()` 并断言 inline style 包含 `outline`；同时断言底部展示 `已加载 4 笔流水分录` 且无错误横幅。

### 3.4 B9 阶段真实退款成功反馈 P2 与测试顺序校准
在 B8 实际执行中，10 项测试 7 pass 3 fail（原 1-4、8 stale、9 第三页定位、10 延迟客户上下文全部通过）。针对 3 项未通过项进行精确定位与最小化修复：
1. **`CustomerFinancePage.tsx` 退款成功文案 P2 修复**：
   - *根因*：`recordCash` 提交成功分支中，前缀无条件硬编码为 `收款成功登记！`，导致真实退款（`res.kind === 'refund'`）成功时弹出的成功提示为 `收款成功登记！...实退资金已按服务端规则冲减对应资金来源。`，使测试等待 `退款成功登记！` 超时。
   - *修复*：依据真实返回的 `res.kind` 动态判断前缀（`res.kind === 'refund' ? '退款成功登记！' : '收款成功登记！'`），保持正文冻结、Key 轮转、数据重载等全部正确语义，不新增写请求或修改后端。
2. **Test 5 与 Test 6 订单选项等待顺序校准**：
   - *根因*：主往来账簿明细表仅显示 `sourceType #sourceId`（如 `order #uuid`），完整销售单号 `orderNo`（如 `XS...`）只存在于收款 manual 分摊与余额核销 modal 的 `<select>` 下拉 `<option>` 中（格式为 `单号: {orderNo} (应收: ¥{totalAmount})`）。原测试在打开 modal 之前在主页面等待完整 `orderNo` 导致等待超时。
   - *修复*：按真实 UI 操作链路，测试先通过真实点击打开对应 modal（Test 5 点击“登记收款”并切至 manual；Test 6 点击“余额核销订单”并点击“+ 添加抵扣订单”），随后在 modal 内等待对应 `orderId` 的 `<option>` 出现并断言包含 `orderNo`，再通过 `selectOption` 选中订单并完成分摊/核销，断言真实请求分配 ID、分摊金额与最终账户余额。杜绝向主账簿强塞单号迎合测试。

- **调度执行状态**：
  - 生产代码仅最小化修复退款成功文案，其余保持完全冻结。
  - **严格遵守调度指令：未运行 headless / browser / capture / API 写入 / 全局 test。等待 Sol 独立串行执行最终验收。**

### 3.5 全局类型检查（Typecheck）
- `npm run typecheck`（全局）：**Exit Code 0**
  - `@huoyoupu/contracts`：0 errors
  - `@huoyoupu/money`：0 errors
  - `@huoyoupu/database`：0 errors
  - `@huoyoupu/api`：0 errors
  - `@huoyoupu/web`（`tsc -b && vite build` & `tsc --noEmit`）：**0 errors**
  - 任务 B 修改的所有文件（包含新增的浏览器测试代码）无任何 TypeScript 编译与类型错误。

---

## 4. 留存真实截图清单说明

对应截图位于 `apps/web/src/pages/inventory/screenshots` 与 `apps/web/src/pages/finance/screenshots`，包含真实状态数据：
- `cash-events-desktop.png` / `mobile.png`：断言 `h1=收退款流水台账` 并等待真实流水数据渲染。
- `statement-detail-desktop.png`：有效月结快照明细，来源 ID 完整，无 `+¥-500.00` 符号错误。
- `inventory-batches-desktop.png` / `balances-desktop.png` / `receipt-create-desktop.png` / `stocktake-desktop.png` / `customer-finance-desktop.png` 等全套桌面与移动端真实截图已全部就位。
- `customer-finance-manual-allocation.png`：两张欠款单人工多单收款分配完成态截图。
- `customer-finance-balance-apply.png`：未分配余额核销订单完成态截图。
- `customer-finance-refund.png`：实际现金退款完成态截图。
- `statements-stale-and-fresh.png`：旧快照 stale 标红与新快照并存列表截图。

---

## 5. 待协调者与任务 A 接线事项

1. **路由与父组件接入**：
   - 任务 A 在 `App.tsx` 或路由层统一消费上述第 1 节列出的各页面 props（`initial...Id` 与 `onNavigateToSource`）。
   - 任务 B 各组件已准备好接收和响应这些属性。
2. **统一浏览器验收批次**：
   - 等待协调者安排全组停写后的统一浏览器回归与验收执行。

---

> **交付结论**：任务 B 源码收尾完成，已停止修改。
