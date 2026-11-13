# 前端范围静态复核：施工快照

复核人：contracts Agent（未编写前端）；时间：2026-11-11 01:31 +08:00。范围为任务12.1、12.2、12.4–12.8、13.3；初次未评12.3；本次增量只评其现有批量回归测试质量，不验收12.3整体。以当前源码和规划OpenAPI逐项比较，不运行前端、不新增前端代码/测试、不执行类型检查，也不据源码存在勾选任务。Gemini仍在施工，以下仅供主代理在入口可运行后统一反馈，不能当作最终成品审查结论。

先查询CodeGraph；索引auto-sync已停用且没有这些应用文件，因而读取当前磁盘源码。路径、行号以本次快照为准。开发API保持运行，定向只读health仍200；未重启或读取临时凭据。

**最新限定复核以文末08:26增量节为准；02:42及更早结论仅保留历史，已关闭项不得继续作为当前问题。**

## 当前总体状态

增量复核：`src/main.tsx`已挂载AuthProvider/App，App已装配页面与导航回调，原“没有入口”项关闭。AI输入/候选续答、公司资料维护已有页面调用；盘点创建lines及id/actualQuantityBase字段、现金收款allocationMode、报表period.mode及result.id也已修正，不再作为未关闭问题。以上仅确认静态接线，未实跑入口、测试或浏览器。其余条目仍为施工快照，未在本轮全面重审。

| 任务 | 已有真实接线 | 占位/缺项或阻断 | 本次判断 |
| --- | --- | --- | --- |
| 12.1 资料 | 商品搜索/创建/新增单位；客户搜索/创建/新增地址；选品器调用价格建议 | 单位编辑/停用、条码维护、人工助记码、商品/客户停用、地址编辑/默认切换、专属价管理与历史来源跳转无页面事件 | 部分接线，不能验收 |
| 12.2 库存 | 仓库创建/停用；批次与汇总读取；入库提交；盘点函数调用 | 盘点已按仓库批次创建来源并修字段，盘盈成本与零库存来源仍不足；入库默认填销售价；部分数量被截断；库存分页缺失 | 有硬阻断，不能验收 |
| 12.4 改单 | 当前单读取、更正报价/提交、配送、作废；只读退货段保护 | 无版本内容读取/对照、客户切换、完整影响摘要/并发刷新；员工写按钮未隐藏 | 部分接线，不能验收 |
| 12.5 退货/返库 | 退货基础量及pending/not_returning提交；历史列表 | 实际返库、原分配来源选择、分次返库无页面调用；将退货信用列称“退款金额” | 信用退货部分接线，返库缺项 |
| 12.6 往来/月结 | 余额/分录读取、收款自动分配、余额退款、期初、冲正、对账单创建/列表 | 多单手动分配和余额应用缺项；月结来源/已变化(stale)提示/新旧核对/固定分页不足 | 部分接线，不能验收 |
| 12.7 打印 | 当前默认PrintData、登记job、window.print、人工成功/错误 | 模板配置页缺失，预览固定列不按config；无专用分页打印样式、取消按钮、历史版选择/重打日志 | 仅当前版基本接线 |
| 12.8 固定报表/员工 | 报表POST及订单列表/详情读取，成本格有角色条件 | 报表point/比较参数及部分结果字段仍不符；比较、库存、余额等缺表；来源/固定分页无调用；员工仍有写入口和管理退货请求 | 有硬阻断，不能验收 |
| 13.3 AI | 已有问题提交、候选ID续答与摘要/证据标识展示 | 无自由文本澄清、结构表、证据href、同ID普通报表及异常转查询 | 部分接线，未实跑 |

## 优先修复的契约与权限阻断

1. **盘点盘盈/零库存来源仍不足（12.2）。** 已关闭原创建/更新字段错误：现在先查仓库正余量批次构造lines，PATCH使用id/actualQuantityBase。但仍无gainCostUnitId/gainUnitCost输入，也无明确batchId:null零库存商品选择；读取批次只用首屏。不能因此认为盘盈和零库存快照已覆盖。

2. **报表point及比较参数仍不符（12.8）。** period.mode现已补custom；但ReportsPage仍对所有kind发送period，库存/客户余额应使用pointAsOf；自定义客户商品比较还缺baselineStart/baselineEnd。此为静态契约判断，未运行请求。

