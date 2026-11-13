# 前端补齐：现有后端接口速查

2026-11-11，依据当前 `apps/web/src/api/client.ts`、共享生成类型及实际服务；这是接入说明，不是前端完成声明。URL统一前缀`/api/v1`，下表省略该前缀。完整类型直接用`SchemaValue<'类型名'>`（`@huoyoupu/contracts`）或`Schemas['类型名']`（现有api/types）；不用`as any`猜字段。所有对象严格拒绝额外字段。

## 先跑对真实认证

1. `getSession()` GET `/auth/session`取得匿名Cookie与`csrfToken`；随后`login({loginName,password})` POST `/auth/login`须带**匿名Cookie、匹配的Origin、挑战CSRF**。登录会轮换Cookie和CSRF，必须使用登录响应的新值；后续GET session恢复用户并更新token。
2. 浏览器client已用`credentials:'include'`和当前CSRF；通过localhost:5173相对`/api`代理。Node/fetch/测试不会自动保存Set-Cookie或补浏览器Origin，必须自行维护Cookie jar/头，不能拿匿名旧CSRF配登录新Cookie。测试每次session挑战后也应保留最新Cookie。现开发Origin精确为`http://localhost:5173`，不是API地址或127.0.0.1:5173。缺Origin/错配token是403 CSRF_INVALID，不是业务失败；不改Secure、HttpOnly、SameSite或后端安全协议。
3. 业务写带`Idempotency-Key`；client不显式传key时会每次新建。**网络不确定重试须显式沿用同key及同body，用户修改意图换key**；已缓存失败也如此。quote/report/AI为只读POST，需CSRF，不要求幂等键。关键写前复核当前角色；员工仅订单只读和打印。401重新登录，403展示权限/CSRF原因，409版本冲突刷新后重新报价，勿盲改expectedVersion重放。

金额`Money/SignedMoney`是两位字符串；价格`UnitPrice`是最多六位字符串；数量/版本是安全整数。保留输入原文，小数数量显示错误，不能parseInt截断。真实业务金额/分摊/毛利只显示后端值。日期发带时区Instant；上海自然日零点用`T00:00:00+08:00`，不要把`new Date('YYYY-MM-DD')`的UTC零点当上海月初。期间一律左闭右开。普通列表默认50、最大200，接nextCursor直到null；快照分页规则见下。

## 1. 退货信用、实际返库、现金退款分别操作（12.5）

| 已有client → endpoint | 输入 → 输出 | 关键接法 |
| --- | --- | --- |
| `listOrderReturns(orderId)` → GET `/orders/{id}/returns`；`getReturn(id)` → GET `/returns/{id}` | `ReturnPage` / `SalesReturn` | 管理员接口；列表wrapper需补cursor/limit及nextCursor/asOf类型，目前仅items。详情每次刷新取得最新return.version。 |
| `confirmReturn(orderId,body,key)` → POST `/orders/{id}/returns` | `ReturnInput` → `SalesReturn` | 必需**父订单version**、reason、非空lines：`{lineId,quantityBase}`；可带restockDisposition pending/not_returning、allocationSelections:`[{saleAllocationId,quantityBase}]`。这里的saleAllocationId取原订单Admin行allocations[].id，不是batchId或退货分配ID。省略来源选择由后端后扣先退。 |
| `recordRestock(returnId,body,key)` → POST `/returns/{id}/restocks` | `RestockInput` → `Restock` | 必需**退货单version**、restockedAt、非空lines:`[{returnAllocationId,quantityBase}]`；reason可选。returnAllocationId取`SalesReturn.lines[].allocations[].id`。不传仓库/批次/成本，原仓原批由来源锁定。 |

`SalesReturn`的`returnAmount`是商业信用，`refundedAmount`才是已发生现金退款；`costCreditAmount`是原成本信用。三者不能统称“已退款”。每个退货分配有`batchId/warehouseId/saleAllocationId/quantityBase/restockedQuantityBase/returnAmount/costCreditAmount`；可返库余量=原分配quantityBase−restockedQuantityBase，单次不得重复同returnAllocationId，可分次提交。返库输出`returnVersion`、`restockedAt/recordedAt`及逐分配数量/服务端costAmount；刷新退货详情继续操作。absorbed_by_void不再返库。not_returning后续返库由后端冲回原损失，前端不新建盘盈。

