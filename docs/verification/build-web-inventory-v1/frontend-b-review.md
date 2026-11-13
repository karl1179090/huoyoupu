# 前端 B 组独立验收（12.2 / 12.6）

**当前结论以文末“第六轮B6两个末项源码关闭”为准；第一轮八项与截图问题保留为历史，已关闭项不再列为现存缺陷。**

2026-11-11；作者停工后的源码快照。结论：**存在 P1/P2 阻挡，不能据 NOTES 或截图认定 12.2/12.6 完成**。先调用 CodeGraph，新页面未索引，随后直接核对 NOTES、inventory/finance 实现、共享 client/OpenAPI、后端与现有测试。本轮未运行类型检查、构建、测试或浏览器操作；未改前端/测试，未读取凭据内容，开发 API 保持。

## 具体问题

1. **P1：小数实盘报错后仍可按旧整数确认过账。** `StocktakePage.tsx:188–201` 在原文非法时保留上一次 `actualQuantityBase`；暂存路径校验原文，但 `handleConfirmStocktake:276–315` 只验证盘盈成本，没有复核 `actualQuantityRaw` / `error`，确认按钮也不因此禁用（约512行）。例如账面20，先输入合法18，再输入18.5，页面报小数错误但确认会PATCH 18并正式扣减2。必须让暂存与确认共用完整原文校验，非法时不能发任何写请求。

2. **P1：资金/入库等不确定网络重试使用新幂等键，可能重复记账。** `CustomerFinancePage.tsx:208/229/271/308`、`CashEventsPage.tsx:144/156`、`ReceiptCreatePage.tsx:161` 等写调用没有保留并传入操作 key；`client.ts` 每次调用默认生成新 key。服务器已提交但响应丢失时，用户保留弹窗再次确认会生成第二笔收款/退款/期初/入库。按钮 submitting 只能挡同时点击，不能保证网络重试幂等。应按同一意图持有 key 与原 payload，收到确定结果或用户改意图后再换 key。

3. **P2：余额应用用错可核销资金字段，合法操作被前端禁止。** `CustomerFinancePage.tsx:262` 用 `balance.creditBalance` 校验分配总额，370–371行据此禁按钮，815行也称其为“可用预存”。实际后端 `finance/core.ts:39–40` 的 creditBalance 是净信用，unallocatedAmount 才是未核销资金来源；`finance/cash.ts:75–85` 余额应用通过真实资金来源核销。例：订单欠100、另有手动未分配实收40，netBalance=60、creditBalance=0、unallocatedAmount=40，仍可将40核销该订单，当前 UI 禁止。现金退款的净信用约束与余额核销不能混用。

4. **P2：月结固定明细无分页调用。** `StatementsPage.tsx:87` 只 `getStatement(id)`；483–486行把 nextCursor 原文显示出来，无按钮/handler/后续请求。A 已补 `client.getStatement(id,{cursor,limit})`，B 尚未接。超过默认50行无法查看剩余固定来源；不能用重新 POST 对账替代。需要沿同 id 分页，并保留该 snapshot 的 asOf/水印/原金额。

5. **P2：首屏截断导致库存/核销/客户覆盖不完整。** `StocktakePage.tsx:135–139` 只取首100正库存批次，丢弃 nextCursor，创建“全仓”快照漏批；同页商品首100、盘点记录首50也无续页。`CustomerFinancePage.tsx:143`、`CashEventsPage.tsx:81` 订单只取首50，手动分配与余额应用无法选择后页欠款单；各客户/商品选择器首100、仓库默认首50均无续页。`InventoryListPage.tsx:133–141` 商品仓汇总也丢 nextCursor，且当前共享 getStockBalances wrapper 尚无分页参数/类型；此处需要 A 协调补 wrapper，不能假定 A 已全部补齐。批次/入库单/账簿/现金/月结**列表**已实际传 cursor（见下表），不能把它们一概写成缺分页。

6. **P2：真实 STOCKTAKE_STALE 不能触发专用失效状态。** `inventoryLogic.ts:164–167` 只看 Error.message 中的码/“409”/两段固定文案；真实 `ClientError` 将码放 `.code`、HTTP状态放 `.status`，message 为后端 `inventory/service.ts:119` 的“盘点后相关库存已变更，请重新建立快照”，不匹配这些字串。结果只显示普通错误、isStale不置true，继续允许确认。应按结构化 code/status 判定；普通 VERSION_CONFLICT 也不应冒充库存快照失效。现“重新读取当前快照”只 GET 同 id，不能重新生成库存基准；应明确重新建快照与核对的入口，不能暗示 GET 已修复 stale。

7. **P2：往来类型映射与真实服务不一致，来源只剩截短文本。** `financeLogic.ts:185–205` 映射 sale_receivable/cash_receipt/sale_return_credit 等，但后端实际 ledger kind 是 sale/return/receipt/refund/opening/reversal/reclassification（见 finance/port.ts、cash.ts），实际均落 raw 英文默认分支。`CustomerFinancePage.tsx:517–540` 与 `StatementsPage.tsx:451–474` 依该映射着色，来源只显示前8位ID、没有跳转或展开/复制完整ID，sourceVersion=null 还可能显示 v。应保留服务端 signed amount，按真实 kind 表达业务；来源至少能够取完整ID/版本并进入已有对应详情（LedgerEntry 无 href，不编造接口）。

8. **P2：合法大额分配使用浮点“分”重算，会改变校验及展示结果。** `financeLogic.ts:91–136` 用 parseFloat×100/Math.round、累加 Number、toFixed 计算分配和余款；Money 契约允许18位整数部分，超出 Number 安全分范围。页面还用该结果决定是否提交并显示“留存账户预存”，不是只显示服务端记账结果。应使用十进制整数分字符串/BigInt校验，入账后的余额/分配仍以服务端响应为准；测试需包含安全整数分边界。

## 按要求核对实现与调用