3. **报表部分结果字段仍会把真实值显示为零（12.8）。** 标识现已改为result.id；销售表仍读salesAmount/costAmount并回退0.00，实际字段为grossSalesAmount/netSalesAmount/salesCostAmount等；`:132–148`把逐笔CashFlowRow渲染为不存在的receiptAmount/refundAmount/netCashAmount汇总。其余kind只有选项没有结果表，inventory_loss连选项也没有。须展示实际schema字段和错误，不能靠`as any`及0.00兜底伪造成功。

4. **员工订单页未形成只读界面（12.8，关联11.3）。** `AppLayout.tsx:47`将销售开单设publicAccess；`OrderListPage.tsx:75`新建按钮无角色条件；`OrderDetailPage.tsx:161–194`确认/改单/退货/配送/作废按钮只判断订单状态，不判断isAdmin。详情`:55`还无条件请求管理员专属listOrderReturns并吞掉403。成本区块和单元格的isAdmin判断（`:273/327/348`）是已有正向措施，但不能代替禁用写入口及停止被禁API调用。当前后端会拒绝这些请求，不代表前端只读任务完成。

5. **不应把小数悄悄改成整数（12.2/12.5）。** 入库`ReceiptCreatePage.tsx:205`、盘点`StocktakePage.tsx:214`、退货`OrderReturnModal.tsx:180`均用parseInt；输入1.5可能变成1再提交，`step=1`不能补救这种状态截断。应保留原输入并明确拒绝非安全整数，不能把业务数量变更成另一意图。

## 各域覆盖细节

### 12.1 商品、客户和价格

- `ProductListPage.tsx:39`把q交给真实商品检索，`:63`创建，`:88`新增辅助单位，列表展示mnemonicCode、单位倍率与条码（`:169/178/185`），并有加载更多。可以作为后续500mljy/条码查找验证入口，但本次未实际验证。
- 页面操作列只有“加单位”（`:199–208`）。没有商品PATCH、单位PATCH、replaceProductBarcodes触发者，也没有助记码人工覆盖/清除、停用切换。说明文字“维护…条形码”与只读展示不能算条码维护完成。
- `CustomerListPage.tsx:43/66/90`是搜索、创建和增加地址；`:175`展示多地址及默认标记，操作列仅“增地址”（`:187`）。没有已有地址编辑/停用/切换默认、客户编辑/停用，也无价格规则表单。
- `BatchProductPicker.tsx:135/188`确实请求getCustomerPriceQuote并区分history/customer_rule/default，人工改价有priceEdited保护。这是订单选品中的价格建议接入；目前只保存价格与source标签，未保留/跳转sourceOrderId/sourceRevisionId/sourceLineId等历史价证据，也不能替代专属价增改删页面。
- 全src除client定义外，未找到updateProductUnit、replaceProductBarcodes、listCustomerPriceRules、upsert/deleteCustomerPriceRule调用。对应wrapper已存在，应接现有契约，无需新造API。

### 12.2 仓库、入库、批次及盘点

- `WarehouseListPage.tsx:28/42/60`列表、创建、expectedVersion停用接线明确；尚无名称修改入口。client.listWarehouses不暴露游标，库存/入库选商品也只取前100条。
- `ReceiptCreatePage.tsx:88`提交真实入库，日期可修改、成本是可编辑字符串；但是`:50`把**销售默认价**填入实际入库成本，用户未改就会按该值记账。应让用户明确提供成本，不能拿售价当成本默认。
- 日期仅`type=date`（`:155`），`new Date(receivedAt)`按UTC日期解析；缺实际时分和Asia/Shanghai自然日转换说明。批次列表已有receivedAt/recordedAt展示，可保留其双时间区分。
- `InventoryListPage.tsx:58`只取positiveOnly/limit100，未处理nextCursor，无法查已耗尽批次或完整历史。listReceipts/getReceipt只有client封装，当前没有入库单列表/详情的UI调用。
- 盘点创建/更新字段已修，盘盈成本缺项仍阻断盘盈闭环。当前确认失败仅通用error字符串，没有STOCKTAKE_STALE的重新生成/保留填写交互。

### 12.4 修改、版本、配送、作废

