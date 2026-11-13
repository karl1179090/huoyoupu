# API 契约

状态：保留规划基线；后端实现与验证见 [交付索引](../backend-delivery.md) 和 [共享生成契约](../../packages/contracts/src/generated/openapi.json)。机器字段、required、枚举及响应类型见 [OpenAPI JSON](api-contract.openapi.json)，业务保护条件以本说明和各 specs 为准。机器契约采用 [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)。

## 传输、权限和通用约定

- 基址 `/api/v1`，JSON UTF-8，同源网页部署。路径标识为 UUID；成功直接返回所列 DTO，不额外包一层 `data`；无正文为 204。
- 货币金额为固定两位字符串，如 `"100.00"`；单价及成本最多六位，如 `"1.500000"`。数量和版本为安全整数，毫米尺寸可为小数。不能把字符串金额转为原生浮点后做业务记账。
- `GET /auth/session` 在未登录时也能取得 `user:null` 及 CSRF 挑战；登录后返回角色和新令牌。会话 Cookie 使用 `__Host-huoyoupu_session`、HttpOnly、Secure、Path=/、SameSite；写请求校验同源及 `X-CSRF-Token`。令牌轮换、过期和状态由后端处理，前端不读取会话秘密。防护设计参考 [OWASP CSRF 指南](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)。
- 员工只可访问订单只读、打印数据与日志、打印所需的公司/模板只读投影；不开放商品库存、客户往来、报表或 AI。直接请求管理接口返回 403。
- `OrderPublic / OrderSummaryPublic / OrderLinePublic` 不存在成本毛利字段；管理员使用对应 Admin 类型。`PrintData` 无论角色均不包含成本毛利。版本列表不能成为绕过字段授权的入口。
- OpenAPI 的 `x-response-schema-by-role` 指定按角色校验的响应 schema。不能仅验证通用 union 就断言员工字段安全，因为管理员响应也能通过 union；角色投影须有独立负向校验。
- 所有业务关键写入都要求 `Idempotency-Key`（16–128 字符）；同一意图重试沿用原键，修正正文或开始新意图换新键。相同键不同正文 409；已完成重放返回原状态与正文，并可带 `Idempotency-Replayed:true`。先检查当前权限再重放缓存。
- 幂等失败也按该键重放已记录错误；修正缺货选择或重试新的业务机会使用新键。登记阶段的未完成请求有租约，恢复前必须查询是否已提交。
- `expectedVersion` 是目标实体当前写版本；过期 409。首次专属价 upsert 使用 0，已有规则使用其版本。订单退货创建的版本是父订单版本，实际返库使用退货版本；余额应用使用客户账户版本。
- 列表 `limit` 默认 50、最大 200，`nextCursor:null` 表示结束；游标不透明。普通资料列表的 `asOf` 为当页查询时刻，稳定排序不等于冻结整个资料库；报表和对账分页严格绑定各自快照。
- 时间是带时区 ISO 8601；业务展示默认 Asia/Shanghai。区间左闭右开，`end` 不包含。实际发生时间和登记时间分别返回，不能拿登记日替换已输入的实际日。
- 基础资料启停用通过版本化修改；已引用资料不硬删除。输入空名称、非法归属、整数溢出、额外未定义字段或没有实际变更的命令返回校验错误。

## 核心 DTO 与语义