| 要求 | 当前实际实现 / 调用 | 静态结论及边界 |
| --- | --- | --- |
| 仓库维护 | App 已挂 catalog/WarehouseListPage；list/create/updateWarehouse 真实调用，停用带 warehouse.version | 有创建/启停；不属于 B 文件归属，列表完整性见问题5，本轮未做浏览器验收 |
| 采购/期初入库与实际成本 | ReceiptCreate 调 confirmReceipt；kind、warehouseId、receivedAt、逐行 unitCost 明确传送；新行成本为空，不取默认售价 | 已接；未实跑补录/成本/幂等，见问题2 |
| 入库补录上海时分 | date+time 控件经 formatShanghaiDateTime 拼 +08:00；展示用 Intl Asia/Shanghai | 已接，保留时分与登记时间；API测试未断言 receivedAt 实际时刻 |
| 小数/安全整数 | Receipt 与Stocktake输入保留raw，生产helpers严格正/非负安全整数 | 入库/暂存已检查；确认路径阻挡见问题1 |
| 盘亏来源 | 创建行固定 batchId，实盘行传id/actualQuantityBase，页面显示原批次 | 真实来源已接；没有任意新批次替代；首100截断见问题5 |
| 盘盈成本 | 增量为正才传 gainCostUnitId/gainUnitCost，确认调用生产gain校验 | 已接且0成本合法；没有实际盘盈确认/新批次核验的现有前端测试 |
| 旧盘点快照 | catch准备isStale警告及按钮 | 真实ClientError漏识别，见问题6；后端仍阻止覆盖，不等于前端提示已通过 |
| 批次、入库、汇总、盘点完整分页 | 批次/入库列表 handler 真传 nextCursor；汇总、快照创建与历史列表不完整 | 部分，见问题5 |
| 客户统一账户直显 | getCustomerBalance后显示 net/receivable/credit/unallocated，getCustomerLedger真传cursor | 已接；未重算账面余额，余额应用字段/分配浮点见3/8 |
| 分次收款/自动与手动多单 | 两现金页 recordCashEvent按receipt分支传allocationMode、allocations；refund分支不传receipt字段 | 请求形状正确；后页订单不可选；网络重试见2；尚无真实多单/分次页面测试 |
| 余额应用/退款来源 | applyCustomerBalance用balance.version；退款relatedReturnId为手填可选ID，后端错误message展示 | 已调用；合法余额被挡见3；没有候选来源选择、来源详情展示，关联错误/超退仍待真实验证 |
| 期初核对与冲正 | 正负期初+上海实际时间+reason；reverseCashEvent带原cash.version/reason | 已接，服务器余额直显；期初与冲正历史来源链未浏览器核验 |
| 月结旧新版本 | 每次createStatement生成新id；listStatements真传cursor；detail重新GET旧id，直显金额、stale、sourceWatermark | 已接多个固定快照；没有新旧差额自动对比；已有测试仅同id空快照、stale=false |
| 月结明细/来源/stale分页 | rows服务端原值，显示sourceType/id/version、实际/登记时间 | 固定后续明细与可用来源识别缺项，见4/7；真实跨期改单后旧新对照未测试 |
| 手动批次补选 | 属订单生产组件/销售请求路径，不在 inventory/finance 这六个页面 | 本轮不越权认定通过；由 A 订单组与浏览器联调验收 |

## 现有测试证据的有效范围

冲正版本专项复核：OpenAPI `ReasonInput.required=['expectedVersion','reason']`，生成类型及 `api/types.ts:71` 保持必需；当前 `client.ts:584–589` 签名为 `reverseCashEvent(id:string, body:ReasonInput, idempotencyKey?:string):Promise<CashEvent>`，原样发送 body，并未手写窄类型丢字段。B 的 `CashEventsPage.tsx:189–192` 确实传 `selectedEvent.version` 和 reason。后端先经 parseOperationRequest，随后 `finance/cash.ts:98` 检查数据库现金记录版本。**此路径不存在遗漏 expectedVersion 导致400的问题，A无需改签名，B也无需改该字段。** recipes此前漏写的是文档示意，现已更正；不应为此放宽共享schema或后端校验。

- inventory-logic.test.ts / finance-logic.test.ts **确实导入生产 inventoryLogic / financeLogic**，对应组件也确实调用这些导出；不是整份复制测试逻辑。可证明纯函数样例，但不执行 React 事件链，所以没有捕捉“暂存校验了而确认未校验”的问题。
- stale 测试只构造文案含码/409的普通 Error，未构造真实 ClientError(code,status,message)；类型映射测试使用前端自选字符串，未覆盖后端真实 kind，存在自证盲点。分配金额仅小额，未覆盖安全分边界。
- inventory-finance-api.test.ts 直接 fetch 既有本机 API，**未导入client/页面**；5个case为认证、采购入库、盘点草稿PATCH、auto收款及冲正、2月空快照创建读取。虽标题/NOTES提“auto/manual”“opening”，实际无manual多单、applyBalance、退款、期初调用；盘点未confirm、无stale/盘盈；快照无>50明细、旧新/stale差异。也无入库 receivedAt 时刻断言。
- 本代理未执行这些测试，不复述 NOTES 的“8/8、5/5、56全绿”作独立结论；全局结果交 acceptance。

## 截图来源及状态复核

- inventory-capture-screenshots.ts 无 page.route/fulfill/mock，确实打开 localhost:5173、走登录与真实页面点击；不能因此认定所有截图对应正确状态。它主要 sleep→screenshot，无页面标题/请求成功/记录内容断言，也不提交盘盈/多单、制造stale或翻固定快照页。
- 已实际查看：stocktake-desktop 是**草稿盘亏20→18**，不是盘盈/已过账/stale；statement-detail-desktop 是**0/0空明细且有效**，不能证明分页/来源或stale；customer-receipt-modal-desktop 是manual但**仅一行100**，未提交，不能证明多单结算；receipt-create-mobile有空成本新行；statements-mobile确有多个独立ID与同一期间列表。
- **cash-events-desktop.png 与 cash-events-mobile.png 实际都是“销售开单工作台”**，不构成收退款台账截图证据。当前截图脚本结尾停在月结详情（174–187行），本身根本没有进入现金台账或写出这两个文件的步骤。NOTES 中现金截图清单不可靠，应重新定位页面并核对标题/URL/真实数据后重留图。
- 其余未逐张打开的截图不能据文件名声明通过；390手机静态图也不能代替350/400尺寸交互验证。源码静态接入与真实浏览器操作、真实后端账务守恒分别留证。

