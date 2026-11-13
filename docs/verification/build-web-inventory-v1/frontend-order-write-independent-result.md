# 订单写流程独立验收（当前候选，2026-11-12）

本轮仅运行类型检查及新 `order-write-flows-browser.test.ts` 一次，没有修改前端/测试、重跑旧组或追加GUI。作者因max-turns停写不是通过证据。

- `npm run typecheck:web` exit0，日志 `frontend-order-write-typecheck.log`。
- `node --conditions=development --import tsx --test --test-concurrency=1 apps/web/test/order-write-flows-browser.test.ts` exit1，日志 `frontend-order-write-independent.log`；7项=1准备+6业务，3pass/4fail/0skip/0cancel，110.6秒。
- `frontend-order-write-baseline.json` 固定原57+新order文件共58，结束 `changedAtEnd=[]`。本轮没有其它运行或写者，runtime已结束。
- 浏览器读取本机Vite生产组件，API全部转发独立PG/动态HTTP fixture；setup与最终GET也只该fixture，不使用/修改共享dev数据。每业务case新context，但共用同一fixture，后续case能看到之前已提交事实；不是正式生产/容量/期初数据。

| case | 实际结果与已到分支 | 当前未证部分/精确修正目标 |
| --- | --- | --- |
| 0 | 隔离PG+HTTP准备通过，动态端口非3000，5笔历史确认单 | 仅准备case，不计业务UI通过 |
| 1 联合缺货/优惠/丢create响应 | 失败于test:332/helper:232：quotes=`[[409,null],[400,null]]`，没有9.00报价。此前真实两独立同行20+20联合不足、提示及确认禁用、未发order写均通过；后改2+2、价2/3、优惠1后报价400 | recorder内有body/response，但失败诊断只输出status/total，未落错误code/details或失败截图，不能凭此判UI或API谁错。应保留非零优惠的真实请求/错误明细再按契约修正。abort-after create、同key同body重试、库存/应收只记一次均尚未执行 |
| 2 丢confirm响应 | 失败于test:401等待“确认开单记账”30s。已实际首次create+confirm后丢浏览器响应，第二次点击，并等到“已成功确认”；首次create次数1、confirm次数1断言已通过 | 后面samekey/body及最终守恒断言未到，不能提前说全部幂等通过。测试等待的是草稿专用按钮：OrderDetailPage:629仅isDraft显示，真实确认后不存在；应等待确认单/真实响应再核录制请求，不要求生产保留草稿按钮 |
| 3 丢create前置/编辑换key | 失败于test:471：GET unitPrice实际`'3'`，断言`'3.00'`。已过：abort-before无响应、无draft；UI把qty/price改2/3并获得6.00；第二次真实保存draft；两请求key不同且body不同，payload qty2/price3，GET唯一draft/一行/基础量2 | 这是等价金额字符串的过严断言，不能称编辑意图未换key。最后库存不变断言在失败之后，未执行，不能补写通过 |
| 4 迁客/新地址/现金/手机 | 完整通过。真实UI更换客户及明确新地址，真实quote两账户before/after，8.00从旧客商业账移至新客；400×750和350×667有效quote/确认可用，底栏在导航上方、350无横溢；350真实点击确认，最终GET新客新配送快照，旧revision保留旧客旧快照，库存不变；原2.00现金仍旧客active且不出现在新客，双方余额等真实quote | 原生手机仿真，不是真安卓。图片 `implementation/order-write-migrate-{400,350}.png` 由本轮真实分支生成，未把截图当用户视觉接受 |
| 5 未配送作废 | 完整通过。真实页面打开作废/输入原因/确认，poll真实GET至voided，UI已作废；应收-6、库存+3、现金记录数不变、revision历史保留原草稿 | 这是此隔离订单未配送路径，不扩大为所有作废/配送/退货场景 |
| 6 并发409/刷新再确认 | 失败于test:691：第二条revision recorder.status为undefined，立即断言201。此前外部真实POST201推进revision，旧UI真实409，未覆盖客户/外部revision及历史断言通过；重新填qty3、6.00显示、原因保留；第二次发送恰2个请求且key改变断言已通过 | 第二次click后仅等泛“已确认”(test:685)，Edit页标题本身就是“更正已确认销售订单”(OrderEditPage:444)，可在请求返回前立即满足。不能把undefined判API拒绝/超时，也不能补判成功。需明确等第二个真实revision响应、校验expectedVersion/状态/最终GET；当前expectedVersion递增与最终revision/history断言未到。隐藏冲突提示等待还catch吞超时(test:677)，应避免以此代替新quote/version就绪证据 |

本轮仅2个完整业务UI通过；case1优惠报价原因待独立后端/契约诊断协作，其余按上述准确已证分支保留，不将测试候选失败统一叫产品缺陷。现有日志没有失败前图、完整request/response dump，不编造缺失证据。未执行其它组/build/设备/真实provider，不更新任务checkbox。后续由唯一前端实现owner修正，我不代写。

## Money源修及测试候选修正后的独立复验

候选停止后另固定 `frontend-order-write-final-baseline.json` 共60文件（前58+Money生产helper/新pure），结束 `changedAtEnd=[]`。独立 `npm run typecheck:web` exit0（frontend-order-write-final-typecheck.log）；完整新order命令与前文相同，exit1，7项6pass/1fail/0skip/0cancel，52.94秒（frontend-order-write-final-independent.log）。6pass准确为准备1+业务case1至5，不能称6业务全部通过。runtime已经全部结束，没有重跑其它组/GUI、修改任何源码测试或checkbox。

