# 跨组来源定位与页面 props 接线约定

2026-11-11。本文是协调采用的兼容接线约定：**A保留并传递目标参数，B/C各自owner增加optional props并消费；现有props/回调保持兼容。** 本文没有修改前端实现，不代表新props或导航已经实现；B/C施工中的文件须由各owner落实。依据当前导出组件、共享OpenAPI、reporting/sources.ts和AI证据复用链。

## 1. 真实来源 href：先保留完整目标，再定位现有页面

`SourceRef`准确字段是`entityType/id/version/recordedAt/href`。href是服务端来源定位字符串，不是现有前端路由；`version`是数字或null，**不是UUID revisionId**。A不要只切菜单，不要把SourceRef.id无条件当父订单/盘点/退货ID；解析时同时保留原SourceRef供显示/复制。路径中的 `/api/v1` 前缀必须被识别，query与fragment不能丢。

以下是**当前实际报表来源生成路径**，AI answered.evidence复用同一报表sources，不另造AI路由：

| SourceRef.entityType | 当前生成的 href | 目标ID与最小定位方式 |
| --- | --- | --- |
| order_revision | `/api/v1/orders/{orderId}/revisions/{revisionId}` | id=revisionId；从路径同时取得父orderId与revisionId，已有getOrderRevision(orderId,revisionId)；打开订单历史只读版本，不能退回当前版冒充 |
| return | `/api/v1/returns/{returnId}` | id=returnId；已有getReturn(id)，SalesReturn响应含orderId/sourceRevisionId。可在已有订单/退货视图打开来源，不要求新建独立页面 |
| cash_event | `/api/v1/cash-events/{cashEventId}` | id=cashEventId；已有getCashEvent(id)，可打开现金台账详情/高亮，并从返回customerId定位客户 |
| batch | `/api/v1/inventory/batches?productId={productId}&warehouseId={warehouseId}#{batchId}` | id=batchId；query保留两个过滤ID，fragment保留目标批次。打开InventoryList批次视图，包含耗尽批次（positiveOnly=false）并续页定位；没有GET `/batches/{id}`详情端点 |
| ledger_entry | `/api/v1/customers/{customerId}/ledger#{entryId}` | id=entryId；父customerId来自路径、entryId来自fragment；沿getCustomerLedger(customerId,{cursor,limit})定位高亮，不能请求不存在的GET `/ledger-entries/{id}` |
| loss_entry | `/api/v1/stocktakes/{stocktakeId}` **或** `/api/v1/returns/{returnId}` | id仍是lossEntryId，**不是href中的盘点/退货ID**；按href定位真实来源：盘点损益指向盘点，退货损失/返库冲正指向退货。保留lossEntryId供对照，不自行拼loss详情endpoint |

`receipt/stocktake/restock`是SourceRef契约允许的entityType，但**当前六类报表sources没有独立生成这三类记录**。现有GET `/api/v1/receipts/{receiptId}`与GET `/api/v1/stocktakes/{stocktakeId}`可以供已有来源使用；不能根据enum猜出GET restock详情：契约只有POST `/api/v1/returns/{returnId}/restocks`，没有GET `/restocks/{id}`或GET返库列表。实际返库通过原退货详情/已持久化返库结果展示；没有父returnId时降级，不猜一个父ID。

实现辅助函数`source()`的通用默认字符串不等于对应端点真实存在：例如泛化fallback可能形似`/ledger-entries/...`，不能把它直接当可请求API。只对上表及已核实真实endpoint建立显式映射，其他情况显示完整信息。

**LedgerEntry不是SourceRef。** 月结/客户账簿行没有href，只有sourceType/sourceId/sourceVersion/reversesId等；不可用entityType的规则机械推导。尤其现金冲正分录sourceType同为cash_event，但sourceId可能是cash_reversals记录ID，并非可getCashEvent的原现金ID（finance/cash.ts冲正写入即如此）。无法可靠识别父单时显示完整可复制ID/版本/冲正关联，不构造一个必404的“来源详情”。

已核实账簿来源：`sourceType='order'`的sourceId是订单ID，sourceVersion是商业版本号（不是revision UUID）；`sourceType='sales_return'`的sourceId是退货ID，**不是字符串'return'**；`opening_balance`没有独立详情GET。订单历史若只有数字版本号，需要既有listOrderRevisions匹配revisionNo取得revisionId，不能直接把数字塞进历史版本URL。现金原始receipt/refund分录可以按sourceId读cash详情，reversal分录不能照搬此规则。

## 2. 最小 props 表（保持现有签名兼容）

下列“新增”均为**约定待各owner实施**；现有属性按当前源码记录，不把建议当成已存在能力。组件收到新的initial目标时须实际重新定位，不能仅useState首次初始化；换目标/过滤要隔离旧异步响应，保留原快照身份。