## 第二轮定向复审（2026-11-11，B 修复交付后）

**结论：仍不能验收 12.2/12.6；剩余核心是原问题2的意图/重试不完整、问题4/5的异步分页隔离、问题7的signed金额显示；仓库/汇总完整共享签名另属 A 排队依赖。** 只核原范围，没有新增业务要求；未改实现/测试、未用GUI/Edge、未重启API。作者 NOTES“8项全部彻底闭环”超出实际证据。

独立执行：`node --import tsx --test apps/web/test/inventory-logic.test.ts apps/web/test/finance-logic.test.ts apps/web/test/inventory-finance-api.test.ts`，exit0，**26/26，3 suites**（10库存纯逻辑、10资金纯逻辑、6真实API）。脚本仅内部读取本机私密凭据、没有输出秘密；本次真实API在独立新虚构客户上记账，未使用真实客户资料。没有全局types/build/业务全套重跑。

| 原问题 | 第二轮状态 | 真实执行链与未验边界 |
| --- | --- | --- |
| 1 小数确认使用旧整数 | **实现已关闭** | Stocktake输入非法时数值为NaN；暂存/确认均调用生产validateAllStocktakeLines，先于所有写请求return；按钮也用currentValidation禁用。新增纯函数回归实际通过；该测试未挂React/拦网络，故“页面零写”来自源码链核对，不能伪称已执行组件场景 |
| 2 网络不确定重试与编辑新意图 | **未关闭，P1** | 现在有显式useRef key，但多数只有key，没有冻结payload；具体残留见下，不再沿用“全部写操作每次自动新key”的旧结论 |
| 3 余额应用资金来源 | **已关闭** | 校验、按钮和可用额度展示已换unallocatedAmount；expectedVersion仍取账户version；退款保持独立refund分支，无混入收款allocations |
| 4 月结固定明细分页 | **真实调用已接，异步隔离未关（P2）** | handleLoadMoreRows确实getStatement(active.id,{limit:50,cursor})并追加；API测试真实limit1/次页不同row通过。旧请求仍可混入另一个已打开snapshot，见下 |
| 5 批次/基础资料/订单/汇总截断 | **B分页主体已关闭；共享依赖+异步隔离未关** | 盘点创建确实do/while穷举batch页；客户/商品/手动订单确实循环nextCursor；盘点历史新增loadMore；汇总实际传cursor但暂用as any跨旧wrapper。warehouse仍无游标参数及穷举，明确待 A 补共享签名后 B 接入，不要求 B 跨文件改client；过滤切换旧响应问题见下 |
| 6 真实stale识别/重建 | **已关闭** | helper先code STOCKTAKE_STALE/排除VERSION_CONFLICT，识别实际文案；生产catch置stale禁按钮，入口改“重新发起全新盘点快照”，不再GET同id冒充重建。真实API新用例造并发盘点确认、收到409码并调用该helper通过 |
| 7 ledger kind/source | **映射/完整ID/null版本已关闭；金额显示剩P2** | 生产helpers已覆盖真实kind；两个页面显示完整来源ID和formatSourceVersionTag。可选跳转callback当前App未注入，不声称跳转可用；完整ID识别已满足原最小追溯差距。signed金额仍被拼前导+，见下 |
| 8 大额分配精度 | **已关闭** | validateMoney/validateAllocations实用BigInt cents，生产组件真实调用；18位金额回归通过，无原parseFloat×100累加路径。按钮parseFloat仅判正，不承担分配金额计算 |

### 必要残留（只沿原八项）

1. **P1，原2：编辑后同key异body；盘点两阶段重试仍失败。** `CustomerFinancePage.tsx:102–104`持有cash/opening/balance key，但现金金额/客户/时间/方式/分配等onChange（例如670/703/710/774/789行）没有轮换；opening输入及余额分配修改也未轮换，只有成功后或打开余额窗时换key。失败已被服务端缓存后，改金额再提交将409 IDEMPOTENCY_CONFLICT。`ReceiptCreatePage`只有增删/修改行rotateKey，kind/warehouse/date/time/supplierReference（238–285行）变化未换key；Stocktake创建仓库/includeZero变化亦未换create key，且每次重试重新读取批次组装body。`CashEventsPage`现金表单轮换已接，不能重报现金表单全部缺轮换，但冲正reason的707行没有rotateReverseKey。

   更严重的是 `StocktakePage.tsx:353–374`确认仍先用**默认新key** PATCH旧activeStocktake.version，再GET fresh，才用冻结confirm key POST confirm。若PATCH或confirm已经成功、响应丢失，重试先重跑PATCH旧version，遇VERSION_CONFLICT/已确认状态后根本到不了confirm key重放；不能以“最后一步显式key”证明整个动作安全恢复。需要持有**本次意图的payload+key及两阶段进度/返回版本**，编辑真正换意图，单步未决仅重放该步，避免重新GET版本后确认别人的改动。时间值当前现金/入库由state日期/时分生成，无自动now漂移，但没有据此冻结完整意图。

2. **P2，原4/5：切换快照/过滤时未隔离旧分页响应。** `StatementsPage.tsx:104–138` handleOpenDetail/handleLoadMoreRows没有请求代次/当前snapshot ID校验；A明细次页请求未完时关闭并打开B，B.rows先载入，A次页后回会追加到B.rows，游标也改成A。即使同ID服务端分页固定，页面仍会把两快照混起来。listStatements客户切换、InventoryListPage的loadBalances/loadBatches/loadReceipts同样无当前过滤scope校验；旧仓库/客户结果可能覆盖或追加到新查询。需要按snapshot/过滤代次丢弃旧响应，reset时清旧cursor、拒绝reset进行中的旧scope追加；现有测试只直接fetch，未覆盖这些组件请求竞争。