- **case1完整通过**：真实同商品两行20+20联合缺货409，提示/禁确认且不写order；改各2、价2/3，金额框普通输入raw `1`，真实quote请求 `discountAmount='1.00'`、subtotal10.00/total9.00。随后真实UI输入 `1.001`、`-1`，金额错误可见、确认禁用、原9.00消失，记录quote/order次数不增；改回1恢复可用。再真实create已提交后仅丢响应、UI同内容重试，create同key同body/优惠1.00，两行唯一新order、库存仅-4、应收仅+9；以真实confirm200及对应orderNo确认详情判成功，不再等草稿按钮。非法输入请求次数检查为该实际交互时间窗口，未扩大为任意延迟/所有金额框race。
- **case2完整通过**：真实confirm服务端已提交后丢浏览器响应，再UI重试；create及confirm各自同key同body，真实confirm200/对应orderNo的confirmed详情无草稿确认按钮，唯一新order/库存仅-1/应收仅+2均核实。
- **case3完整通过**：create到服务端前abort确无draft，之后UIqty/price改2/3、6.00报价并保存，key真正改变且body改变；payload价仍原输入字符串3，用BigInt微单位比较GET等值价3，不强迫UnitPrice两位；唯一draft/基础量2/库存不动已到末断言。
- **case4、5再次完整通过**：真实迁客户/新地址/两账户8.00重分类/旧2.00现金不迁，400与350仿真有效quote/底栏可用、350真正确认、旧revision快照不变/库存不动；未配送真实UI作废、应收-6/库存+3/现金数不变及历史保留均通过。仍是独立虚构fixture，不是真机/实物/正式客户。
- **case6唯一失败**：test:725 `UI refresh after conflict` poll超时，最后实际状态 `{"get":5,"quoteVersions":[2,3],"enabled":1}`。外部真实revision201、header version+1/revisionNo+1、旧UI真实409且expectedVersion为旧值、外部事实未被覆盖/历史保留等前置断言已到。真实新版3的quote已200且确认按钮可用，但test:723的refreshGet基数在冲突后又做多个Node GET才取；生产自动刷新GET可能已完成，test:735再强求GET数增加会等待不存在的第二次刷新。这不是现有证据下的产品刷新失败。应将基数取于冲突提交前，或核已录GET的response.version与新版quote一致，不强迫重复GET。

case6在此失败后未走qty3/二次UI提交/201/newkey/最终GET，不能因代码已有精确response waiter就补写其通过；末尾泛“已确认”+立即countEdit0尚有React切页时序风险，候选owner应等Edit标题hidden/detached再精确orderNo详情。此轮不改测试、不重复跑。前三原误断言已消除，Money普通输入真实UX缺口在Create此次实际路径已关闭；Edit金额非法/取整页面未由本新case直接操作，生产helper/原A回归证据见frontend-money-independent-result.md，不混称全部交互都测过。

## 最终case6精确时序修正后的独立结果

唯一测试owner只将GET基数前移至冲突提交前、201后等待Edit标题隐藏再按返回orderNo定位详情；源码及其它case未改。Mini独占smoke结束、所有写者停止后，独立 `npm run typecheck:web` **exit0**；相同完整neworder命令 **exit0，7pass/0fail/0skip/0cancel，23.83秒**。准确为**1个准备case + 6个完整业务UIcase**，没有将准备case算业务。日志 `frontend-order-write-complete-{typecheck,independent}.log`；`frontend-order-write-complete-baseline.json` 固定60文件，结束 `changedAtEnd=[]`。

case1至5再次完整通过，证据范围与上节一致：联合缺货、raw1规范1.00/总9、非法三位/负数提示与旧报价失效/禁提交、create和confirm各自丢响应重放同key同body/只记一次，编辑后key及body真实改变、迁客新快照与旧现金不迁/400和350有效报价并实际确认、未配送UI作废与库存账款现金历史核对。

**case6本轮真实末端已全部到达**：先外部真实revision201并分别核header version+1/revisionNo+1；旧页面仍用旧expectedVersion提交，真实409且未覆盖外部事实；生产自动重新GET并以external.version生成真实200新版quote、确认可用；页面重新输入qty3后总6.00、原因保留；注册精确revision POST201 waiter再点击，真实返回confirmed/下一revisionNo；等待Edit标题hidden并定位返回的精确orderNo详情，确认已离开Edit。最后两次UIrevision请求恰为409及201，第二次使用不同意图key/更高expectedVersion，最终GET与history显示UI本地原因成为current且外部更正历史保留。原来的晚基数等待与泛已确认文案误命中均不再代替真实响应/切页。

全部仍使用独立PG+动态HTTP fixture/真实生产组件，不碰共享dev/真实经营数据；400/350是桌面浏览器视口仿真，不是真安卓或物理设备。新测试未扩大为所有网络/并发组合，且没有直接操作Edit金额非法输入（其helper/原A回归边界保持前节）。本轮未重跑build/A/B/C/D/报表/旧PDF或追加GUI；60哈希无漂移，全部runtime已结束。本报告保留前两轮失败为历史，本节为当前最终候选结论。任务完整原文勾选由协调者和独立规格复核者负责，本代理未改checkbox。
