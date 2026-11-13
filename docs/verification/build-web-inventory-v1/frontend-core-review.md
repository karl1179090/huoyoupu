# 前端A9定向非作者验收

2026-11-11；A9大段交付停止后复核，A10仅共享listWarehouses/getStockBalances wrapper仍施工，B/C仍Writing。本代理先查询CodeGraph未命中新文件，再读CORE_NOTES、当前tasks11.3/12.1/12.3/12.4/12.5及实际Sales/Auth/Catalog/App/layout/client源码。没有修改前端/测试/checkbox，没有GUI操作、全局types/build或后端全套；没有打开或输出凭据内容。

**结论：生产控制器接线已有实质改进，23项定向测试真实通过；A9仍有以下可定位阻挡与任务缺口，不能整体验收11.3/12.1/12.3/12.4/12.5。** CORE_NOTES的“完整”与“来源集成”不能替代实际组件链。以下位置按本次源码快照，非尚未送验wrapper问题。

## 实际运行及测试有效性

实际命令：`node --import tsx --test apps/web/test/batch-session-regression.test.ts apps/web/test/live-api-workflow.test.ts apps/web/test/agent-a-workflow.test.ts`，**exit0，23/23通过、0跳过/失败/取消**。其中batch8、live API7、agent-a8；不是75全套结论。直接API套件自行访问本机虚构fixture并创建/确认/更正虚构订单，因此这次运行含真实测试业务写入，但不证明React按钮事件。

| 核对 | 本次实际生产链 | 判断 |
| --- | --- | --- |
| 报价控制器 | Create/Edit真实初始化QuoteState，变更effect调用invalidate，响应/错误用apply，空/非法配置reset | 原测试5“未接线helper自证”关闭；现在测生产controller，仍不是React调度/网络事件完整测试 |
| 会话代次 | Picker真实createSessionTracker、开闭/取消/统一确认bump、搜索/追加异步响应isSessionCurrent | 原测试7仅复制本地generation的缺陷关闭；helper真实接线，浏览器受控迟到响应仍未实测 |
| 独立行追加 | Picker添加/拆行调用addLineToSession，Create统一加入addLinesToOrder，复制调用生产追加helper | 原测试8仅手造数组的缺陷关闭；测试现在调用真实追加逻辑，不静默合并的纯逻辑有效 |
| 小数/手选/手填价 | 生产validateQuantityInput/updateBatchAllocation/switchAllocationMode/validateSession/applyPriceQuoteToLine仍由组件用到 | 已有纯逻辑与之前所测GUI证据保留 |
| agent-a新8测 | 只有数量用生产helper；返库remaining/条码/专属价version/助记码是测试内常量或手造对象；route gate/parseSourceHref为测试复制；CSS用全文件includes | 不是真实组件或页面工作流；不能以标题“Workflow & Integration”关闭其对应缺口。返库组件实际使用自身正整数校验，并非该被测helper |
| live API7测 | 直接fetch后端，不导入client/React页面 | 证明该次HTTP订单确认/改单/角色投影，不证明UI导航/返库/资料CRUD |

## 已确认阻挡与精确反馈

### A1 / P1：未实现改单改客户/地址；历史版本只有摘要无内容对照

`OrderEditPage.tsx:80–181`只读取原order、构造lineChanges/discount/roundOff/remark，未存新customer/address、没有CustomerPicker或相应编辑控件，OrderReviseInput也未带customerId/addressId/deliverySnapshot。Picker customerId固定原order.customerId。因此用户无法执行12.4要求的更换客户并查看两账户影响。往来摘要`:435`附近只取accountChanges[0]并以Number计算差额，也不足显示改客的旧/新两账户（大额差额还可能丢分精度）。

`OrderDetailPage.tsx:490–520`版本历史只列revisionNo/changeReason/createdAt，无查看旧版或对照事件；虽client有getOrderRevision，页面从不调用。App对orders/.../revisions/...只保留orderId、丢revisionId，实际仍getOrder当前版。复现：进入已确认单更正找改客/地址入口；点历史只能看摘要；从旧revision来源跳转会显示当前版。请接真实版本读取/版本标识与客户地址互斥payload、完整账户影响，不靠NOTES“支持”描述闭项。

### A2 / P1：来源深链只换菜单，B/C回调未传，实体与版本丢失

`App.tsx:39–88`除orderId外，return/receipt/stocktake/cash/customer/statement/report匹配结果均只setActivePage，未保存或传入对应实体ID；订单revisionId也被丢弃。`:288–310`实际挂载CustomerFinance/CashEvents/Statements/Reports/AiReport均无onNavigateToSource。C当前prop接SourceRef、B接href:string，须A适配各自真实签名，不能只约定一种后不接。

复现：点击报表来源当前默认alert而不导航；即使发huoyoupu:navigate(/statements/某id)，只落月结默认列表，不打开该snapshot。原始/api来源href应按真实契约支持，不能解析后落默认页当钻取。请保留实体id/revision并向目标组件传可消费的选中状态；对无目标详情的来源明确实现既有页面定位，不发明后端接口。该缺口影响12.4历史及B/C来源验收，但不要求B/C越界改App。