| Owner / 实际组件 | 当前 props/回调 | 约定新增 optional props / 消费方式 |
| --- | --- | --- |
| B `InventoryListPage` | `onNavigateToReceipt:()=>void`、`onNavigateToStocktake:()=>void` | `initialReceiptId?:string`→现有getReceipt详情弹窗；`initialWarehouseId?:string`、`initialProductId?:string`、`initialBatchId?:string`→batch query/fragment定位，显式切到批次视图；入库来源切receipts并打开指定id，不只列第一页 |
| B `StocktakePage` | `onBack:()=>void` | `initialStocktakeId?:string`→现有loadStocktakeDetail(id)，来源详情不默认打开列表第一张 |
| B `CustomerFinancePage` | `onNavigateToStatements?:()=>void`、`onNavigateToSource?:(href:string)=>void` | `initialCustomerId?:string`、`initialLedgerEntryId?:string`→选客户、分页定位账簿anchor；内部Statements/Cash子视图也须继续透传来源回调/目标，不能在子视图处丢失 |
| B `CashEventsPage` | `onNavigateToCustomerFinance?:()=>void`、`onNavigateToSource?:(href:string)=>void` | `initialCashEventId?:string`→getCashEvent(id)读取原单，展示详情/高亮；可另加`initialCustomerId?:string`作筛选。来源定位不应自动弹出冲正操作或触发写入 |
| B `StatementsPage` | `onBack?:()=>void`、`onNavigateToSource?:(href:string)=>void` | `initialStatementId?:string`→getStatement(id)，响应自带customerId，设置相应客户并展示该固定快照；另可`initialCustomerId?:string`用于从账户进入列表。按同statement.id固定分页，不重新POST生成替代旧版 |
| C `ReportsPage` | `initialQuery?:ReportQuery`、`onBackToAi?:()=>void`、`onNavigateToSource?:(source:SourceRef)=>void` | 新增`initialReportRunId?:string`→getReportRun(id)及同id后续页；保留initialQuery供编辑条件后重查，两者同时给时原run优先展示，用户明确重查才新POST |
| C `AiReportPage` | `onOpenReports?:(query?:ReportQuery)=>void`、`onNavigateToSource?:(source:SourceRef)=>void` | 新增`onOpenReportRun?:(reportRunId:string)=>void`，传answered的**result.report.id**给A，A转Reports.initialReportRunId；旧onOpenReports继续用于“使用这些条件重新查询”，不伪称复核同id |
| C `OrderPrintPreview`（没有OrderPrintPage） | `orderId:string`、`onBack:()=>void`；组件已export，Props接口当前非export | 保留orderId，新增`initialRevisionId?:string`、`initialTemplateVersionId?:string`；分别传给getPrintData的revisionId/templateVersionId UUID。订单source.version数字、templateVersionNo数字不能当UUID；模板配置旧版和订单商业旧版分别固定，不修改订单version |

B回调取`href:string`，C回调取完整`SourceRef`，A负责两种入口适配，不把对象硬传字符串callback；B的LedgerEntry来源只有信息可定位时才生成已验证的href。退货本身可用现有订单/退货来源视图承接，不强制扩出一个新页面。

### 已定客户来源入口

客户来源统一定位 **B `CustomerFinancePage.initialCustomerId`**：前端兼容别名 `/customers/{customerId}` 只传该客户ID；真实报表来源 `/api/v1/customers/{customerId}/ledger#{entryId}` 同时传 `initialCustomerId` 与 `initialLedgerEntryId`。A必须保留ID并传入B，不能只切菜单、落到默认客户或D的客户列表冒充来源钻取。

plain `/customers/{id}` 是**前端兼容别名**，不声称当前report已生成该href，也不增加后端端点。D Catalog继续作为普通菜单下的客户资料维护页面，本次不要求它增加 `initialCustomerId`；B4原定optional props不变。上述六类真实SourceRef模式继续有效，未知形状仍按下节完整信息降级。

## 3. 未知与异常的统一降级

只接受已核实的同源来源路径模式；未知href、缺少父ID、未知query或不支持的来源类型，显示**完整可复制的href、entityType、id、version、recordedAt**并说明尚未定位，不猜entityType、不删除query/fragment后跳到任意菜单。LedgerEntry则显示自身完整可复制来源/冲正字段。权限403、来源404、结果410按真实错误提示，不能展示别的单据替代。

以上是接口接线约定，不要求每类来源产生新页面，不新增后端API，也不把服务端来源URL当作任意网页跳转或新建统计查询。A/B/C接线后仍需各自类型检查及真实“点某来源→看到该ID/版本”的联调留证。