**验收：**信用确认不自动退款/返库；分两次按同原来源返库，第二次只能用剩余量；重复key不多回库存；超量/重复来源展示RETURN_EXCEEDS_SOURCE或关联错误。现金退款另用第2域cash-events，关联时传relatedReturnId。

## 2. 月结固定快照、手动多单收款与余额（12.6）

| client → endpoint | schema及必需条件 | 响应/分页/版本 |
| --- | --- | --- |
| `createStatement(customerId,body,key)` → POST `/customers/{id}/statements` | `StatementInput {periodStart,periodEnd}` | `Statement`，每次新意图生成新id；旧id内容不覆盖。 |
| `listStatements(customerId,{cursor,limit})` → GET `/customers/{id}/statements` | 客户范围列表 | items、nextCursor、asOf；列表各项是各自snapshot。 |
| `getStatement(id)` → GET `/statements/{id}` | **wrapper需补query `{cursor,limit}`** | 每页同id/asOf/sourceWatermark、固定rows、rowCount/nextCursor；`stale`可随后来更正变true，旧金额/rows仍保持。没有另造`/statement-sources`接口。 |
| `getCustomerBalance/ getCustomerLedger` → GET `/customers/{id}/balance`、`/ledger` | ledger可cursor/limit（endpoint另支持from/to，wrapper需补） | CustomerBalance含netBalance、receivableBalance、creditBalance、unallocatedAmount、version；ledger含来源字段。 |
| `recordCashEvent(body,key)` → POST `/cash-events` | `ReceiptCashInput`：kind=receipt、customerId、amount、occurredAt、method、**allocationMode**；manual另带allocations:`[{orderId,amount}]` | `CashEvent`含allocations、balance、occurredAt/recordedAt、status/version。auto不同时传手动分配；manual目标同客户、合计≤实收，剩余留账户。 |
| 同上退款 | `RefundCashInput`：kind=refund及同样客户/金额/时间/方式；relatedReturnId可选 | 不传receipt专属allocationMode/allocations；受净信用及可用资金来源约束，不等于退货信用。 |
| `applyCustomerBalance(customerId,body,key)` → POST `/customers/{id}/balance-applications` | `BalanceApplyInput`：**CustomerBalance.version**、非空allocations:`[{orderId,amount}]`，reason可选 | 201 `CustomerBalance`；仅核销已有资金，不新记实收。 |
| `recordOpeningBalance` → POST `/customers/{id}/opening-balance`；`reverseCashEvent` → POST `/cash-events/{id}/reverse` | `OpeningBalanceInput {amount,effectiveAt,reason}` / `ReasonInput {expectedVersion,reason}` | 冲正版本取CashEvent.version。期初正应收/负信用，不计本期销售或现金；纠错冲正留原事实，不能删cash。 |

`Statement`金额字段：`openingBalance/salesAmount/returnAmount/receiptAmount/refundAmount/closingBalance`。来源明细就在`rows:LedgerEntry[]`：`sourceType/sourceId/sourceVersion/reversesId/effectiveAt/recordedAt`，不是SourceRef，**没有href字段**；按已知sourceType与现有详情接口定位，未知类型显示原ID/版本，不拼造路由。stale提示“原来源已变化，可生成新快照”，新建后保留旧id/asOf作对照；不把它伪装成同id自动刷新，也不自编snapshot.version。

**验收：**旧快照后改单/冲正，旧页金额与来源不变、stale提示，新的快照另列；明细>200保持同id翻页。手工多单分配显示服务器结果，错客户/超配/资金不足明确提示；401/409后不要猜账户version。收款/退款/期初实际时间由用户选，不能全部固定当前时间。

## 3. 商品单位、条码、助记码、客户地址与专属价（12.1）