3. **P2，原7：真实signed分录被显示为“+¥-500.00”。** `CustomerFinancePage.tsx:582`及`StatementsPage.tsx:510`根据isCredit拼`+¥${amount}`；后端LedgerEntry.amount本来就是signed金额，receipt/return为负。修真实kind映射后现在确实进入这个分支。新statement-detail截图已实际显示“实际收款入账 +¥-500.00”；应保留服务端符号并做正常金额格式化，不同时拼正负号，不用前端重算账务。

共享依赖：A待将listWarehouses扩query并返回WarehousePage、getStockBalances扩cursor/limit并返回StockBalancePage（准确签名已在recipes末节）。B仓库选择器随后需实际穷举/续页；不能仅A扩wrapper就认定该页完整。汇总as any应在共享签名落地后移除，不是要求B私改client。

### 新测试及截图的实际证据

- 新单测仍正确导入组件所用inventoryLogic/financeLogic；BigInt、真实kind、null版本、真实code/stale已覆盖。validateAllStocktakeLines用例只调用纯函数，不执行保存/确认按钮，更没有UI丢响应与编辑换key测试。26全绿不证明上述意图链/异步竞争已闭环。
- 新API6例真实执行采购同key重放、盘亏确认、并发stale、期初/收款重放/冲正以及月结limit1次页；这是**后端同body同key**验证，不从React/client发起，不模拟响应丢失。不含多单manual实际结算、余额apply、退款与跨期改单后的旧新stale对照。API“盘点确认”实际为盘亏，并非盘盈成本新批验证。保留这些未验边界，不把已绿后端当页面通过。
- 新截图脚本无route/mock，现金路径现会等待并断言`h1=收退款流水台账`后捕获；已实际打开cash-events-desktop，**确为现金台账且有真实行**，故第一轮“现金图是开单页”对新图已关闭。脚本只等table存在，没有断言真实行/分页结果，不等价于NOTES“真实数据均断言”。
- 已实际打开新statement-detail：**3/3行、有效快照**，有完整来源ID；这关闭了旧0/0空明细截图问题，但仍不证明>50明细翻页或stale/旧新差异，反而清楚暴露上述双符号显示。移动现金图未在本轮打开，不仅凭清单声称已验；本轮未重新运行截图脚本或浏览器。

## 第三轮B3有界快照（2026-11-11，非终局）

**B3仍Writing/截图收尾，B4来源props尚未开始；本节不作最终验收或重复派工。** 只沿第二轮残留核源码，未用GUI、未运行施工browser/全局checks、未改前端或重启API。本轮独立再跑现有三套：`node --import tsx --test apps/web/test/inventory-logic.test.ts apps/web/test/finance-logic.test.ts apps/web/test/inventory-finance-api.test.ts`，exit0，**26/26、3 suites**。脚本只内部读取凭据，不输出秘密。

| 第二轮必要项 | B3快照实际生产链 | 判断 |
| --- | --- | --- |
| cash/opening/balance/receipt冻结意图 | 新增frozenPayload refs，重试复用正文（含日期/时分）；Receipt头部/行、CustomerFinance金额/方式/时间/分配/期初等输入已rotate且清payload | 原“大部分未冻结正文/字段编辑不轮key”已修；现金入口切kind/客户残留见下 |
| 盘点PATCH/confirm两阶段 | ConfirmIntentState保存stocktakeId、expectedPatchVersion、patchPayload、patchKey、confirmKey、phase/patchedVersion；idle重放同PATCH，返回后phase=patched，确认重试用返回version/confirmKey；已移除GET fresh；编辑行/成本清intent | **原两阶段重试阻挡在生产源码已修**，不能重报旧逻辑；独立暂存入口仍有小残留 |
| 创建盘点 | 冻结warehouseId+全部batch lines；warehouse/includeZero变更rotateCreateKey，不再重试时扫批重组body | 原创建变参问题已修 |
| 月结同snapshot/page scope | detailScope绑定id/generation；open清旧rows/cursor，more捕获目标并回包核scope，close使旧代次失效，create成功经handleOpenDetail | 原A页混进B快照的直接链已修，动态延迟竞态待正式交付验证 |
| 库存/现金/账簿切过滤 | InventoryList分别绑定batch/balance/receipt过滤+generation，reset清rows/cursor并丢旧响应；CustomerFinance/CashEvents也新增scope | 原直接跨scope覆盖路径已修；不把未执行竞态当浏览器通过 |
| signed金额 | 生产formatSignedMoney实际用于账簿/Statements，保留后端负号，负值显示-¥500.00 | 原7双符号源码已关闭，不重开BigInt/余额来源 |
| 共享Page/全仓选择 | wrapper已独验，汇总真传cursor但仍as any，B仓库选择器仍首屏listWarehouses | 不再列外部wrapper缺失；B4时接listAllWarehouses/完整Page并移除临时as any，非要求B越权改client |
| 默认上海now | Receipt、CustomerFinance现金/期初、CashEvents均用生产getCurrentShanghaiDateTime默认date/time，提交用formatShanghaiDateTime | **未发现toISOString UTC切片再拼+08路径**。函数按Date/当前offset换上海年月日时分；原单测只校形状/显式14:35，不是冻结now多时区页面实测，不套用A Restock旧缺陷 |
| 原1/3/6/8 | raw双入口校验、unallocatedAmount、结构化stale与重建、BigInt继续保持 | 保留关闭，不扩大重报 |

### 停工后能合入B4的最少残留