### A3 / P2：12.1专属价与可选商品仍首100截断；单位/地址维护不完整

`CustomerListPage.tsx:232–233,286,305`只取listCustomerPriceRules/listProducts limit100，丢nextCursor，规则弹窗无加载更多；已有第101条规则不可见，还可能被误当不存在用expectedVersion0更新而冲突。主商品/客户列表的nextCursor按钮已有，不能再泛称全目录没分页。

`ProductListPage.tsx:188–205`现有单位只有新增与启停，没有编辑名称/默认售价/默认成本等现有UnitPatch资料控件；`CustomerListPage.tsx:174–220`地址只有新增/默认/启停，没有修改已存联系人/电话/地址控件。现handleJumpToOrder仅定义未绑定UI，也没有读取price quote来源详情。若按12.1完整资料维护送验，以上仍为缺口；保留已实现的商品编辑、助记码override/null、条码原字符串全量替换、客户编辑、专属价upsert/delete。专属价版本0/旧version与DELETE query使用正确，不重复报已修契约问题。

### A4 / P2：无地址客户被静默伪造配送快照

`CustomerPickerModal.tsx:75–89`在没有保存地址时自动构造phone='—'/address='默认自提/现场交接'，没有用户输入或明确选择本单快照。业务要求无启用地址应让用户选择或填写快照；不能由前端猜成交付事实绕过后端要求。已有地址getAddressPayload互斥修复有效，不重报双传。请对无地址/停用地址提供明确填写或选择，拒绝隐式假快照；测试应覆盖该分支。

### A5 / P2：返库默认时间将UTC墙钟误当上海时间

`RestockModal.tsx:20`以new Date().toISOString().substring(0,16)（UTC）初始化datetime-local，`:121`却追加+08:00。例如上海09:30打开，默认值为01:30，再按上海01:30提交，实际时间错8小时。请按上海墙钟初始化/显示，再构造正确偏移；用户未改默认时也须正确。手填上海时间追加+08:00本身不是错误，不要求改后端。

### A6 / P2：返库/退货/订单详情动作未保留意图key；改单冲突刷新不重置旧key

`RestockModal.tsx:126`recordRestock与OrderReturnModal:193 confirmReturn都未传已持有的idempotencyKey；client每次默认新key。确认/返库已提交但响应丢失时重试会先碰版本冲突，不能重放原成功；**现expectedVersion与余量上限会防通常的同版本重复加库存，不能武断说已经观察到双加**。应保存同意图payload/key至确定结果、改意图再换，页面显示已提交结果而非未知失败。Detail confirm/void/delivery同类调用也未持key。

`OrderEditPage.tsx:275`409后initialize刷新order.version，但不resetIntentKey；原key若已缓存VERSION_CONFLICT，直接重试新version正文将触发IDEMPOTENCY_CONFLICT，不能按提示无编辑地恢复提交。仅当用户又改reason/行才换key。应按冲突类型确认旧意图终结、重新报价并换新意图key；其它409不应一律说别人已更新。Create/Edit现持key的正向改进保留，不能笼统说全销售无key。

### A7 / P2：退后derived/null数量全锁，无法编辑剩余量

`OrderEditPage.tsx:99–105`将所有quantity===null设readOnly，与return_history混为只读。后端退后拆分的未退derived行可能是null输入单位数量但有可编辑基础余量，当前整个剩余段无法改价/减量；12.4只应保护已退历史，不能把未退余量也冻结。只读核后端`apps/api/src/modules/sales/revisions.ts:20–24`已明确return_history为readOnly:true，derived为readOnly:false且quantity:null，并已归一基础unitId/multiplierBase:1。因此本例不是后台包装单位错配，明确错误是前端把null当只读，覆盖服务端readOnly:false。必须按真实kind/readOnly及基础数量契约保留历史与可编辑余量，不伪造1也不把null一概锁死。最小复验1件12瓶退3后在页面更正未退9瓶的数量/价格，历史3瓶保持只读，quote和正式来源守恒。

### A8 / P2：只换地址未必使quote失效

Create报价effect依赖selectedCustomer/orderLines/discount/roundOff，不含selectedAddress/deliverySnapshot；客户picker同一已选客户对象只改地址时，selectedCustomer引用可能不变，此时不触发新quote。提交序列化会取新地址，但页面仍以旧quote作为当前有效报价。请将所有实际payload配置纳入失效/代次绑定，覆盖同客户切地址而非只测试改客户；不要求本轮发真实确认单来验证。

## 保留已证部分、待GUI与当前任务结论