| DTO | 关键字段及含义 |
| --- | --- |
| `ProductCreate / Product` | 编码、名称、规格、品牌、基础单位、单位与条码。`mnemonicCode` 为生效助记码，`generatedMnemonicCode` 为自动值，`mnemonicCodeOverride` 为可选校正；名称变动未给新覆盖时清除旧覆盖。`500ml酱油` 必须得到 `500mljy` |
| `UnitCreate / Unit` | `multiplierBase`、单位默认售价及可选参考进价；基础倍率 1，交易引用后不得改义。条码按字符串处理，初次商品创建的条码以单位名称关联，之后用单位标识 |
| `Customer / Address` | 客户统一账户、多配送地址；订单保存 `deliverySnapshot`，缺少地址时可显式输入快照，资料改名不回写旧单 |
| `PriceQuote` | `unitPrice`、`source` 和历史订单/版本/明细标识；严格按历史有效价、客户专属价、默认价排序。历史价按折扣后净额换算到同单位并给出原净额；单价最多六位，来源净额保持分 |
| `ReceiptInput / Receipt` | `kind:purchase/opening`、仓库、实际入库时间、整数单位数量、实际单位成本；确认即形成批次，`recordedAt` 为系统登记时间 |
| `Batch` | 商品仓库、原成本单位及倍率、实际/登记时间、基础余量、剩余成本和版本；输入成本不以当前默认进价替代 |
| `Stocktake` | 创建时捕获批次账面数量和版本；PATCH 实盘、盘盈成本；confirm 再校验快照。空 `batchId` 表示账面为零的新库存；正差创建新批，负差扣指定批次 |
| `OrderDraftInput` | 客户、地址或快照、逐行商品/仓库/单位/整数数量/明确成交价、自动或手动选批、整单优惠和抹零；输入成交价由管理员选择，不在确认时被服务器静默改成另一建议价 |
| `OrderAdmin / OrderPublic` | `version` 为当前写版本，`revisionId / revisionNo` 指定内容快照；商业金额、返回明细和打印状态明确。历史读取带 `isCurrentRevision:false`，历史内容不可直接覆盖 |
| `OrderQuote` | `calculation` 返回规范化金额、成本、分批预估及账户影响；不创建销售、资金或库存预留，`stockReserved:false`。新增报价没有虚假的已持久化订单标识 |
| `OrderReviseInput` | 原订单版本、原因、可选头字段和按行 `add / set / remove` 命令；保留稳定 `lineId`，不要求前端拷贝历史后整单覆盖 |
| `SalesReturn` | 原订单版本、整数基础退货量、原消耗段、销售信用额、成本信用额、实际返库量与已关联实退额；无成本的员工订单摘要不复用此管理 DTO |
| `RestockInput` | 按 `returnAllocationId` 指定实际返库基础数量，记录实际时间，累计不能超过确认退货来源；返库返回新的退货版本 |
| `CustomerBalance` | `netBalance` 正为净欠款、负为净余额；`receivableBalance=max(net,0)`、`creditBalance=max(-net,0)`；`unallocatedAmount` 是尚未核销的款，不自动等同于可退款净余额 |
| `CashInput / CashEvent` | `receipt/refund`、客户、金额、实际时间、方式与备注；收款可自动或手动分配多单，退款可关联退货。只登记真实发生，不发起第三方支付 |
| `Statement` | 期初、销售、退货、实收实退、期末、生成时点、来源版本、`stale` 和固定快照分页；不覆盖旧版本 |
| `PrintConfig / PrintData` | 纸型、字段白名单、列宽、最小行高；选定订单及模板版本，公开公司与配送字段。未知字段、成本字段或超出纸面宽度均拒绝 |
| `ReportQuery / ReportResult` | 固定类型、期间、筛选及分组；`quantityBasis` 默认 ordered，也可明确 net；各类型有固定行 DTO，不返回由模型临时发明的列 |
| `AiResult` | `answered` 返回结构化报表、摘要及证据；`needs_clarification` 返回问题和候选。超时/超限用标准错误，不返回虚构答案 |

完整字段、空值和数组上限以机器契约为准。商品与单位单价/成本不强制为整数；首版“整数数量”不等于“整数金额”。

## 关键写入流程与保护条件

### 销售确认与修改

1. 创建草稿并取得当前版本；草稿保存可产生内容快照，但没有销售、成本或库存预留。
2. 可先调用 quote 预估；confirm 使用实时库存、指定版本及新幂等键。手动选批必须完整覆盖需求；自动模式按同仓最早实际入库批次分配。
3. `PATCH /orders/{id}` 只修改 draft；confirmed 必须 `POST .../revisions`。只改售价不动原成本，增减或改仓仅调整影响部分。
4. 每条 `set/remove` 指向当前逻辑行。已退部分成为只读历史段，价格和优惠保持原快照；命令只影响其余部分，必要时后端拆为基础整数单位段并返回新行标识。不能把数量改到已退量以下；不能用减少销售再返库同一数量。
5. `discountAmount + roundOffAmount` 为总减免，按行金额比例分摊到分，不能超过可减免金额或抹除已退部分锁定优惠。少付现金不会自动写优惠。
6. 配送标记仅作业务元数据，不产生出库；已配送仍可修改，直接作废只限未配送。作废合并已有退货商业信用，恢复尚未回补部分并关闭其待返库任务，保留既有返库和现金事实。
7. 更换客户时，quote 和提交结果包含两个账户影响；商业应收/退货信用按原日期重分类，旧客户实际款项不迁移，非法旧核销解除。版本或库存冲突时整次不生效。