1. **原2/P1现金入口意图身份不完整。** CustomerFinancePage约274–276行复用冻结现金只比customerId；约503–518行“登记收款/办理实际退款”只setCashKind/模式并开窗，没有rotateCashKey；549行换客户也仅setSelectedCustomerId。具体链：收款已记但响应丢失→关窗→点击办理退款、金额不改→冻结正文仍是receipt，按refund弹窗提交却重放原收款。换客户后重建新body沿旧key也可能冲突。应明确kind/customer变化是新意图，清冻结对象并换key；同kind同意图普通网络重试保持旧key/body，不能简单每次开窗都换。
2. **原2暂存恢复小残留：** Stocktake.handleSaveDraftCounts仍用默认新key、旧active.version。PATCH已成功丢响应后再暂存会冲突，不能重放原暂存结果；版本保护防重复记账，不称已双扣库存。可持暂存本步body/key/版本，无需更改后端。
3. B4既定initialId/来源接线尚未开始，不当本轮缺陷；仓库全量选择器和移除暂时as any可一起接既有共享能力。任务12.2/12.6仍需正式交付/闭环证明，本快照不勾任务。

### 新browser测试链（只读，施工中）

- 已读版本确实使用Playwright真实页面/组件，前置API建独立虚构客户。test1点击生产现金表单，route.fetch先向真实服务器提交再abort响应，再点UI比较两次真实key/postData；比直接fetch重复key或复制helper有效。但本代理没有运行，不采信作者run按钮/未完截图作为通过。
- 已读test2只断言捕获新key非空，没有与编辑前未决key比较；test3实际捕获confirm重试并统计PATCH，但关键断言置于`if(confirmBtn.isEnabled())`内可整段跳过，且只模拟confirm丢响应，不含PATCH丢响应；test4只创建一个statement检查DOM不含+¥-，未制造A/B延迟页竞争，也未确保有负数行。它们不足证明标题所有场景。
- **阅读末尾browser测试文件hash发生变化**，上述测试质量判断仅针对已读版本，必须作者停止后重核新hash，不能当成现行最终缺陷重复派工。其它文件是否变化详下表。没有重新打开/运行新capture，不凭NOTES清单关剩余链。

### B3快照标识（UTC，上海+08:00）

下表保存阅读开始hash/mtime，并标明结束是否改变；变动文件本节仅历史快照。

| 文件 | 开始mtime UTC | 开始SHA-256 | 阅读结束变动 |
| --- | --- | --- | --- |
| apps/web/src/pages/inventory/inventoryLogic.ts | 2026-11-11T01:14:45.141556+00:00 | a6079cb3e54aa3c334cea7585df5fa3f3d97be01962e6009a26377b174f05969 | 未变 |
| apps/web/src/pages/inventory/InventoryListPage.tsx | 2026-11-11T02:35:53.708501+00:00 | c33f9c91407b22c1e65daa594d19ac20ecf26c2b697d5dd4ab31eeb5d280920d | 未变 |
| apps/web/src/pages/inventory/ReceiptCreatePage.tsx | 2026-11-11T02:26:59.051080+00:00 | d92e130012ebc7f741b8519ddbfb3394eed42e8ef589d0c94333b2c7812e68d3 | 未变 |
| apps/web/src/pages/inventory/StocktakePage.tsx | 2026-11-11T02:31:55.271524+00:00 | e909cd8f0e2ecd3f80dae8cd05c206d307bb0a025ef44fe2dc2e31aeeff2c3cf | 未变 |
| apps/web/src/pages/finance/CustomerFinancePage.tsx | 2026-11-11T02:52:56.986152+00:00 | cccc6f60e663423db21324f04855d5fba80502806d9e1d55e0cdc48d8a050589 | 未变 |
| apps/web/src/pages/finance/financeLogic.ts | 2026-11-11T02:00:12.771750+00:00 | a87d91578a891f84d16791386f8c500a33caa6935ced9ccf28b8659e06193674 | 未变 |
| apps/web/src/pages/finance/CashEventsPage.tsx | 2026-11-11T02:41:17.422600+00:00 | 634656a945e5df908481573bbcfc2fd9264d67ea2411bc00018ef190f2436764 | 未变 |
| apps/web/src/pages/finance/StatementsPage.tsx | 2026-11-11T02:24:05.232538+00:00 | f6b5ce61993c89f8ad7296248ece9789d27a3b342fa01537d57e862f18e34198 | 未变 |
| apps/web/test/inventory-logic.test.ts | 2026-11-11T01:38:46.570605+00:00 | cbb473344c13128b3e536747a09a1319d6cc5c9d78bccbbaeccc698cbb42d3b2 | 未变 |
| apps/web/test/finance-logic.test.ts | 2026-11-11T01:40:39.209754+00:00 | f1d1c29ff7116c51a06032756c1d9e2196c0fd96a511138241774dd8f9c08595 | 未变 |
| apps/web/test/inventory-finance-api.test.ts | 2026-11-11T02:45:24.010959+00:00 | 7942b1d5d0292c174e8ee37a6696d73432953b5539450a05355ec05d356f39d7 | 未变 |
| apps/web/test/inventory-finance-browser.test.ts | 2026-11-11T02:46:53.785003+00:00 | 1de2cca39d885c8f9743bdd76dd0a63a0b329c9b6826b9e1d4b895c9cf1dacc2 | 已变，需停工重核 |


## 第四轮停止后源码复验（2026-11-11）

A/B/D已停止、C仅另写部署浏览器测试；本轮固定源码与已有测试hash，**没有执行tests/API/GUI或全局检查**，不采用作者最终claim作为UI通过。以下取代第三轮“施工快照”中已修项的当前状态；历史保留。源码复验不等于12.2/12.6最终运行验收。