- 11.3：App员工默认orders；渲染前adminOnly gate防管理页挂载，Layout仅orders/printing；List/Detail写按钮按isAdmin；Detail员工不请求listOrderReturns、成本块按角色。cookie credentials include，session/login更新CSRF已有。**源码接线改善明确，仍需双角色登录/恢复、直接导航和Network无禁请求的独立浏览器证据，不能用复制Set测试完成。** 用户停用/降级后的服务端拒绝已由后端证明，AuthProvider当前仅启动/显式刷新session，不能宣称前端已实测即时角色变化。
- 12.1：商品/客户主列表续页、商品编辑/助记码/条码、客户地址启停/默认、价格CRUD请求已有；A3/A4和移动实际表单仍待补。
- 12.3：生产controller/session/append已接线；此前350/400两行auto末行、tabs/搜索保留、cancel父空单通过仍有效。仍需受控迟到响应、全单库存联合失败、手动不足与重复配置、草稿/确认UI及超时key实际事件。净图下载缺口保留。
- 12.4：只读return_history与已配送可改单、仅confirmed且未配送才显示作废、提交版本/原因已接；A1/A2/A6/A7阻挡，不能完整验收。
- 12.5：RestockModal实际按ret.version及returnAllocationId/quantityBase发送，计算剩余、不返库段跳过，正整数/余量原文校验，Detail实际开modal并刷新；信用/现金退款分列已改。分次来源与退款分离的后端事实已证，但A5/A6及生产组件两次提交实际回读仍待补，现agent-a手造剩余量测试不证明这些事件。

必要GUI最短集（待主代理另行授予独占）：①employee启动/刷新/订单历史/打印，验证无管理请求；②Catalog前导零条码与助记码/停用、多地址与专属价后页；③同客户换地址报价失效；④已有退货12→退3后的剩余编辑/历史版本及来源定位；⑤上海默认时间分次返库3+2、1.5拒绝与超时同意图重放；⑥网络A慢B快quote、取消开新会话旧响应不污染。失败回Gemini修，Codex不代写测试。A10两wrapper施工及B/C现有写入仅列共享依赖，未在本轮当新缺陷派发或重跑全局。


## A11有界生产源码预审（非终局）

快照起点：2026-11-11T10:57:12.692548+08:00。A11仍在headless E2E调试，A12 CSRF修复已排队；B/C owner props消费在施工或排队，不据此要求A跨界补页面。先CodeGraph未命中，随后只读production代码与已有测试。**本轮未执行任何测试/GUI/全局检查，未改实现或checkbox**；下面“已修”仅指可见生产接线，不宣称UI通过。Catalog A3已移交D，本轮不审不派A；共享wrapper已独验，不再测试。

| 生产文件 | 起点mtime（+08:00） | 起点SHA256 | 终点比较 |
| --- | --- | --- | --- |
| src/App.tsx | 2026-11-11T10:41:46.617841+08:00 | `166636e4ca064891d8b1d9c1605ca91b67be979db42bd8df1ce7b29640e4b7f8` | 相同 |
| src/navigation.ts | 2026-11-11T10:40:42.595293+08:00 | `d9f37fdf2682ca6342991cc406a5c788bef275a00bf85efe789d2169fb443369` | 发生变动 |
| src/pages/sales/OrderEditPage.tsx | 2026-11-11T10:21:42.072783+08:00 | `bfac65476152b38dcf39b3b11cdb0b1b7a0030ec551f19f878de356e16eb9ca9` | 相同 |
| src/pages/sales/OrderDetailPage.tsx | 2026-11-11T10:26:39.498829+08:00 | `f1e34c83b564147bfbdbee62bff2620ce409f0aa92e41322aad61419265008ec` | 相同 |
| src/pages/sales/OrderCreatePage.tsx | 2026-11-11T10:50:27.046752+08:00 | `977fed546bf9a3ed495483730d0a72791c9c5b9ce64943e83ba96a53beff8499` | 相同 |
| src/pages/sales/components/CustomerPickerModal.tsx | 2026-11-11T10:15:37.058297+08:00 | `73f1c969363837c41e4fa4412d39fe2c600b12e06e399ad3a8b9a5296bcad053` | 相同 |
| src/pages/sales/components/OrderReturnModal.tsx | 2026-11-11T10:19:20.156734+08:00 | `3d9fc534baa3bbf54346bc5ea268a431f8efb5c9a73033b31bd6e0d72c960701` | 相同 |
| src/pages/sales/components/RestockModal.tsx | 2026-11-11T10:17:15.427778+08:00 | `5928eaea81818c2df571ab571118c12a42465d5675885066edc94c549b998720` | 相同 |
| src/pages/sales/components/batchPickerLogic.ts | 2026-11-11T09:22:50.766215+08:00 | `881caa067812d431ff5e5ec52edd061e150217547862e1e83388d8c3776a010e` | 相同 |

终点：2026-11-11T10:59:08.107834+08:00；以上核心文件本轮有变动：apps/web/src/navigation.ts。这仅固定当前预审快照，A11未最终停工，不能当最终freeze。

### A9逐项关闭/残留矩阵