- `OrderEditPage.tsx:74/120/208/253`读取当前单、构造命令、服务端revision quote和提交；quote序列与幂等intent ref是真实实现；readOnly/return_history在`:96/144/375/382`得到保护。详情页更正按钮不因delivered隐藏，符合已配送仍可改的方向。
- 现有原行只构造一项旧单位（`:97`），不是商品的完整可选单位资料；既有行单位切换覆盖不足。
- `OrderDetailPage.tsx:449–456`仅显示版本号/原因/时间，没有getOrderRevision调用、查看历史内容或差异对照。当前订单DTO的版本标签不等于版本对照。
- 改单payload只含lineChanges/优惠/抹零/备注（`OrderEditPage.tsx:160–167`），没有更换客户或地址入口。`OrderQuoteSummary.tsx:177`有资金变动前后预览，但没有原批释放/增量扣库和退货占用来源的完整影响对照。
- 配送/作废函数接线存在且带expectedVersion；版本冲突仅显示message，没有刷新/重新报价入口。作废提示是固定文本（`OrderDetailPage.tsx:475`），不是逐来源影响摘要；还允许draft进入作废按钮，须与后端允许状态对齐，不能由前端猜草稿也可作废。

### 12.5 部分退货及实际返库

- `OrderReturnModal.tsx:28/65/79`排除只读历史段、按基础数量提交真实信用退货并选择pending/not_returning；没有在这一步登记现金，保留了业务分离。
- UI没有原saleAllocation来源选择，也未显示退货明细中的allocations、已返库/待返库余量。`client.ts:522/526`的getReturn/recordRestock除定义外没有调用者，未出现restockedAt、returnAllocationId和expectedVersion返库表单，无法完成分次返库或重复来源防重提示。
- `OrderDetailPage.tsx:399/416`将returnAmount列标“退款金额”，但其值是退货信用，不是refundedAmount。应明确退货信用、实际退款、实际返库三条独立状态，不能误导成已付现金。

### 12.6 往来、收退款、余额和月结版本

- CustomerFinance读取余额/分录，正负及应收/信用分别展示；写入金额作为字符串交后端，未见该资金页面重新计算记账金额，这是已有正确方向。
- 客户页收款仅auto，退款走余额通道；applyCustomerBalance只有client定义，未见余额抵多单/手动多单allocations界面、来源可用额选择或来源错误定位。
- CashEvents有冲正API接线（`:83`），但查询只取50条不处理nextCursor；两个资金入口occurredAt/effectiveAt均固定当前时刻（客户页`:73/83/103`、流水页`:61`），无实际发生日补录或期初切换时点核对输入。
- `StatementsPage.tsx:55`创建新快照、`:41`列表读取；每条显示asOf，详情显示ID和后端金额，因而**已有并列旧/新快照的基础数据，不是只有一个会被覆盖的本地结果**。
- 但“详情”仅setActiveStatement(s)（`:174`），没有重新GET选定snapshot、读取rows/rowCount/nextCursor、sourceWatermark或stale，不能核对新旧来源变化。对账列表也只50条，无固定快照明细分页；client.getStatement(id)尚不接分页参数。缺专门旧版/已变化提示和来源钻取，不能把现有summary弹框当作完整月结版本验收。
- 对账type=date经`new Date('YYYY-MM-DD')`生成UTC零点（`:56–57`），与上海月初差8小时；表头“至”也未说明end为右开边界。需明确业务时区/区间，不能漏算月初或多算下月前8小时。

### 12.7 配置驱动打印、版本及分页

- `OrderPrintPreview.tsx:30/43/51/60`是真实PrintData→登记job→浏览器print→人工状态链；没有自动afterprint成功回写。打印金额直接显示无成本PrintData，与业务记账分离。
- 公司资料页面已调用getCompany/updateCompany（CompanySettingsPage.tsx:24/43），此项关闭；模板create/update/version/list仍没有页面调用者，缺纸型、字段顺序、列宽、最小行高四项编辑和合法宽度错误交互。
- 当前只用config.paper.size/width/margin估算预览（`:83–84`），固定header和列（`:145–175`），不消费config.headerFields/columns/minRowHeightMm/showRemark；orientation/height也未应用。marginMm=0还被`||10`替换。模板版本号显示正确不代表该配置真实渲染。
- src中未找到@media print、@page、分页控制或打印时隐藏应用壳/工具栏的规则；只有普通HTML thead，尚不能保证跨页重复表头、长名不裁剪和最终合计位置。不能把window.print存在当作打印分页通过。
- handler支持user_cancelled，但界面仅“确认出纸/打印失败”两个按钮（`:108–116`），取消入口缺失；平台固定desktop_web（`:46`），手机发起也会错误登记平台。
- props只有orderId；getPrintData只取默认当前版，无订单revision/templateVersion选择，无listPrintJobs调用和旧版重打入口。须保留旧job所属版本并显式选择旧版，不能靠当前preview重现历史单据。