| 已知项 | 当前实际链 | 源码结论 |
| --- | --- | --- |
| 现金kind/customer意图 | CustomerFinance切receipt/refund入口在kind改变时rotateCashKey；用户切客及initialCustomerId变化轮换现金/期初/余额key并清冻结正文；各表单正文仍冻结 | 第三轮该P1**已关闭**，不重复报旧入口；同意图重试保留旧body/key |
| 独立暂存丢响应 | Stocktake.frozenDraftSaveIntentRef保存stocktakeId/expectedVersion/lines/key，未收到成功时复用；行/成本编辑清意图，成功清ref并更新version | 第三轮暂存残留**已关闭**，不再称其默认新key |
| confirm两阶段 | patchKey/body/版本、phase、patchedVersion与confirmKey仍独立保存，无GET fresh替换；编辑清intent | 保留已修结论；PATCH/confirm丢响应的实际页面重放待统一测试 |
| raw/stale/金额/来源额度 | 小数双入口验证、真实stale与重建、BigInt、unallocatedAmount、signed格式化继续在生产链 | 原1/3/6/7双符号/8已关，不新增上海时间或wrapper问题 |
| 原分页scope | InventoryList批次/汇总/入库、CustomerFinance账簿、Statements明细仍有scope代次与清cursor；汇总as any已移除 | 原混页链已修；新initial目标的独立详情链仍有下述残留 |
| initialReceiptId | effect调用getReceipt指定ID，独立receiptDetailScopeRef绑定id/generation并丢旧回包 | 真读取指定入库，不再默认列表冒充详情 |
| initialStocktakeId | effect调用getStocktake目标，初始化列表也读取该prop | 真读取已有，但详情无代次，旧响应/初始化闭包可能回盖新目标，见下 |
| initialCustomerId/Ledger | 账户状态初始及prop变化消费customerId，内部Cash/Statements子视图继续传客户与来源callback | 客户来源统一B已接；ledgerEntryId目前仅对已加载行高亮，见下 |
| initialCashEventId | 仅用于events.map里判断目标/高亮；未调用getCashEvent或自动找页 | 目标不在首50就完全不显示，不能认作来源已定位 |
| initialStatementId | effect调用getStatement(id)，沿同id/代次分页 | 详情ID正确，但没有将响应customerId同步页面选择客户，见下 |
| 全仓选择 | InventoryList/Stocktake已listAllWarehouses，返回数组正确消费 | 入库ReceiptCreate仍首屏listWarehouses未续页，见下；不再归咎共享接口 |

### 最少源码阻挡（均P2，供B owner后续）

1. **B4来源目标尚未可靠找出。** CashEventsPage只有约400行isTarget高亮，没有getCashEvent(initialCashEventId)或追页定位；CustomerFinancePage.initialLedgerEntryId及InventoryList.initialBatchId也仅在已加载行高亮，未加载目标页、未说明未找到。第51条现金/账簿或批次来源会落到普通第一页而看不到目标。应使用既有cash详情GET；ledger/batch按已定过滤分页直到找到目标或给明确失效/未找到提示，不新造单条ledger/batch接口。
2. **B4详情scope/客户上下文不完整。** Stocktake.loadStocktakeDetail约143–157行无id/generation检查；首次初始化异步完成还可能调用旧闭包initialStocktakeId。连续A→B定位时旧A晚返回会覆盖B，App当前没有按目标key重挂组件。Statements.handleOpenDetail有正确id/scope，但取得full后只setActiveStatement/rows/cursor，没有setSelectedCustomerId(full.customerId)；仅带statementId进入时仍默认第一个客户，生成新快照/列表上下文与所看来源客户错配。应保留已正确的statement分页守卫，补返回客户同步及盘点详情代次。
3. **入库仓库列表仍未全量。** ReceiptCreatePage约62行仍listWarehouses()，仅过滤whs.items且不读nextCursor；第51个仓无法选作入库。共享listAllWarehouses已实证可用，InventoryList/Stocktake已经正确使用，无须修改client或后端。

本轮不增加更多范围。已有纯/API/browser文件只读审阅，未运行；正式验收仍需root统一门槛后的定向测试/页面来源ID与版本核对。以上源码阻挡不靠全绿测试claim抵消。

### 停止后hash/mtime（UTC）

| 文件 | mtime UTC | SHA-256 |
| --- | --- | --- |
| apps/web/src/pages/finance/CashEventsPage.tsx | 2026-11-11T03:28:11.109728+00:00 | bd5634374eaa65655b9b3da42b4727b364b0907d2e513f10b4bd461097cc873e |
| apps/web/src/pages/finance/CustomerFinancePage.tsx | 2026-11-11T03:20:01.123610+00:00 | 5a5a146a6e1d0ee6946476e6c2f373f49aaa9cbfe11581856828390ec021c5c0 |
| apps/web/src/pages/finance/StatementsPage.tsx | 2026-11-11T03:30:45.636578+00:00 | 483526ee78260f14d1c958fee49d4cb670fe55d5f635d69315b2c5d4f76c3b83 |
| apps/web/src/pages/finance/financeLogic.ts | 2026-11-11T02:00:12.771750+00:00 | a87d91578a891f84d16791386f8c500a33caa6935ced9ccf28b8659e06193674 |
| apps/web/src/pages/inventory/InventoryListPage.tsx | 2026-11-11T03:25:36.704240+00:00 | de2472e45d77d0ea9a6f9ec1cef4420ec62c8c85ed2f076dd3846a54bc208b0f |
| apps/web/src/pages/inventory/ReceiptCreatePage.tsx | 2026-11-11T02:26:59.051080+00:00 | d92e130012ebc7f741b8519ddbfb3394eed42e8ef589d0c94333b2c7812e68d3 |
| apps/web/src/pages/inventory/StocktakePage.tsx | 2026-11-11T03:22:25.134929+00:00 | 2b5161c4937289c0408ebde611a1f8f472faa9dd232f7cbf86298421768b305e |
| apps/web/src/pages/inventory/inventoryLogic.ts | 2026-11-11T01:14:45.141556+00:00 | a6079cb3e54aa3c334cea7585df5fa3f3d97be01962e6009a26377b174f05969 |
| apps/web/test/finance-logic.test.ts | 2026-11-11T01:40:39.209754+00:00 | f1d1c29ff7116c51a06032756c1d9e2196c0fd96a511138241774dd8f9c08595 |
| apps/web/test/inventory-finance-api.test.ts | 2026-11-11T02:45:24.010959+00:00 | 7942b1d5d0292c174e8ee37a6696d73432953b5539450a05355ec05d356f39d7 |
| apps/web/test/inventory-finance-browser.test.ts | 2026-11-11T03:10:06.481831+00:00 | 8c2f6bc76815e24b24ddd5823251f4abbcb1709228deda9e9cfdd3465600f377 |
| apps/web/test/inventory-logic.test.ts | 2026-11-11T01:38:46.570605+00:00 | cbb473344c13128b3e536747a09a1319d6cc5c9d78bccbbaeccc698cbb42d3b2 |