| 原项 | 当前已修生产证据 | 当前剩余判断 |
| --- | --- | --- |
| A1改客/地址/历史 | Edit已引入CustomerPicker、selectedCustomer/address/显式snapshot，revision payload传customerId与互斥地址；Detail真实getOrderRevision/initialRevisionId、历史只读banner与返回当前版按钮 | 原“没有入口/只有摘要”关闭；全账户显示与来源旧版本状态仍有下列N1/N2 |
| A2来源 | navigation.ts真实识别/api/v1、订单revision、batch query+fragment、ledger fragment、loss href所指return/stocktake等；保留rawHref/rawSource。App真传B href callback/C SourceRef callback与initial props，AI onOpenReportRun传report.id | 原“完全未传回调”关闭；returnId/customerId无人消费及旧revision残留N2，未知参数N3。B4 props消费queued不算A未传 |
| A4无地址伪快照 | CustomerPicker过滤active地址，缺有效地址进入自填分支，contact/phone/address逐项必填；只有用户明确填写后造snapshot，无默认“—/现场交接” | 原隐式假快照关闭；未GUI验证该新增分支，既有已保存地址报价成功保留 |
| A5返库时间 | Restock getShanghaiNowInput由Intl Asia/Shanghai parts初始化，提交相同上海墙钟+08:00 | UTC误拼偏移源码问题关闭；当前新增test11调用该真实生产导出，但本轮未跑 |
| A6意图与409 | Return/Restock已持ref key，输入变更换key、失败不换；Detail confirm/delivery/void持key并成功后换；Edit仅VERSION_CONFLICT时resetIntentKey再initialize，其它409明确码 | 原“每调用无条件换key/409不换”关闭；重复退货会话N4。同key+payload未知失败重放仍需实际事件，不以ref存在就通过 |
| A7derived/null | Edit不再因quantity===null强制readOnly；有效quantity取quantityBase、按后端readOnly/kind保护历史 | 原冻结可编辑未退段关闭；新增test13仍是复制mapping，并非组件变更事件，12→退3→改余9实际链待验 |
| A8地址quote | Create effect已依赖selectedAddress/deliverySnapshot；Edit依赖selectedCustomer.id/address.id及snapshot.address/phone | 同客改地址不触发的旧分支关闭；Edit仍漏snapshot.contactName/customerName（N5） |

### 可一次合入A12的窄反馈

**N1 / P2：全账户金额已展示，但账户主体按数组位置猜、差额仍丢精度。** Edit:527–557用Math.round(Number(balance)*100)再减；Money支持超安全整数分的大额，会把1分差额舍掉。更直接的业务错误：`idx===0`标旧客，其余标新客；后端finance/core.ts previewCommercial:98–105按customerId排序返回，不保证旧客第一。新客UUID排前时，页面把新客余额写到“原客户冲减”。请按change.customerId匹配原/新客户名称和角色、十进制整数分/BigInt精确算差额；保留服务端before/after原串。不是要求前端重记账。

**N2 / P2：来源目标生命周期与消费仍不完整。** App:51–75仅`if(target.revisionId)`才setSelectedRevisionId，没有在无revision目标清空。Detail prop又使用`selectedRevisionId || navTarget?.revisionId`；从旧版本来源→订单列表→另单/同单当前来源仍可能用旧UUID请求新单历史，或返回当前后重新回页又落旧版。普通列表onSelectOrder也未统一清navTarget/revision，现onBack仅清selectedRevisionId但旧navTarget fallback仍在。请在每次导航明确替换整份目标、无revision时清除，返回当前/切列表后不留陈旧override。

同时navigation.resolveSourceHref('/returns/{id}')返回page:'orders'/returnId，但App的orders分支不消费returnId、无getReturn→父订单定位；current客户来源也仍仅挂无initialCustomerId的D页。前者应由A使用已有getReturn拿父订单/退货来源视图（员工权限先拒绝管理请求），不能把识别path但仍默认列表说已钻取。客户初始ID需A与D按已约定边界协调，不允许A改D实现。B/C已传的initial props及其queued消费不重复算此缺陷。

**N3 / P2：resolver对未知参数/后缀仍静默当成功。** 多数正则无尾部锚点，query除batch外都不校验；`/api/v1/orders/abc/unknown?foo=bar#x`会匹配普通order并丢其语义进入详情，未走文档要求的完整可复制降级；`/api/v1inventory/...`也会被startsWith宽松剥前缀。请精确匹配已核真实模式及参数，未知形状走raw元数据降级，不新造endpoint。已有标准/api/v1和合法query/hash解析改善保留。

**N4 / P2：成功退货后同一modal会话的旧意图未退休。** OrderReturnModal在Detail始终挂载（isOpen=false只是return null），submit成功只onReturnSuccess/onClose，未清reason/selections/raw/errors或更新intentKey。Detail loadOrder使order.version变新，再开该modal仍旧选择与旧key；不编辑直接再提交时正文expectedVersion已变、key仍旧，会IDEMPOTENCY_CONFLICT；取消重开/改order时也不建立明确新会话。应只在确认成功或明确结束意图后清理/换key，未知失败保持原key与原payload；不能为避冲突每次点击新key。Restock当前选中return关闭后被Detail卸载，有不同生命周期，不把它同样定性为已发生复用缺陷。Detail/ref持key与Edit409重置本轮已修不重报。

**N5 / P2：Edit快照联系人变化没有纳入quote失效。** Edit:246–254只依赖snapshot.address/phone，payload却传完整AddressSnapshot。只改contactName/customerName、地址电话不变时，quoteState保持旧有效，提交却带新配置。请以完整有效payload配置绑定失效；Create当前依赖整个snapshot已补，不再次报Create旧问题。是否影响金额不是判据，quote必须与所确认的请求一致。