| client → endpoint | 准确schema / 必需字段 | 接入注意 |
| --- | --- | --- |
| `updateProduct` → PATCH `/products/{id}` | `ProductPatch`：expectedVersion；可改name/specification/brand/mnemonicCodeOverride/active | 版本取Product.version；人工助记码传字符串，清除传null；返回generatedMnemonicCode/mnemonicCodeOverride/mnemonicCode。改名会重新处理助记码，刷新后端结果。 |
| `createProductUnit` / `updateProductUnit` → POST `/products/{id}/units`、PATCH `.../{unitId}` | `UnitCreate {name,multiplierBase,defaultSalePrice}`；`UnitPatch {expectedVersion,...}`可改name/multiplierBase/defaultSalePrice/defaultReceiptCost/active | 单位版本取Unit.version，非Product.version；基础/已有交易单位倍率受保护，UNIT_REFERENCED需说明而非强行重建。默认进价defaultReceiptCost可null，不能拿售价当实际进价。 |
| `replaceProductBarcodes` → PUT `/products/{id}/barcodes` | `BarcodeUpdate {expectedVersion,barcodes:[{value,unitId}]}` | **整组替换**，版本取Product；value是字符串保留前导0，unitId必须属于该商品。返回Product并刷新单位/条码显示。 |
| `updateCustomer` → PATCH `/customers/{id}`；`createCustomerAddress` → POST `/customers/{id}/addresses`；`updateCustomerAddress` → PATCH `/customers/{id}/addresses/{addressId}` | `CustomerPatch` / `AddressInput` / `AddressPatch` | PATCH均expectedVersion，地址取Address.version；AddressInput必需contactName/address，可label/phone/isDefault；PATCH可active/isDefault。地址列表在Customer.addresses，**没有GET addresses列表端点**，用getCustomer刷新默认切换与停用结果。 |
| `listCustomerPriceRules` → GET `/customers/{id}/price-rules` | `PriceRulePage` | wrapper需补cursor/limit和nextCursor/asOf，勿只保留items。 |
| `upsertCustomerPriceRule` → PUT `/customers/{customerId}/price-rules/{productId}/{unitId}` | `PriceRuleInput {unitPrice,expectedVersion}` | 首次expectedVersion=0；修改用PriceRule.version，匹配的是明确商品+单位。 |
| `deleteCustomerPriceRule` → DELETE 同路径 | **query** expectedVersion=PriceRule.version | 204无body；无active停用字段，撤销规则用DELETE。 |
| `getCustomerPriceQuote` → GET `/customers/{id}/price-quote?productId=...&unitId=...` | `PriceQuote` | unitPrice/source及sourceOrderId/sourceRevisionId/sourceLineId/sourceConfirmedAt/sourceNetAmount；来源history→customer_rule→default由服务端判断。保留并展示/跳转源订单版本，不只显示“历史价”。人工改价不被迟到建议覆盖。 |

商品/客户/仓库/单位/地址的停用都走各自PATCH active:false，不删除历史；管理页要能includeInactive并恢复。列表`q`可搜500mljy/名称/条码，商品`code`不是ProductPatch可变字段。清空电话/备注传契约允许的空字符串，不用undefined误成“不修改”。**验收：**改单位/条码/人工助记码/专属价后重新GET核对真实版本；旧订单地址、金额和来源保持原快照。

## 4. 四项打印配置、旧单/旧模板与人工状态（12.7）

- `getCompany/updateCompany` → GET/PATCH `/company`，`Company/CompanyPatch`，PATCH必需expectedVersion。
- `listPrintTemplates/createPrintTemplate/updatePrintTemplate` → GET/POST `/print-templates`、PATCH `/{templateId}`，类型`TemplatePage/TemplateCreate/TemplatePatch`。创建必name/config；PATCH必expectedVersion，可name/active/isDefault。
- `createPrintTemplateVersion(templateId,body,key)` → POST `/print-templates/{id}/versions`，`TemplateVersionInput {expectedVersion,config}`，**响应是PrintTemplate**。新config生成不可变新版本；template.version是写版本，currentTemplateVersionId/No是配置版本身份，不能混用。
- `listPrintTemplateVersions(id)` → GET同versions路径，`TemplateVersionPage`。**需补wrapper**：GET `/print-templates/{templateId}/versions/{templateVersionId}` → `PrintTemplateVersion {id,templateId,versionNo,config,createdAt}`；模板/版本/job列表wrapper均需补cursor/limit/nextCursor/asOf。

`PrintConfig`必须齐全：`paper/headerFields/columns/minRowHeightMm/showRemark`。四项编辑是纸型、字段及顺序、列宽、最小行高；实际预览必须消费这些值，不能只显示模板版本号再渲染固定列。