## 第五轮B5末项窄复验（2026-11-11，已交付停止）

只检查第四轮三组末项的六个文件；**未执行tests/API/GUI、未重启服务、未改前端/任务状态**。阅读前后hash一致。已关intent/confirm/raw/BigInt/上海时间/wrapper等不重做，不依据作者claim宣布UI通过。结论：多数末项已修，仍有两条具体P2，运行等serial-plan通知。

| 第四轮末项 | B5实际生产变化 | 当前结论 |
| --- | --- | --- |
| Cash来源首屏高亮 | initialCashEventId effect真实getCashEvent(id)，cashDetailScopeRef核id/gen，返回目标放targetCashEvent；displayEvents把不在首屏的目标并入，按返回customerId调整筛选，真实错误显示目标ID | 首屏遗漏的具体阻挡已关；不再要求靠全表逐页找现金 |
| ledger/batch来源跨页 | 新增locateEntry/locateBatch真实沿cursor查页；批次显式positiveOnly=false可查耗尽，按当前客户或warehouse/product及gen过滤回包，显示未找到信息 | 不再是仅首屏高亮；但循环自身effect依赖造成第三页及以后定位可能自取消，见下P2 |
| Stocktake旧详情/旧bootstrap | loadStocktakeDetail新增id/gen守卫；初始化loadData只在stocktakeDetailScopeRef.current.id为空时才启动默认/初始详情 | 原旧目标晚回覆盖与bootstrap重发已关，保留修正 |
| Statement目标客户 | handleOpenDetail在同id/gen有效后，setActiveStatement并按full.customerId更新list scope与selectedCustomerId | 响应同步已接；但初始客户列表旧闭包仍能晚回覆盖，见下P2 |
| Receipt仓库首50 | ReceiptCreate现在listAllWarehouses()并按数组过滤启用/选择 | 原仓库截断已关；无须再改wrapper |

### 两条必要残留

1. **P2：跨页定位effect会被自身state更新取消，可能停在第二页。** InventoryList的定位effect（约149–213行）依赖batches.length/batchNextCursor/loading等，CustomerFinance对应effect依赖ledger.length/ledgerNextCursor/loading等。locate循环处理首个续页后setRows追加、setNextCursor，然后await再下一页；前两次set使依赖变化、cleanup令该循环局部cancelled=true。下一页回包直接return，finally又因cancelled不清locatingTarget状态，新的effect见locating=true不再启动。于是目标位于第三页或以后时可能既没找到也没明确结束。只做“后页定位已加while”不够；应让循环仅在真实目标/过滤scope失效时取消，自身追加页不要使其失效，并确保取消/结束释放定位状态。保留现有scope/耗尽批次语义，不增加新API。

2. **P2：Statement初始客户列表仍可能覆盖已定位snapshot客户。** handleOpenDetail已正确setSelectedCustomerId(full.customerId)，但mount时fetchAllCustomers闭包仍捕获最初selectedCustomerId=''，循环完成后执行`if(all.length>0&&!selectedCustomerId) setSelectedCustomerId(all[0].id)`（约83–85行）。仅initialStatementId进入时，若getStatement先回、全量客户后回，snapshot仍是正确ID，顶部客户/列表/新建上下文却被切成第一客户。应让默认客户初始化检查最新选择/有效statement目标，而非旧闭包；不允许默认初始化覆盖明确来源。

这两条都是指定末项的实际执行链，不是新增范围，也未声称本轮运行复现。后续仍需统一门槛后验证：真实目标在第三页以后、切目标旧响应、statement先回/客户列表后回，以及cash指定ID详情；无需重跑已关业务规则。

### B5固定hash/mtime（UTC）

| 文件 | mtime UTC | SHA-256 |
| --- | --- | --- |
| apps/web/src/pages/inventory/InventoryListPage.tsx | 2026-11-11T04:00:42.674127+00:00 | fa1e53f064851a72c7a33762aa33b6c25cd7e70632390f7c569922ea0c80e676 |
| apps/web/src/pages/inventory/StocktakePage.tsx | 2026-11-11T03:51:06.966414+00:00 | 463832140a76749606e8e5b6c4236321106e84308a55402fbae0a46868655d4a |
| apps/web/src/pages/inventory/ReceiptCreatePage.tsx | 2026-11-11T03:49:23.664445+00:00 | f690f08788bf76c3054a5ac9fc62544777da2bcd0142717c61031eca460f7b75 |
| apps/web/src/pages/finance/CashEventsPage.tsx | 2026-11-11T03:54:56.721658+00:00 | f533b40218c0a0eec31fd3921ae0af6e065c4272d9df7e0ce46081b4a12a12d9 |
| apps/web/src/pages/finance/CustomerFinancePage.tsx | 2026-11-11T03:57:43.132794+00:00 | 2d4915269f983d2974455661e4c41576e3feac1bacfabbe173315fda0333715d |
| apps/web/src/pages/finance/StatementsPage.tsx | 2026-11-11T03:51:51.034802+00:00 | eb43e0cc5109ddf73e77f23950c7c7484fe5c9ac6a322c11291c796f0c01f5e9 |


## 第六轮B6两个末项源码关闭（2026-11-11）

本轮仅只读B5最后两条，不扩查其它业务；**未运行tests/API/browser/capture、未占用dev/Edge、未修改前端或任务状态**。串行运行由acceptance负责。结论：本轮指定源码阻挡已关闭，真实运行仍按serial-plan验证。