A12已排队的logout→匿名challenge缺口继续引用browser-review真实GUI证据，不另重复派任务、不放宽CSRF。AI同id初始effect自动POST另由foundation核C，不归A本轮反馈。

### 当前测试接线真实性（只读，未运行）

- 原batch controller/session/append真实生产接线仍有效，不退回A9旧结论。
- agent-a-workflow新增11导入真实Restock上海时间helper、12导入真实navigation resolver，属于有效生产纯函数覆盖；13 derived mapping仍在测试复制，14只测试本地key变量与generateIdempotencyKey，15只手动调用controller，不证明组件依赖地址事件已覆盖。原常量/复制测试边界保留。
- agent-a-e2e-regression现确实launch真实headless浏览器、真实登录、操作页面，不再只有fetch；**作者仍调试，本代理没有执行或接受作者结果**。当前请求监控只记orders/.../returns及users POST，未覆盖所有管理API；test2标题说quote失效，但只输入快照/导航历史/改单并截图，未产生行quote并断言代次/响应。部分步骤在if元素可见内，可被跳过，不能仅绿数关闭缺项。
- 已有有界GUI员工默认/刷新/手机只读、350/400auto末行与取消、报价/模式切换通过继续有效；新增源码并不让未测打印、管理直达、真实网络竞态、改客/退后改单、分次返库自动通过。等待作者稳定通知后按协调者再定向检查/GUI；本轮不勾任务。


预审中navigation.ts确实变化，终点hash为`0df7ebf08542d012529badf1a3e56cfb5e27c50f6ddb9e5da39a99d618cebb73`。仅追加只读核对其当前path解析改为parts[0] || '/'，N3所述宽松prefix/未锚定正则/未知query仍可见；不把已变动文件当最终稳定交付，后续仍需作者停工后再核。


## A12/A13交付后的最终源码核对（待串行运行，不是最终UI验收）

2026-11-11，协调者确认A/B/D源码及C production src已停写，C仅另写部署smoke入口。先CodeGraph未命中新文件，再读CORE_NOTES、Auth/client/Context/Login、Sales/App/navigation及B/C实际optional props。固定时间2026-11-11T11:42:14.906468+08:00，结束比较所列源码hash相同。本轮**没有GUI、测试、构建、API写入**，仅只读signed金额手工推算；作者36绿或E2E声明不当独验。没有改frontend/tests/tasks。

| 文件 | mtime（+08:00） | SHA256 | 核对终点 |
| --- | --- | --- | --- |
| src/App.tsx | 2026-11-11T11:27:29.541958+08:00 | `55f02876d9ab1ca52f3a177af9b5517e1c4b6de555e827589987627752339888` | 相同 |
| src/navigation.ts | 2026-11-11T11:26:05.367208+08:00 | `b6a2085ce207652bacb634d8855be62d1dddf899cb627e2b788e6b42ef40b4f4` | 相同 |
| src/api/client.ts | 2026-11-11T11:04:45.714671+08:00 | `0a91b3fd5d6cffb9b1897b1d0c2540df4c6c2b8d2f52612356a940459bae0e09` | 相同 |
| src/context/AuthContext.tsx | 2026-11-11T11:05:08.505323+08:00 | `604b0c08e87876ccab13b4826e88f43472db815625405e1fd5837f21aafdef05` | 相同 |
| src/pages/auth/LoginPage.tsx | 2026-11-11T11:05:31.435285+08:00 | `7dfec155a02aaed5e4fbcd59429561a6be76bbb14c4f4381e6ef877fbac2eae0` | 相同 |
| src/pages/sales/OrderEditPage.tsx | 2026-11-11T11:15:49.373563+08:00 | `c39070991eee1f5fad1d5942857d08619ac13b2e02156eadb7f19b3af239ca12` | 相同 |
| src/pages/sales/OrderDetailPage.tsx | 2026-11-11T10:26:39.498829+08:00 | `f1e34c83b564147bfbdbee62bff2620ce409f0aa92e41322aad61419265008ec` | 相同 |
| src/pages/sales/components/OrderReturnModal.tsx | 2026-11-11T11:22:41.483175+08:00 | `3eb3e565900911e4c59efc2260b2da6c228221f44cb315a5d9d4d34a20b774fb` | 相同 |
| src/pages/sales/components/RestockModal.tsx | 2026-11-11T10:17:15.427778+08:00 | `5928eaea81818c2df571ab571118c12a42465d5675885066edc94c549b998720` | 相同 |

### 原N1–N5/CSRF当前矩阵