- paper：size=A4/A5/custom，orientation=portrait/landscape，marginMm 0–50。A4 210×297、A5 148×210；标准纸型建议不传widthMm/heightMm。custom必传widthMm 50–420、heightMm 50–600；方向决定横竖宽高。列宽总和≤方向后的纸宽−2×margin，尺寸冲突/超宽422 PRINT_LAYOUT_INVALID；0边距是合法值，不用`||10`改掉。
- headerFields白名单：companyName/companyPhone/companyAddress/orderNo/confirmedAt/customerName/contactName/phone/deliveryAddress。
- 每个column必需field/label/widthMm/align(left/center/right)；field仅productName/specification/unitName/quantity/unitPrice/netAmount/warehouseName/remark。minRowHeightMm 3–50是**最小**高度，长内容允许增高；成本/毛利字段拒绝。
- `getPrintData(orderId,{revisionId?,templateVersionId?})` → GET `/orders/{id}/print-data` → `PrintData`；默认当前订单/默认模板，旧版重打显式传两个版本。返回order为**OrderPublic，即使admin也无成本**、company、config、templateVersionId/No、isCurrentOrderRevision。
- `createPrintJob(orderId,{orderRevisionId,templateVersionId,clientPlatform},key)` → POST `/orders/{id}/print-jobs` → `PrintJob`；clientPlatform实际区分desktop_web/mobile_web。成功登记job后才window.print；GET预览不登记，网络重试同key，真实重打新key。
- `listPrintJobs`读旧job所属版本；`setPrintJobStatus(jobId,{status,note},key)` → PATCH `/print-jobs/{id}/status`。status=user_confirmed/user_cancelled/client_error，note必需（可空）；无expectedVersion字段。仅本人/admin，服务端权限先于缓存；人工状态不增订单version。

**验收：**配置列/宽/行高/纸型确实影响预览；多仓不合行，长名换行、跨页重复必要表头、最终合计仅一次；旧版job不标新版。浏览器afterprint不自动代表物理成功；取消/人工确认/错误均可操作。真实设备验证另留证，不用截图冒充出纸。

## 5. 六类固定报表与AI复核（12.8/13.3）

`queryReport(ReportQuery)` → POST `/reports/query` → `ReportResult`，仅admin。公共响应字段是**id**、kind、normalizedQuery、asOf、generatedAt、sourceWatermark、timezone、currentPeriod、baselinePeriod、nextCursor、rows。没有reportRunId。currentPeriod含start/end/incomplete，baselinePeriod含start/end或null；展示真实边界、单位、未完结标记。

| kind → row schema | 真实行字段（禁止用别名+0.00兜底） | 查询组合 |
| --- | --- | --- |
| sales_summary → SalesSummaryRow | periodStart/end、grossSalesAmount、returnAmount、netSalesAmount、salesCostAmount、returnCostCreditAmount、grossProfit、orderCount、receiptAmount/refundAmount | 默认groupBy=[]，可[day]或[month]；filters customerIds/productIds/warehouseIds。商品/仓过滤时现金两列可null，表示不可分摊，不是0。 |
| customer_product_comparison → CustomerProductRow | customerId/name、productId/name、baseUnitName；current/baseline各有OrderedQuantityBase、ReturnQuantityBase、NetQuantityBase、NetSalesAmount；另quantityChangeBase/changePercent/trend | 默认[customer,product]或[product]；允许客户/商品/仓过滤及decreasesOnly/minDecreaseQuantityBase/minDecreasePercent；quantityBasis仅该kind接受ordered(默认)/net。基期≤0百分比null，不算Infinity；trend可new/no_baseline。只按product时客户两字段null。 |
| inventory → InventoryRow | productId/name、warehouseId/name、batchId、baseUnitName、quantityBase、costAmount、receivedAt/recordedAt | pointAsOf，**不发period**；默认[product,warehouse,batch]，可[product,warehouse]/[product]；filters productIds/warehouseIds/batchIds。聚合时非分组仓/批及时间为null；按库存登记流水截止，不按补录实际入库时间倒生库存。 |
| customer_balances → CustomerBalanceRow | customerId/name、netBalance、receivableBalance、creditBalance、unallocatedAmount、version、asOf | pointAsOf，**不发period**；[customer]、仅customerIds。余额是时点，不当期间销售发生额。 |
| cash_flow → CashFlowRow | eventId、customerId/name、kind(receipt/refund)、amount、occurredAt、recordedAt、method | groupBy=[]，仅customerIds；**逐笔**实际日期现金，不是receiptAmount/refundAmount/netCashAmount汇总。 |
| inventory_loss → InventoryLossRow | id、productId、warehouseId、batchId、kind、amount、effectiveAt、recordedAt | groupBy=[]；productIds/warehouseIds/batchIds；kind=stocktake_gain/stocktake_loss/return_loss/loss_reversal，amount非负，靠kind区分损益方向。 |