| B5末项 | B6实际生产修复 | 结论 |
| --- | --- | --- |
| ledger/batch第三页定位自取消 | 两组件实际调用生产locateTargetAcrossPages，cursor保存在函数局部；refs保存最新items/cursor。effect依赖现在分别为目标/客户/loading，或目标/仓/商品/view/loadingBatches，不含自身追加的rows.length/nextCursor；自身onPageFetched不再触发cleanup。取消依据目标/过滤的代次，finally在本代次结束释放locating；批次查询仍positiveOnly=false | 原“第三页自取消卡死”的执行链已消除；真实后页/换scope行为待串行测试，不冒称已跑浏览器 |
| 月结客户列表后回覆盖snapshot客户 | 客户列表setSelectedCustomerId采用函数式prev，并调用生产resolveStatementCustomer，优先当前选择、目标客户/initial客户；来源尚未回时不会默认第一客户。getStatement返回同id/gen有效后写statementTargetCustomerIdRef并同步full.customerId | 不再使用旧闭包selectedCustomerId=''强制设第一客户，原覆盖链已关闭 |
| 用户真换客户 | select实际调用handleCustomerChange；不同客户时关闭冲突activeStatement或递增detail generation取消未决GET，再设新客户；后回详情经过generation守卫不能盖回旧客户 | 指定取消链已接，不把来源定位优先级写成禁止用户换客 |

以上是读取实际生产调用与effect依赖的结论，不以新helper导出或测试标题代替证明。其它已关意图、确认、BigInt、wrapper等不在本轮重查范围。新helper定位最多10个续页的边界保持原实现，不在本次擅自新增性能或页面范围；实际第三页定位及异常由串行计划留证。

固定源码标识（UTC）：

| 文件 | mtime UTC | SHA-256 |
| --- | --- | --- |
| apps/web/src/pages/finance/financeLogic.ts | 2026-11-11T04:25:29.735679+00:00 | 2ea783b7568fec47eaa5812c10e055f15f6a5b70c89610a6dfc45483f1a4276d |
| apps/web/src/pages/finance/CustomerFinancePage.tsx | 2026-11-11T04:26:23.856824+00:00 | 3d54b09a583ffd796914f409ce7a27795195ecd580f0f4cdb0716df4c9828ca3 |
| apps/web/src/pages/inventory/InventoryListPage.tsx | 2026-11-11T04:27:09.906868+00:00 | 68bd82f9f253ad1abaf5d76ac71180b464b18696503a8fa95e80b4fc6316ec40 |
| apps/web/src/pages/finance/StatementsPage.tsx | 2026-11-11T04:28:15.002212+00:00 | dc0eb0df70b305edef89ab7199897851df02ccea5aa2b6771636f00d959ef273 |

## B7 CustomerFinance生产增量窄复核（2026-11-11）

只读当前CustomerFinancePage和既有共享类型，不读新browser测试扩评、不运行tests/API/GUI；不重新核已关闭B6范围。没有逐字旧源码副本可做完整diff，因此结论限定本次指定提交/消费链，不声称重审全部页面。

当前cash冻结身份包含customerId+kind，receipt正文才传allocationMode/allocations，refund仅传契约允许的relatedReturnId等共用字段；余额应用使用unallocatedAmount校验、expectedVersion仍取CustomerBalance.version，ApplyCustomerBalanceInput是共享BalanceApplyInput别名；期初/现金日期仍提交已冻结上海字符串与原key。成功提示对联合类型先按payload.kind检查再读allocationMode；后续余额刷新仍读后端。**未发现本次CustomerFinance增量的明显契约矛盾或另改收款/退款/余额业务语义，源码无新增阻挡。**

固定文件SHA-256：`apps/web/src/pages/finance/CustomerFinancePage.tsx` = `f9e44163059a4f1b1bd43cd0291a4ee738e31e129b6c08bf995333e946b058d6`。B7新增真实多单/余额/退款/旧新月结及受控后页测试是否实际经过，以acceptance串行结果为准；NOTES当前对“balance_application账簿分录”的表述不作为源码事实，余额应用本身不新记现金。未改checkbox或claim整任务通过。
## 12.6最终独立证据判定（2026-11-12）

只读核最新[独立运行报告](frontend-c-loaders-ab-result.md)、[原始B日志](frontend-ab-final-b.log)、冻结生产调用及实际测试控制流，完整单文件10pass/0fail/0skip、19170.946083ms。不是只因计数绿：manual真实UI登记150、两单100+50及request orderId/amount断言；另独立客户收50未分配→UI应用30、当前balance.version→剩20；负期初信用200的客户UI真实退款50→150且refund无receipt分配字段均已到达。前两项部分实收/丢响应安全重放/编辑换key继续通过，账簿第三页与迟到客户测试明确为受控组件HTTP夹具，不冒称全部失序穷举。

期初核对由已测负期初-200→页面信用200/退款后150、月结期初/期间分量服务端字段及既有财务独立验收共同覆盖；不把后台setup期初称为本轮逐键录入，也不将虚构数值替代14.4真实期初导入。金额展示/账户/Statement均取服务端字段，前端BigInt分配校验不是重新计算应收或封存快照；来源限制按真实orderId、CustomerBalance.version、refund类型及服务端来源错误响应处理。既有跨客户/不足来源拒绝有后端独立实证，页面catch错误提示与丢响应失败反馈实际经过，不扩称本次故意制造了每种来源错误。

月结test8真实生成旧snapshot、变动期间期初8.88、显示旧stale与新有效两行及各自明细；固定ID/分页及source消费早前source审、真实API不可变快照/分页验收保留。本轮不拿新的10/10覆盖旧源码问题，也不把仍未跑的每种现金排列设为新门槛。四张净截图已由运行者view并固定[hash清单](frontend-b-final-artifacts/manifest.json)，是相应人工分配/余额/退款/旧新月结页面，非mock截图或实物转账。

据12.6原文，软件范围已完整满足。仅按apply id46/tasks89行勾12.6；strict实际通过并刷新为**46/56完成、10待完成**。56项前后完整比较仅id46 done变化，描述及其它55项不变；11.3仍待员工preview真实禁请求验证，C/12.7不联动。本代理未执行runtime/API/browser/GUI、未读施工C、未改前端。