| 项 | 最终源码事实 | 当前结论 |
| --- | --- | --- |
| N1账户主体/差额精度 | Edit:561起按change.customerId匹配order.customerId/selectedCustomer.id；原before/after串直显，差额使用parseDecimalToCents/formatCentsDelta BigInt | 原按idx标错客/Number分精度关闭。signed手工核算：-0.01=-1n、-5.30=-530n，到0分别+1n/+530n、到0.01分别+2n/+531n；整体负号在整数+小数后应用，不存在负整数加正分的错误。未实际运行函数/页面 |
| N2目标替换 | App新增applyNavigationTarget完整setOrder/revision/navTarget；列表/回退/新单清旧目标，Detail去掉navTarget revision fallback；return admin真实getReturn找orderId、employee分支拒绝；plain customer/balances/ledger统一finance | 原“完全丢ID/旧revision普遍残留”大部关闭；原生URL/一次监听身份闭包、历史打印UUID仍有F1/F2，不把source链整项关闭 |
| N3精确path | navigation前缀按/api/v1边界、regex尾锚定、未知query拒绝；合法batch query/hash、ledger entry fragment、report-runs alias保留，rawSourceRef/href仍可降级展示 | 原宽松前缀/未知后缀及query误成功关闭；未在本轮跑resolver或所有异常组合 |
| N4退货会话 | Return resetSession清reason/selections/raw/errors并换key；成功、显式关闭及order.id/version变化触发；失败catch不reset | 原成功后旧选择/key污染新会话关闭。未知失败不改输入时key/现版本正文保持；源码未见独立frozenPayloadRef，不能照NOTES宣称所有跨刷新payload重放已实测。仍需响应丢失→原意图重放/成功后再退的组件实测 |
| N5快照失效 | Edit effect完整包含customerName/contactName/phone/address及customerId/addressId；Create依赖完整snapshot | 原只改联系人不失效关闭，实际quote事件/晚响应待测 |
| A12 CSRF | client.ensureSessionChallenge有并发promise去重；logout清token后重建、login先await challenge；Context finally及Login mount也补挑战，session/login响应更新token | 原无匿名challenge的生产缺口已修，未放宽CSRF。此前真实GUI失败保留历史；无刷新Admin→Employee→Admin尚需独立运行/GUI复验，不据作者测试关闭11.3 |

A9其余已修维持：明确自填快照/无静默自提伪造、上海返库默认、derived/null未退余量按后端readOnly保持可改、VERSION_CONFLICT换key刷新、生产quote/session/append实际接线。Catalog已由D验收链承接，shared wrapper已有独验，本轮不重复测试。

### 真正残留F1：初始身份与原生URL导航生命周期

`App.tsx:45–57`session恢复/登录role变化时无条件设employee orders/admin order-create；`:114–136`原生URL解析和huoyoupu:navigate注册在空依赖effect，只捕获首次render的user（Auth初始通常null）及applyNavigationTarget。

可由代码证明的两条具体路径：

1. 直接打开`/api/v1/orders/{order}/revisions/{revision}`或管理来源页面时，初次effect设置目标，随后getSession使user加载，role effect又将activePage设默认。**原生深链可被会话恢复覆盖**，当前并非只接“已经登录后的按钮跳转”。
2. 一次注册的global navigation监听一直调用初始闭包user。员工登录后触发`huoyoupu:navigate`退货href，applyNavigationTarget内`user?.role==='employee'`会因闭包null而错过门槛，继续getReturn管理员接口；这违反11.3不能触发被禁接口，即使后端仍403且无泄漏。初次原生return路径也可能在session完成前发送请求。

这是生产事件/身份接线问题，不是B/C外依赖，也不是已修CSRF。需要在身份明确后解析初始路径，并确保注册事件读取最新身份与导航函数；默认路由只用于无显式目标的场景。A源修复后用真实角色恢复/直接URL及监听事件验证请求集合，不能用复制Set测试代替。没有在本轮发实际HTTP或GUI复现，按确定源码路径标待运行复验。

### 真正残留F2：详情内部选历史版本后打印未传该UUID

`OrderDetailPage.tsx:85`handleViewRevision只setViewingRevision本地；`:276`打印仍`onPrintOrder(order.id)`，Props签名只有orderId。App不知道用户通过版本历史tab选择的viewingRevision；打印页initialRevisionId取App selectedRevisionId/navTarget，而不是Detail当前查看revision。

因此从普通订单详情→查看旧v1快照→点打印时，App revision仍null，预览可能请求当前版本；反向从来源带旧revision进入、点击Detail“返回当前生效版本”（只清本地viewingRevision）后打印，App仍保留旧revision，可能打印旧版。现C production已能消费initialRevisionId不是阻挡，A需要把**用户实际选中的商业revision UUID**随打印动作明确传递并同步当前/历史切换。不要求新后端或自由编辑打印内容。未GUI执行，不把预览空白历史误并此项。

### B/C source props已实施，分清传参与消费证据

A实际传Inventory receipt/product/warehouse/batch、Stocktake id、CustomerFinance customer/ledger、CashEvents cash/customer、Statements statement/customer、Reports run、AI onOpenReportRun；B callbacks取href、C取SourceRef的适配正确。plain customer已归B finance，不要求D initialCustomerId。C Reports已有initial run实际GET水合、AI有sameid回调、PrintPreview UUID initialRevision/templateVersion消费，不再写这些为queued/未实施。

B真实源码也已增加props消费，不止声明：Inventory按initialReceiptId开详情/按batch目标切tab；Stocktake按id load详情；CustomerFinance选initialCustomerId并标记entry；Statements按id handleOpenDetail。不过CashEvents当前initialCashEventId只在列表行`ev.id===initialCashEventId`着色，没有getCashEvent(id)读取，initialCustomerId只切筛选；**目标不在首屏时仅传prop不保证定位**。Ledger/batch类似页后目标的自动定位须由B独立复核。该消费者缺口归B，不当作A没传/不让A越界修改；本轮未重审B全部分页或C竞态。