### 12.8 固定报表、来源及员工

- 除上文请求/结果硬错误外，没有mtd_previous/calendar_months切换、完整基期、quantityBasis、下降阈值、商品/客户/仓/批次过滤，以及currentPeriod/baselinePeriod/incomplete展示。
- 当前仅sales_summary/cash_flow两个表片段，其余选项空白；没有客户商品两期并集/本期零购买/基数空值及分列下单/退货/净量的结构化展示。
- getReportSources/getReportRun仅client定义，无页面调用；getReportRun也尚不接受cursor/limit，不能实现同一snapshot固定分页。没有来源href跳转、过期410提示与重新查询意图。
- 员工成本单元格确有isAdmin门控，但开单、确认、改单、配送、退货、作废操作未门控，返回403后还可能被catch吞成空列表。应以真实employee会话验证“没有被禁API请求”，不只观察服务端最终拒绝。

### 13.3 AI 澄清和普通报表复核（增量更新）

- AiReportPage.tsx:21已提交question；:35–38带clarificationRunId/clarificationAnswer续答，:108–115渲染候选ID按钮，原“无页面/无调用”项关闭。
- 当前clarificationAnswer state没有自由文本输入/提交，choices=[]的一般澄清仍无操作入口；answered只展示summary与证据ID标签（:125–138），没有report结构化表、ev.href链接或同report.id读取普通报表。
- 未见异常转普通queryReport或固定报表同ID复核；双端交互及截图仍待实际验证。

## 建议主代理合并给 Gemini 的顺序

1. 已补入口与上述字段后，优先处理剩余报表参数/显示、盘盈成本及员工只读门控。
2. 实际返库闭环、月结固定明细/新旧来源、价格/条码/人工助记码/停用维护。
3. 配置驱动打印、分页样式、旧版重打/取消和手机平台；AI候选续答/同报表ID复核。
4. 再做真实桌面与手机交互、错误/空态/长内容及权限网络断言。当前移动导航仅navItems.slice(0,5)（AppLayout.tsx:207），无溢出菜单，客户/资金/报表/AI在手机入口也需补齐。

本报告没有修改任何前端/后端实现、共享配置或任务状态，没有复制凭据、没有运行前端测试/类型检查。各项后续须根据新源码及实际交互重新确认；本次静态快照不证明运行失败已被实测，也不证明某任务完成。


## 批量会话回归测试质量（第二次增量复核，仅静态）

结论：`apps/web/test/batch-session-regression.test.ts`当前不能作为生产交互回归完成证据。仅1–2行导入node:test/assert；6行明确说明复制实现，26/38/89行在测试内另写数量、批次、session校验；201/243行的generation/quote逻辑也是局部模拟。没有导入BatchProductPicker、OrderLineEditor、OrderCreatePage或它们实际调用的生产状态模块。即使生产guard被删，此测试也没有依赖路径来检出。

| 关注场景 | 测试目前实际验证 | 生产覆盖缺口 |
| --- | --- | --- |
| 取消后重开 | :201–240手工递增局部sessionGen并清数组 | 没挂载/关闭/重开真实弹窗，没验证父订单不变及产品/搜索/cache重置 |
| 旧异步响应 | :209自写mockDelayedAdd的guard | 未经过真实价格、搜索、批次API和组件setState；单位A→B→A、跨会话旧响应未覆盖 |
| 手填价保留 | 仅声明priceEdited字段 | 没有手填价动作或断言，未执行生产:188–199的异步建议价保护 |
| 报价版本 | :243–284自写quoteSeq和固定total | A/B均延迟30ms，A先发先回、B最后覆盖；即使删该测试自身seq判断，最终B断言仍可能通过。未让B先回/A后回，也没验证真实确认按钮或提交所用quote版本 |
| 自动/手动模式切换 | :167只测试始终manual的配额 | 没有切换。生产OrderLineEditor.tsx:278只清batchSelections，raw/errors是否清除及切回后能否提交未得到证明 |
| 同商品不合并 | :287预先写两行常量并断言长度2 | 未调用真实“加入/复制/统一确认”，无法检出生产代码合并两行的回归 |

建议Gemini让测试挂载真实组件并控制API promise，或抽出**组件实际导入使用**的生产状态/校验模块再测试；不要保留另一套测试专用实现。取消/重开、手填价、模式切换和旧报价失效均需有生产连接的断言。这里未执行测试，不提供通过/失败数字；不新增或修改任何前端测试。