### 退货、返库与资金

1. 按原行 `quantityBase` 确认退货；可指定原 `saleAllocationId`，否则后扣先退。累计不能超过可退量，退货金额使用原优惠后成交，成本使用原批次来源。
2. 确认退货立即产生商业调整，实际返库通过 `restocks` 单独提交；实际退款通过 `cash-events` 单独登记。不同步时分别显示，不自动连做三步。
3. 同一退货可分次返库，必须按原仓原批；`not_returning` 部分成本单列损失，后续实际返库时关联原损失冲正而不是再获一笔盘盈。
4. 收款 auto 优先最早欠款，manual 指定的分配合计不得超过收款且目标同客户；余款留账户。余额应用只是核销，不写新的实收。
5. 退款校验该客户净可用余额与资金来源；已有真实记录的纠错走 reverse 保留审计，不能删除现金。若存在无法一并解除的下游引用，返回 `RELATED_RECORD_CONFLICT`，不静默篡改事实。
6. 期初正额为欠款、负额为信用余额，不计本期新销售或实际收款；同客户同切换基准不重复登记。月结及报表使用相同业务时间口径。

### 统计和打印

- `sales_summary` 返回期间销售、退货、净销售、销售/退货成本及毛利、订单数和实收实退；`customer_product_comparison` 同时返回两期下单量、退货量、净量和趋势；金额字符串不能交由模型重新计算。
- 比较默认 mtd_previous，完整月使用 calendar_months 并提供具体月份区间，自定义需完整 start/end。本期无购买也补零，基期非正值时百分比为空；不同商品基础单位不混加。
- `inventory` 是截止时点库存，`customer_balances` 是截止时点账户；现金和损失为期间发生。报表结果 ID 与来源版本绑定，后续分页及 sources 沿用同一快照；过期明确返回 410，不自动转为新数据。
- 打印数据 GET 没有记账；用户点击打印时登记 print-job，再调用系统打印。人工取消/确认或客户端错误只改打印日志。非管理员只能填写自己发起的状态，管理员可管理记录。
- 打印需给明确订单及模板版本；GET 默认当前订单和默认模板，响应给出确定版本。旧版打印记录不能标记新版已请求，浏览器回调不能标记物理出纸成功。

### 报表查询组合

结构 schema 定义参数形状，下表定义业务上允许的组合。未列出的分组、过滤或指标组合返回 `UNSUPPORTED_QUERY`，不能悄悄忽略参数。`groupBy` 省略时采用表中默认；显式数组按集合解释。

| kind | 默认/允许 groupBy | 允许的实体过滤 | 行类型 |
| --- | --- | --- | --- |
| sales_summary | 默认不分组；或 day、month 二选一 | customerIds、productIds、warehouseIds | SalesSummaryRow |
| customer_product_comparison | 默认 customer + product；或只按 product 汇总客户 | customerIds、productIds、warehouseIds；下降阈值 | CustomerProductRow |
| inventory | 默认 product + warehouse + batch；或 product + warehouse、仅 product | productIds、warehouseIds、batchIds | InventoryRow |
| customer_balances | customer | customerIds | CustomerBalanceRow |
| cash_flow | 不分组，逐笔 | customerIds | CashFlowRow |
| inventory_loss | 不分组，逐笔 | productIds、warehouseIds、batchIds | InventoryLossRow |

只按 product 比较时，CustomerProductRow 的 customerId/customerName 为 null；库存仅按 product 汇总时 warehouseId/warehouseName 为 null，未按批次分组时 batchId 和批次时间为 null。每行仍有确定商品与基础单位，不能按仓库把不同单位数量直接合成一项。

销售概览按商品或仓库过滤时，收退款列为 null，表示资金不能按这些维度机械分摊；需要实际资金流应另查 cash_flow。客户过滤和期间本身仍适用于实际收退款。现金行及客户余额行直接提供客户名称，不要求页面推测标识含义。