### 最短待运行/浏览器补验

源码关闭与任务通过分开，以下等新部署test停写和静态门槛后串行执行：

1. 同页无刷新Admin退出→Employee登录→刷新恢复→Employee退出→Admin登录，挑战/角色正确、无400/403登录错误；员工直达管理源/退货源时不主动请求管理员API。
2. 对真实order revision URL刷新/恢复会话，展示指定历史版；再普通订单/当前版不残留旧UUID；global来源事件用最新角色。回退未知href展示完整来源，而不是任意默认页。
3. 在Detail版本tab查看旧版→打印，Network/PrintData绑定该revision；回当前→再打印应绑定当前版。C模板版本独立选择，不用商业versionNo冒充UUID。
4. 改客让新客户UUID排前，双方名字/余额正确；-0.01/-5.30跨零与大额1分差额显示准确；同客仅改联系人quote即时失效；12件/瓶退3后未退derived余量可改，历史段不变。
5. 退货成功关闭再开清空新会话；未知响应原key+原正文重放，分次返库原来源/version/上海时间回读；后页来源准确定位由各owner一起留证。

此轮没有新的pass测试计数，没有宣布全组稳定检查通过。现有GUI所测只读/350与400滚动等部分通过继续保留；11.3/12.*未因源码关闭自动勾选。新deployment-browser-smoke入口等C完成后再更新serial-plan，不在本轮运行。


## A14两条行为窄复核（A15仅布局仍施工）

2026-11-11，先CodeGraph未命中，再只读App、Detail及C PrintPreview的revision消费；本轮没有GUI/测试/构建/API请求，不改实现/tasks。只核F1/F2，不重新打开N1–N5/CSRF已修结论。A15底部确认按钮布局尚未验收，不能用旧截图称已完成。

| 源文件 | 本轮读取mtime（+08:00） | SHA256 | 结束比较 |
| --- | --- | --- | --- |
| src/App.tsx | 2026-11-11T11:56:09.959801+08:00 | `fb13069e85a78e3d36310ac16e5bf31c26688b4d818e7db16a15eedb96893df1` | 相同 |
| src/pages/sales/OrderDetailPage.tsx | 2026-11-11T11:54:04.693162+08:00 | `1634561fe1f44aa4dd9b323b212a94bb652bc52db69ca8bca49a65a854c5f7cf` | 相同 |
| src/pages/printing/OrderPrintPreview.tsx | 2026-11-11T10:43:22.805948+08:00 | `acf45c320b799f87bff3ed1d0989430ad15951d97d38d89c9047926c73dccaaa` | 相同 |

- **F2生产链关闭，运行待验**：Detail新增viewingRevisionId，成功getOrderRevision后记录请求UUID；handleBackToCurrent清viewingRevision及id。打印调用`onPrintOrder(order.id, viewingRevisionId || undefined)`，App回调明确设置/清除selectedRevisionId并同步navTarget，C收到initialRevisionId后用于PrintData。故“Detail内部选历史却只上送orderId”的旧缺口已修，历史→打印/回当前→打印仍须后续真实GUI/Network证明。本轮不对C其它版本/布局扩审。
- **F1角色闭包及普通显式目标默认覆盖已修**：App用userRef.current读取最新角色；getReturn前要求明确admin，employee/null不会发管理员请求，return异步有navSeq。身份effect对已建立的普通order/revision navTarget予以保留，而非无条件回默认。
- **F1仍有同路径窄残留：初次原生return深链在身份恢复前丢失**。App初始URL解析effect仍空依赖、在Auth loading时执行；resolve返回returnId，applyNavigationTarget看到userRef初始null，立即清navTarget/订单id并回orders。其后getSession恢复管理员时没有pending initial target，身份effect只能回order-create；初始effect不再运行。因此直接刷新`/api/v1/returns/{id}`不能在确认admin后重新getReturn定位父订单。需要将初始target保存/延迟到身份明确后消费；employee仍必须不请求管理API，不能为保深链放开null身份门槛。此为F1原身份/初始URL生命周期中的未闭路径，不是新业务范围。

后续最短实际复验：①admin恢复/登录后直接return源准确定位、employee同URL无getReturn；②普通order/revision URL刷新仍指定版；③Detail历史tab旧版打印带该UUID，回当前打印不带旧UUID。A15完成前不运行或判底部按钮通过；等待协调者统一静态门槛和串行安排。
## A20 首退改单窄核（源码停止后，仅静态）

本次未运行任何CLI/API/browser。固定SHA256：OrderEditPage `bd795d58fc0d0f024eb8cf391c6188b8757218e50d50f7692b3cb8a42c81e061`；OrderLineEditor `9051cfdde373db3cc1082cfb0ffea72cf1ec39c8b3314b285de7137978d688f7`。