## 锁屏期间一次进度复核（2026-11-11 02:42 +08，仅静态）

| 限定检查项 | 当前落盘状态 | 证据 |
| --- | --- | --- |
| 报价/保存/确认前地址互斥 | **本次尚未看到修复** | OrderCreatePage.tsx:122–123、217–218、271–272仍同时写addressId与deliverySnapshot；:563–564仍同时保存address/snap，CustomerPickerModal:85–88仍可一起返回。未出现互斥构造函数或条件展开。 |
| Picker切auto清旧错误 | **本次尚未看到修复** | BatchProductPicker.tsx:581仍只更新allocationMode；updateLine没有auto专属清理batchSelectionsRaw/batchSelectionErrors。 |
| 行编辑切auto清旧错误 | **本次尚未看到修复** | OrderLineEditor.tsx:278仅清batchSelections，旧raw/errors仍保留；OrderCreate的校验仍不按mode排除旧错误。 |
| 真实生产导入回归 | **本次尚未看到替换** | batch-session-regression.test.ts仍只导入node:test/assert，保留复制实现；:284仍是局部activeQuote.configId断言。未运行TS或测试，不宣称TS284已修。 |
| 新依赖/根lock同步 | **当前无需新增同步** | apps/web/package.json的dependencies/devDependencies逐项与根package-lock.json的packages['apps/web']相同；没有新增测试库依赖。仅比较文件，未安装或运行检查。 |

上述页面mtime仍为01:21–01:26，测试为01:46，package/lock为00:27/00:33；这仅说明当前检查时尚未落盘，不能据此推断Gemini后台任务已经结束或没有继续修改。350/400布局与文案不在本次扩大检查。开发API只读health200，保持服务；解锁后仍需真实浏览器重测，源码/测试文件存在不等同通过。


## 恢复 Computer Use 后源码进度（2026-11-11 08:26 +08，仅限定项）

| 检查项 | 最新静态结论 | 生产连接证据 / 仍缺什么 |
| --- | --- | --- |
| 地址三处互斥 | **源码已修，关闭旧“双传”项** | OrderCreatePage:115/206/259均调用batchPickerLogic.getAddressPayload，并在报价/保存草稿/确认前草稿载荷展开。helper:201–211只选addressId或deliverySnapshot，JSON序列化省略另一undefined值。仍需真实地址选择后报价/保存/确认联调。 |
| 行编辑manual→auto | **源码已修，关闭LineEditor旧清理项** | OrderLineEditor:420调用实际生产helper switchAllocationMode；helper:102–110同时清batchSelections、batchSelectionsRaw、batchSelectionErrors。OrderCreate:86/186使用同模块hasLineErrors，auto不再因旧manual错误阻断。未实测UI。 |
| Picker manual→auto | **尚未接完** | 虽在Picker:12导入switchAllocationMode，实际切换事件:568仍只updateLine({allocationMode:mode})，updateLine未清raw/errors；导入不等于使用。Picker:227仍声明局部validateSession并在:277调用，遮蔽导入的同名生产函数。 |
| 回归真实生产导入 / TS284 | **测试尚未更换** | batch-session-regression.test.ts仍只有node:test/assert，mtime01:46，复制校验和局部session/quote逻辑；:284仍activeQuote.configId。生产helper确已被OrderCreate/LineEditor实际调用，后续测试应导入这份已用模块；当前测试未导入，不能把生产抽取视作测试已修。TS由acceptance检查，此处未运行也不宣称TS284关闭。 |
| 350/400手机布局 | **部分源码就绪，Picker接线仍缺** | OrderCreate已有page-header-responsive/page-header-actions；LineEditor已有独立hide-desktop移动卡片结构。index.css:436–454有picker-modal-body/catalog-col/selected-col/line-grid响应规则，但Picker:314/316仍只有modal-body及inline 36%/minWidth280两栏，未使用这些picker类；规则存在不证明真实350/400布局通过。 |
| 新依赖/lock | **当前一致** | web manifest dependencies/devDependencies与根lock packages['apps/web']逐项一致，未见新增测试依赖；没有安装或修改package/lock。 |

此轮仅查上述源码和mtime（地址03:34、LineEditor05:19、Picker08:24、测试01:46），不扩大检查其他业务页。未编写前端/测试，未运行类型检查或浏览器，未改服务；解锁后的真实350/400与异步/地址回归由主代理安排。不要继续转发02:42“地址和LineEditor均未修”的旧快照。