`mtd_previous` 由后端决定本月及上月同期，不接受矛盾的显式日期；`calendar_months` 需给月初 start 和下月月初 end，基期省略则用上一个完整自然月；`custom` 必须给 start/end，比较类型还需完整 baselineStart/baselineEnd。库存及客户余额使用 pointAsOf（默认当前），不接受期间发生额参数。quantityBasis 仅比较类型适用，默认 ordered，可明确 net；基期净量非正时 changePercent 为 null。

结果的 asOf 是本次数据视图截止点，pointAsOf 是查询的状态截止点；客户历史余额按业务分录日期求截至值，历史库存按库存记账流水截止，不能混同这两个时间轴或把后来发生的改单库存倒记。旧结果的同 ID 分页仍读取原来源，不重新解释当前参数。

## 标准错误

错误形状：`{ code, message, requestId, retryable, details? }`。`details` 只允许契约内字段，禁止原始 SQL、栈、凭据或员工不可见的成本。客户端按 code 处理，未知 code 展示 message 并保留 requestId。

| HTTP | 典型 code | 含义与客户端处理 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 结构或 JSON 不合法，按字段提示修正 |
| 401 | `UNAUTHENTICATED` | 会话无效，重新登录 |
| 403 | `FORBIDDEN`, `CSRF_INVALID` | 无权限或令牌/来源不符；不自动重放业务 |
| 404 | `NOT_FOUND` | 标识不存在或不属于请求的父实体 |
| 409 | `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `OPERATION_IN_PROGRESS` | 刷新版本；不同正文换键；未完成请求按提示重试 |
| 409 | `INSUFFICIENT_STOCK`, `BATCH_SELECTION_REQUIRED`, `STOCKTAKE_STALE` | 展示 shortages 或字段错误，重新选批/核对，不部分提交 |
| 409 | `ORDER_STATE_CONFLICT`, `RELATED_RECORD_CONFLICT`, `OPENING_EXISTS` | 状态或来源不适用；处理关联记录，不能覆盖旧数据 |
| 410 | `SNAPSHOT_EXPIRED` | 旧结果超过保留期，明确重新生成，不伪装为同一快照 |
| 422 | `INVALID_QUANTITY`, `UNIT_REFERENCED`, `DISCOUNT_EXCEEDS_AMOUNT`, `RETURN_EXCEEDS_SOURCE`, `INVALID_CUSTOMER_ALLOCATION`, `INSUFFICIENT_CUSTOMER_CREDIT`, `PRINT_LAYOUT_INVALID`, `UNSUPPORTED_QUERY` | 业务约束不满足，修正后用新幂等意图提交 |
| 429 | `RATE_LIMITED` | 按 retryAfterMs 有限重试 |
| 503 | `RETRYABLE_CONFLICT`, `AI_PROVIDER_UNAVAILABLE`, `QUERY_TIMEOUT` | 保持同一意图重试或使用普通报表，不生成虚假成功 |

## 请求示例

以下标识均是示意 UUID，不是现有业务数据。所有写请求带 Cookie 与 CSRF，关键写请求另带新幂等键。

创建草稿 `POST /orders`：

```json
{
  "customerId": "00000000-0000-4000-8000-000000000001",
  "lines": [{
    "clientLineId": "line-1",
    "productId": "00000000-0000-4000-8000-000000000002",
    "warehouseId": "00000000-0000-4000-8000-000000000003",
    "unitId": "00000000-0000-4000-8000-000000000004",
    "quantity": 5,
    "unitPrice": "15.000000",
    "allocationMode": "auto"
  }],
  "discountAmount": "0.00",
  "roundOffAmount": "0.00"
}
```

确认 `POST /orders/{orderId}/confirm`：

```json
{ "expectedVersion": 1 }
```

改单 `POST /orders/{orderId}/revisions`：

```json
{
  "expectedVersion": 2,
  "reason": "更正成交单价",
  "lineChanges": [{
    "op": "set",
    "lineId": "00000000-0000-4000-8000-000000000005",
    "unitPrice": "16.000000"
  }]
}
```

自然语言 `POST /ai/queries`：

```json
{ "question": "哪些客户本月500ml酱油下单量比上月同期少？" }
```

创建报价使用 `OrderDraftInput`；修改报价使用 `{ orderId, revision: OrderReviseInput }`。报价只输出计算结果，无库存预留或虚构单据编号。返回的版本和 lineId 必须使用实际前序响应，不应把本例中的数字写死。

## 全部接口索引

下面索引由同目录机器契约生成。请求和响应列是组件 schema 名；完整 required、枚举和空值定义见 OpenAPI，204 不返回正文。列表 cursor/limit 及具体过滤参数在对应 operation 定义，不能自行猜字段。

| 方法与路径 | 权限 | 请求 | 成功响应 |
| --- | --- | --- | --- |
| `GET /auth/session` | 公开 | — | 200 Session |
| `POST /auth/login` | 公开 | LoginInput | 200 Session |
| `POST /auth/logout` | 管理员/员工 | — | 204 无正文 |
| `GET /users` | 管理员 | — | 200 UserPage |
| `POST /users` | 管理员 | UserCreate | 201 User |
| `PATCH /users/{userId}` | 管理员 | UserPatch | 200 User |
| `GET /products` | 管理员 | — | 200 ProductPage |
| `POST /products` | 管理员 | ProductCreate | 201 Product |
| `GET /products/{productId}` | 管理员 | — | 200 Product |
| `PATCH /products/{productId}` | 管理员 | ProductPatch | 200 Product |
| `POST /products/{productId}/units` | 管理员 | UnitCreate | 201 Unit |
| `PATCH /products/{productId}/units/{unitId}` | 管理员 | UnitPatch | 200 Unit |
| `PUT /products/{productId}/barcodes` | 管理员 | BarcodeUpdate | 200 Product |
| `GET /customers` | 管理员 | — | 200 CustomerPage |
| `POST /customers` | 管理员 | CustomerInput | 201 Customer |
| `GET /customers/{customerId}` | 管理员 | — | 200 Customer |
| `PATCH /customers/{customerId}` | 管理员 | CustomerPatch | 200 Customer |
| `POST /customers/{customerId}/addresses` | 管理员 | AddressInput | 201 Address |
| `PATCH /customers/{customerId}/addresses/{addressId}` | 管理员 | AddressPatch | 200 Address |
| `GET /customers/{customerId}/price-quote` | 管理员 | — | 200 PriceQuote |
| `GET /customers/{customerId}/price-rules` | 管理员 | — | 200 PriceRulePage |
| `PUT /customers/{customerId}/price-rules/{productId}/{unitId}` | 管理员 | PriceRuleInput | 200 PriceRule |
| `DELETE /customers/{customerId}/price-rules/{productId}/{unitId}` | 管理员 | — | 204 无正文 |
| `GET /warehouses` | 管理员 | — | 200 WarehousePage |
| `POST /warehouses` | 管理员 | WarehouseInput | 201 Warehouse |
| `PATCH /warehouses/{warehouseId}` | 管理员 | WarehousePatch | 200 Warehouse |
| `GET /receipts` | 管理员 | — | 200 ReceiptPage |
| `POST /receipts` | 管理员 | ReceiptInput | 201 Receipt |
| `GET /receipts/{receiptId}` | 管理员 | — | 200 Receipt |
| `GET /inventory/balances` | 管理员 | — | 200 StockBalancePage |
| `GET /inventory/batches` | 管理员 | — | 200 BatchPage |
| `GET /inventory/movements` | 管理员 | — | 200 StockMovementPage |
| `GET /stocktakes` | 管理员 | — | 200 StocktakePage |
| `POST /stocktakes` | 管理员 | StocktakeCreate | 201 Stocktake |
| `GET /stocktakes/{stocktakeId}` | 管理员 | — | 200 Stocktake |
| `PATCH /stocktakes/{stocktakeId}` | 管理员 | StocktakePatch | 200 Stocktake |
| `POST /stocktakes/{stocktakeId}/confirm` | 管理员 | VersionInput | 200 Stocktake |
| `GET /orders` | 管理员/员工 | — | 200 OrderPage |
| `POST /orders` | 管理员 | OrderDraftInput | 201 OrderAdmin |
| `POST /orders/quote` | 管理员 | OrderQuoteInput | 200 OrderQuote |
| `GET /orders/{orderId}` | 管理员/员工 | — | 200 OrderRead |
| `PATCH /orders/{orderId}` | 管理员 | OrderDraftPatch | 200 OrderAdmin |
| `POST /orders/{orderId}/confirm` | 管理员 | VersionInput | 200 OrderAdmin |
| `GET /orders/{orderId}/revisions` | 管理员/员工 | — | 200 OrderRevisionPage |
| `POST /orders/{orderId}/revisions` | 管理员 | OrderReviseInput | 201 OrderAdmin |
| `GET /orders/{orderId}/revisions/{revisionId}` | 管理员/员工 | — | 200 OrderRead |
| `POST /orders/{orderId}/void` | 管理员 | ReasonInput | 200 OrderAdmin |
| `POST /orders/{orderId}/delivery` | 管理员 | DeliveryInput | 200 OrderAdmin |
| `GET /orders/{orderId}/returns` | 管理员 | — | 200 ReturnPage |
| `POST /orders/{orderId}/returns` | 管理员 | ReturnInput | 201 SalesReturn |
| `GET /returns/{returnId}` | 管理员 | — | 200 SalesReturn |
| `POST /returns/{returnId}/restocks` | 管理员 | RestockInput | 201 Restock |
| `GET /customers/{customerId}/balance` | 管理员 | — | 200 CustomerBalance |
| `GET /customers/{customerId}/ledger` | 管理员 | — | 200 LedgerPage |
| `POST /customers/{customerId}/opening-balance` | 管理员 | OpeningBalanceInput | 201 CustomerBalance |
| `POST /customers/{customerId}/balance-applications` | 管理员 | BalanceApplyInput | 201 CustomerBalance |
| `GET /cash-events` | 管理员 | — | 200 CashEventPage |
| `POST /cash-events` | 管理员 | CashInput | 201 CashEvent |
| `GET /cash-events/{cashEventId}` | 管理员 | — | 200 CashEvent |
| `POST /cash-events/{cashEventId}/reverse` | 管理员 | ReasonInput | 200 CashEvent |
| `POST /customers/{customerId}/statements` | 管理员 | StatementInput | 201 Statement |
| `GET /customers/{customerId}/statements` | 管理员 | — | 200 StatementPage |
| `GET /statements/{statementId}` | 管理员 | — | 200 Statement |
| `GET /company` | 管理员/员工 | — | 200 Company |
| `PATCH /company` | 管理员 | CompanyPatch | 200 Company |
| `GET /print-templates` | 管理员/员工 | — | 200 TemplatePage |
| `POST /print-templates` | 管理员 | TemplateCreate | 201 PrintTemplate |
| `PATCH /print-templates/{templateId}` | 管理员 | TemplatePatch | 200 PrintTemplate |
| `POST /print-templates/{templateId}/versions` | 管理员 | TemplateVersionInput | 201 PrintTemplate |
| `GET /print-templates/{templateId}/versions` | 管理员/员工 | — | 200 TemplateVersionPage |
| `GET /orders/{orderId}/print-data` | 管理员/员工 | — | 200 PrintData |
| `GET /orders/{orderId}/print-jobs` | 管理员/员工 | — | 200 PrintJobPage |
| `POST /orders/{orderId}/print-jobs` | 管理员/员工 | PrintJobInput | 201 PrintJob |
| `PATCH /print-jobs/{printJobId}/status` | 管理员/员工 | PrintStatusInput | 200 PrintJob |
| `POST /reports/query` | 管理员 | ReportQuery | 200 ReportResult |
| `GET /report-runs/{reportRunId}` | 管理员 | — | 200 ReportResult |
| `GET /report-runs/{reportRunId}/sources` | 管理员 | — | 200 SourcePage |
| `POST /ai/queries` | 管理员 | AiInput | 200 AiResult |
| `GET /print-templates/{templateId}/versions/{templateVersionId}` | 管理员/员工 | — | 200 PrintTemplateVersion |

## 实施与契约演进

apply 阶段在 `packages/contracts` 建立共享运行时校验和类型，生成或校对 OpenAPI，并对本提案基线做语义差异检查。字段、权限、状态或业务口径有变化时同步更新 OpenSpec 和契约；前后端不得各自维护相冲突的计算规则。当前结构验证只证明文档格式及引用合法，不代表任何 HTTP 路由已经通过运行测试。