已接通：首次returnedQuantityBase>0按基础单位分protected/remaining，余量Q提交Q+该原行returned；初始空继承价不被数量/批次校验阻报价，Editor没有自动报价回填effect，仅手动输入设priceEdited；后续derived returned=0不重复加历史量。findCalculatedLine按sourceLineId+readOnly或新增clientLineId关联且真实传入Editor，金额取服务端calculatedLine，无本地历史金额分摊。

**P1残留：**OrderEditPage:350–364 对returnedQuantityBase=0的已有行（包括后续derived）无条件set全部字段，忽略priceEdited=false，仍提交unitPrice及unitId。后端在此路径将清pricingBasis；因此未修改的derived可能被展示近似价重新计价。例如原1分钱/2瓶，退1瓶信用1分、剩1瓶净0分，derived展示0.005000/瓶，再保存其它头部会把未动余量重报1分。最小修法是未变行不set、未手动改价省unitPrice、未换单位省unitId，不能只按returned>0分支保护继承。此为静态可证路径，不冒称本轮已实际运行该分币例；已即时交协调者，acceptance继续本轮既定执行。

新增pure test24（agent-a-workflow:748起）本地模拟split，并重新声明findCalculatedLine，未导入生产实现，不能替代真实组件/payload回归。其通过不证明上述P1关闭。其它A源码与旧测试未扩大复审。
## DeepSeek阶段A停止后窄复核（2026-11-12）

对照私有before.tar.gz逐文件差异而非git HEAD，只读判定原A20“returned=0 derived未变也发set”的源P1已关闭：新增`orderEditLogic.ts`的buildLineChanges由OrderEditPage真实导入并用于buildRevisionPayload。所有已存行初始化quantity/unit/warehouse/remark/mode基线，onChange保留基线；无变更不发set，qty或warehouse改变也不发未变unitId/unitPrice，显式priceEdited才发价格。首次returned>0仍为Q+returned并显式基础单位；derived returned=0不重复加历史量。删除已退行余量仍set到已退总量，readonly不会被UI删除；remark清空用空串、mode切换和manual batchSelections均独立检测，不被数量/价格优化吞掉。服务端quote关联和初始3+9展示未被本次差异移除。没有发现本次新source阻挡。

pure25真实动态import生产buildLineChanges，覆盖未改derived无set、改别行不串、quantity-only省价格/单位、真实单位/价格变化、首次已退3余9及Q+3输入。它不再是复制helper自证，但使用构造的编辑状态，**不等于实际页面/HTTP实现1分钱退后净0回归**；warehouse/remark/mode/delete只在本轮源码检查覆盖，未声称该test断言它们。A E2E两处差异仅合法文本定位与当前可见行等待报价，未降低金额条件。实际运行由acceptance独占，本代理无tests/API/browser执行。

保护基线90→90，新增/删除/修改均[]。前端67→68：只新增orderEditLogic.ts，修改OrderEditPage、agent-a-workflow、agent-a-e2e-regression、CORE_NOTES，无删除；未动Editor或其它模块。固定SHA256：Edit `889876b2c0759a813d9ba1dfe48f09fb52de52f54845c45f3d8156d8435a69ca`；pure `e9a58b51a3d5fd47c290021cf7ec3681c891a1ad8805fe627befa61a79dff2f0`；E2E `268f89581639994ac87bea5b8e9c8f832dd01191fc298ca0e25c740e9b786287`。仅源审关闭，不自动完成12.4或其它任务，当前44/56。

### 后续既有实测证据核对

只读核[frontend-deepseek-a-result](frontend-deepseek-a-result.md)及关联A pure/E2E日志：pure33/33，E2E5pass2fail保留真实边界。新增真实原生GUI/Network记录明确1分钱退后derived净0、只改原因的POST revisions返回201且lineChanges=[]，最终GET仍净0；这已补前文“仅helper、无页面HTTP分价证据”所指的限定缺口，不应继续报为未验P1。E2E的Picker旧标题与隐藏mobile重复匹配仍是测试locator问题，未据此否定该GUI分价链，也不把整体A/12.4写全完成。

12.2新入库实际时间/成本与正确stale重建已证，新增独立批不变旧批版本并非stale缺陷；完整原文仍有手选不足补满的前端正向路径尚未找到实际记录。已将矩阵缩到此一最小剩项，保持12.2未勾及44/56；不重跑已绿库存/盘盈成本阻断/小数/分页，不改任何实现。

### 12.2最后正向补选证据已补齐

上述待验已由[frontend-deepseek-a-result末节](frontend-deepseek-a-result.md)的真实GUI/原生Network补齐：需求3、手选原批1时报不足2且加入禁用；另一批补2后错误清除，加入并取得真实quote200，服务端allocations1+2合计3、成本2.12+4.25=6.37、warnings[]、stockReserved=false，保存/确认可用。未保存/确认而刷新弃单，不假称新增销售记账；该成功正向补选与既有入库/仓批/盘点/小数/成本证据共同满足12.2完整原文，不重测已证路径。

本代理仅只读独核并按apply sourcePath的85行/id42将12.2勾选，随后strict实际通过、刷新apply：**45/56完成、11待完成**。与更新前56项完整比较只有id42的done变化，描述及其它55项全不变。本轮未跑tests/API/browser/GUI/模型请求，未改前端；12.3/12.4及最终外部项目仍按各自证据。