发生额类period省略默认mtd_previous；显式period必有mode。mtd_previous不带自选日期，比较本月截至时刻/上月同期，短月到可用月末；calendar_months必须上海月初→**紧接下月月初**，比较基期省略取前一个完整月；custom必start/end，客户商品比较还必baselineStart/baselineEnd。point类仅pointAsOf，默认当前、不未来。非法分组/过滤返回422 UNSUPPORTED_QUERY，不能悄悄忽略；空ID数组表示无匹配，非“全部”。

固定页：`getReportRun(id)` → GET `/report-runs/{id}`，**wrapper需补cursor/limit**；后续页沿同id，不能再POST新查询来翻页。`getReportSources(id,{cursor,limit})` → GET同路径`/sources` → `SourcePage {items,nextCursor,asOf}`；SourceRef有entityType/id/version/recordedAt/**href**，用真实href定位，UI可映射为相应详情，不猜不存在端点。sources与rows的cursor不能混用。410 SNAPSHOT_EXPIRED明确请求重新生成，不替换同id；旧结果不混入后来改单。

`askReport(AiInput)` → POST `/ai/queries` → `AiResult`：question必填；needs_clarification分支id是**AI run ID**，展示question/choices；候选按钮发choice.id，choices=[]时须有自由文本续答，带原question、clarificationRunId=result.id、clarificationAnswer。answered分支有summary/query/report/evidence；普通报表复核用**result.report.id**，不是result.id。直接渲染同一report.rows、期间、规范化query与evidence.href；后续页仍getReportRun(report.id)。合法query转普通查询是queryReport(result.query)，会生成新id，须明确区别“复核原id”。模型未配/超时503可真实提示，不能生成模拟答案；员工先403；无法取得合法query时不要自行猜一个查询兜底。

## 6. 已确认改单、客户/地址、历史只读段与影响（12.4）

- `getOrder`/`listOrderRevisions(orderId,{cursor,limit})`/`getOrderRevision(orderId,revisionId)`对应GET `/orders/{id}`、`/revisions`、`/revisions/{revisionId}`。版本列表`OrderRevisionPage`字段revisionId/revisionNo/createdAt/changeReason/createdBy/isCurrent；历史详情按角色返回OrderPublic或OrderAdmin，`isCurrentRevision=false`。管理端可看成本，员工无成本，不能用联合类型允许字段误判权限。
- confirmed用`reviseOrder(id,OrderReviseInput,key)` POST `/orders/{id}/revisions` → 201订单；draft才PATCH。输入必需当前**order.version**、reason、lineChanges（可空用于改客户/头部）。customerId可更换；addressId与deliverySnapshot互斥，快照精确形状`{customerName,contactName,phone,address}`。选旧地址只发addressId，自填只发快照；只发customerId且无有效默认地址可能404，不是后端替你造地址。
- 行命令准确类型为`LineSetCommand {op:'set',lineId,...}`、`LineRemoveCommand {op:'remove',lineId}`、`LineAddCommand {op:'add',line:NewOrderLine}`；lineId用当前逻辑`line.id`，新增line必需clientLineId/productId/warehouseId/unitId/quantity/unitPrice/allocationMode。set支持productId/warehouseId/unitId/quantity/unitPrice/allocationMode/batchSelections/remark。手选batchSelections用batchId+基础quantityBase；顶层可选releaseSelections用**saleAllocationId**+基础quantityBase（旧OrderAdmin.lines[].allocations[].id）。不是任意“当前批次id”即可释放。
- 先`quoteOrder({orderId,revision:同一个OrderReviseInput})` → `OrderQuote {calculation,warnings,stockReserved:false,asOf}`；查看calculation的服务端总额/成本/毛利、lines中的sourceLineId/readOnly/allocations与accountChanges。**没有另一个impact DTO或impact endpoint**：用原单与calculation对照来源/数量/金额和账户前后值；quote分配本身没有持久saleAllocationId，不能拿临时报价行当原来源ID。
- `kind=return_history`或readOnly行不能set/remove；已退部分由后端保留原净额/优惠/成本，剩余部分可能拆成derived基础单位行，`quantity`可能null，使用quantityBase显示，**不能用quantity||1造数量**。提交后刷新订单，接收新行ID和新版本，再开始下一次编辑。

### 首次退货后进入改单：保护段与总量输入（实际接口口径）

仅检查`kind/readOnly`不够。退货确认会实时更新GET `/orders/{id}`的`OrderLineAdmin.returnedQuantityBase`，但首次改单前该行仍可能是`kind:'normal', readOnly:false, quantity:1, multiplierBase:12, quantityBase:12, returnedQuantityBase:3`。此时已退保护量为3基础瓶，余量为9基础瓶；不能继续把整件1当作全部可编辑。

- 精确原净额/优惠/成本不按前端单价比例重算。进入编辑可调用既有`quoteOrder({orderId,revision:{expectedVersion:order.version,reason:'预览改单',lineChanges:[]}})`（只读、不持久化），后端先拆保护段，返回`calculation.lines`。同一个原`sourceLineId`会对应`readOnly:true`保护段和`readOnly:false`余量段，必须用**sourceLineId＋readOnly**关联，不可只`find(sourceLineId)`取首行。各段`quantityBase/netAmount/discountAllocatedAmount/costAmount/allocations`由服务端给出。报价行没有`kind/id`，不能伪造它们成为已持久化行。
- 首次set原行、商品不变且原行`returnedQuantityBase>0`时，输入`quantity × 所选单位.multiplierBase`是**含已退量的总基础量**；后端再减已退量得到余量。因此UI若编辑的是余量，提交基础总量=`editableRemainingBase + original.returnedQuantityBase`。数量必须精确转换成所选单位的正整数；不可整除时改用商品基础单位，不做四舍五入。`unitPrice`始终是本次所选单位单价。只改价可省略quantity，保留余量；已有退货原行不能remove。
- 对外预拆报价类型是`CalculatedLine`，公开`unitId/quantityBase/readOnly/sourceLineId/clientLineId`和金额/allocations，**不含quantity、unitPrice、unitName、multiplierBase或kind**。内部预拆DTO的基础单价不可当作对外字段。基础单位名称从`Product.units`按报价unitId查；3和9基础瓶分别显示“已退3瓶（只读）”“可编辑9瓶”，不可显示0.75件或默认成1件。
- 安全的原价处理是另外标明“沿用原价24.00/件（12瓶）”，不自动浮点除以12再提交基础单价。未改行不生成set；只改基础余量Q时，发`unitId:基础单位id, quantity:Q+该原行returnedQuantityBase`，**未手动改价则省略unitPrice**，后端保留原pricingBasis。用户明确改为3.00/瓶时才发送该基础unitId及unitPrice。原价是1.00/12瓶等不能精确以6位基础单价表示的情形尤其不能自动回填近似价。若必须显示可直接回传的精确基础价输入，当前quote没有该字段/公开pricingBasis，须明确另行决定能力；不能前端编字段。此建议不变更既有API。
- 例：原1件=12瓶、原价24.00（无减免），已退3瓶、信用6.00；用户只把剩余9瓶改为3.00/瓶。首次命令应是`{op:'set',lineId:原行id,unitId:瓶单位id,quantity:12,unitPrice:'3.00'}`。服务端报价保护3瓶仍6.00＋余9瓶27.00＝商业总额33.00；订单累计退货信用6.00单独显示，有效应收27.00。误传quantity9会再减已退3，只剩6瓶，报价总额24.00，绝不能当作所需9瓶。
- 提交成功后必须重新GET订单。它已经持久化为`return_history`3和新`derived`9，derived有**新行id**、`quantity:null, quantityBase:9, multiplierBase:1, returnedQuantityBase:0`。下一次操作这个derived行直接传余量，不再把另一历史行的3重复相加。若derived之后又退货，则以该行最新returnedQuantityBase重新适用同规则。
- **已存行的稳定关联保证（后端真实PG回归通过）：**空lineChanges预览与实际set后的预览都保留请求中既有`lineId`为`sourceLineId`；无退set亦如此。同一原行拆出的`readOnly:true`保护段及`readOnly:false`余量段共用该sourceLineId，因此必须按`sourceLineId＋readOnly`选择，不能按productId、行号或临时derived clientLineId猜配。同商品重复行各自保留自己的原lineId；后续保存产生新行/新版本后刷新订单，下一轮关联采用新当前行id，不把本次临时报价source跨版本硬复用。
- **新增行的稳定关联保证：**`add.line.clientLineId`是前端在该新增编辑行上生成并保留的请求键，报价原样返回它，且`sourceLineId:null`、`readOnly:false`；用`sourceLineId===null && clientLineId===请求键`关联新增编辑行。同一次add命令的clientLineId须唯一，编辑同一新增行继续使用原键。不能把已有行的内部clientLineId当新增来源，也不要从随机derived UUID推断已存行身份；不新增持久化ID或schema字段。
- 实际回归样例：原1件12瓶/24元、首次退3瓶，无修改预览的同一sourceLineId分别为`{readOnly:true,quantityBase:3,netAmount:'6.00',costAmount:'3.00'}`和`{readOnly:false,quantityBase:9,netAmount:'18.00',costAmount:'9.00'}`。对原行set基础单位`quantity:12,unitPrice:'3'`后，保护段仍3瓶/6元，余量9瓶/27元且仍是同sourceLineId；这是含已退量总数12的既定输入语义，不能再重复加减已退量。未显式改价时仍按上面的pricingBasis口径省略unitPrice，不根据展示值重算。
- 需要原始退货/返库来源可用现有`listOrderReturns(orderId,{cursor,limit})` → `ReturnPage`（沿nextCursor完整读取）及`getReturn(returnId)` → `SalesReturn`：`sourceRevisionId`、`lines[].lineId/quantityBase/returnAmount/costCreditAmount`，分配含`id/saleAllocationId/batchId/warehouseId/quantityBase/costCreditAmount/restockedQuantityBase`。只计status=confirmed；`absorbed_by_void`不能重复扣信用。历史退货lineId不应硬配成当前derived新id；首屏改单保护金额优先用上述服务端quote，避免跨版本自行分摊或查一页退货就漏计。

- 换客户时quote和提交包含两个账户beforeNetBalance/afterNetBalance；商业应收/退货信用按原日期重分类，旧客户现金不迁移、旧核销可能释放。只改价格不重扣原库存/重估成本；增减/换仓仅影响增量来源。已配送仍可改；`setDeliveryStatus`是元数据写，直接void只允许未配送confirmed，reason+order.version，别给draft作废入口。

**验收：**用户每次改配置立即使旧quote失效，禁止旧响应重启确认按钮；保存/确认用最新version和同一意图payload，超时原key重试，编辑后新key。VERSION_CONFLICT或缺货须展示并刷新/重新报价，不靠前端改version蒙混；旧版本、退货信用/已返库/实际现金分别保持可追溯。快照/来源对照与真实桌面手机网络测试通过后，才算页面完成。

## 补充：仓库与库存汇总分页的最小共享接入（给 A）

当前两个wrapper都返回含`items`的对象，**不是裸数组**；已核 A/B/C 生产调用均读取`res.items`（仓库选择器、仓库管理、订单、报表、库存页面）。现有 `api/types.ts` 已导出 `WarehousePage` / `StockBalancePage`，直接复用，不手写窄响应。

| 后端真实接口 | query（均可省略） | 完整响应 |
| --- | --- | --- |
| GET `/api/v1/warehouses`，operationId=listWarehouses | q:string（最长200）、cursor:string、limit:integer 1–200（默认50） | `WarehousePage {items:Warehouse[],nextCursor:string|null,asOf:Instant}`；无includeInactive参数 |
| GET `/api/v1/inventory/balances`，operationId=getStockBalances | warehouseId:Id、productId:Id、cursor:string、limit:integer 1–200（默认50） | `StockBalancePage {items:StockBalance[],nextCursor:string|null,asOf:Instant}` |

A 的最小兼容签名建议（仅扩参数/完整响应，内部仍透传 query）：

```ts
listWarehouses(query?: { q?: string; cursor?: string; limit?: number }): Promise<WarehousePage>
getStockBalances(query?: { warehouseId?: string; productId?: string; cursor?: string; limit?: number }): Promise<StockBalancePage>
```

现有无参 `listWarehouses()` 与传商品/仓过滤的 `getStockBalances({...})` 均保持合法，现有 `.items` 读取无需改。不要把这两个函数改成返回数组，也不要让调用方把Page直接交给 `setWarehouses`。如需要给选择器一次取得所有仓库，可**另增** `listAllWarehouses(...):Promise<Warehouse[]>` 显式循环分页，由页面逐个迁移，不能悄悄改变原方法返回形状。

B 后续接入：库存汇总将nextCursor存入状态，加载更多时连同原warehouseId/productId发给getStockBalances；仓库选择器需循环listWarehouses直至nextCursor=null或提供真实搜索/续页，不能只取第一页。每页保留原过滤条件，过滤变化清游标；只扩wrapper不代表页面已完成完整分页。此段仅接口事实与建议，未修改前端或运行测试。
## 12.8最小补证接入指南（2026-11-12，非新增业务）

生产入口：`ReportsPage.tsx`“报表统计主题”select选`customer_product_comparison`；期间select选`custom`，填写本/基期四个date输入；“执行统计查询 (新快照)”调用`queryReport`→POST `/api/v1/reports/query`。现有`reportHelpers.tsx`的`CustomerProductComparisonTable`渲染真实`CustomerProductRow`，`NormalizedConditions`渲染两期实际区间。不新增API或修改前端算指标。

最小真实fixture：一个独立客户/有效地址、三个独立基础商品、各自库存，确认订单形成三种customer/product组合：

| 行 | 基期下单 | 本期下单 | 真实响应关键值/页面 |
| --- | --- | --- | --- |
| 下降A | 10 | 4 | quantityChangeBase=-6、changePercent='-60.00'、trend='decreased'，页面“下降” |
| 零购买B | 3 | 0 | currentOrderedQuantityBase=0、baselineOrderedQuantityBase=3、changePercent='-100.00'；页面“0 (未购买)” |
| 空基期C | 0 | 2 | baselineOrderedQuantityBase=0、changePercent=null、trend='new'（不是no_baseline）；页面“—”变动幅度、“本期新增”，不能Infinity或0% |

不退货、不打折可减少fixture变量；所有净额/返回量也取服务端，不把上表伪造成route rows。示例合法请求（ID须替为本fixture真实ID）：

```json
{
  "kind": "customer_product_comparison",
  "period": {
    "mode": "custom",
    "start": "2026-11-12T00:00:00+08:00",
    "end": "2026-11-13T00:00:00+08:00",
    "baselineStart": "2026-11-11T00:00:00+08:00",
    "baselineEnd": "2026-11-12T00:00:00+08:00"
  },
  "quantityBasis": "ordered",
  "filters": {"customerIds": ["真实客户UUID"], "productIds": ["A真实UUID", "B真实UUID", "C真实UUID"]},
  "groupBy": ["customer", "product"]
}
```

期间半开[start,end)。日期必须与真实fixture确认时间吻合；订单确认API没有confirmedAt输入，**不得凭空给订单POST加历史日期字段**。若需新造基期订单，由root/后端协调者对自有隔离fixture安排真实历史时间setup并保来源业务日期一致，前端writer不修改别人的订单或新增HTTP后门。也可使用已有自有已知日期夹具；不能因为新订单都今天就声称三类已覆盖。UI不发送groupBy时后端默认customer+product合法，无须为了请求字面完全相同改生产。

准确结果字段：`currentPeriod.{start,end,incomplete}`、`baselinePeriod.{start,end}`、`normalizedQuery`；rows各有`currentOrderedQuantityBase/baselineOrderedQuantityBase/currentReturnQuantityBase/baselineReturnQuantityBase/currentNetQuantityBase/baselineNetQuantityBase/quantityChangeBase/changePercent/trend/currentNetSalesAmount/baselineNetSalesAmount`。页面分别核两期日期badge与上述三条真实product行，不只核标题。关闭decreasesOnly/最小下降过滤，否则C会被正确过滤。

**三行即可验证固定分页，不造51客户。** 可用明确受控页大小：初始真实POST返回run.id后，在该route里额外真实GET `/report-runs/{同id}?limit=1`，将该真实GET响应交给页面；或在UI转入该完整run的GET上以`route.fetch`改query的limit=1。后续同run GET保留原opaque cursor、仅将limit改1并原样fulfill真实response，不改rows/id/nextCursor/sourceWatermark。生产“加载更多数据 (下一页)”本来发GET相同id+cursor+limit50，这个受控limit改写须在报告明示；不是后端自行生成新run。监控首次查询后翻页仅GET、0新POST，逐页响应id/asOf/sourceWatermark保持，产品行不重复/不漏。来源沿`/report-runs/{id}/sources`独立cursor；点真实SourceRef.href，比较精确实体/revision。rows cursor不能给sources。

时点/期间最小切换：页面选inventory或customer_balances应只发pointAsOf（上海datetime）且没有period；切回比较报表应只发period、没有pointAsOf。员工固定报表本身是admin-only，不应要求给员工报表；员工订单OrderPublic/成本单元格按现有角色路径验证，禁止管理请求保持0。

case1b最小补强：A迟到→选B后打开“历史版本”面板，核B实际version UUID/版本行；释放A后仍只列B，并点击Bv1“预览”捕获该B UUID真实print-data。当前只核B纸型/名称与`!/v2\s*\(/`不能证明隐藏versions列表未串，别把它写成已测列表隔离。不以这额外race补强重开已按原文通过的打印/AI任务。
