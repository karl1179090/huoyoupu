# Catalog 源码复核（12.1 / A3）

**当前状态见文末“D2停止后源码复验”；前段施工快照保留历史，已修项不再视为现存阻挡。**

2026-11-11；D仍在运行/修正自己的浏览器测试，**不是正式交付或最终验收**。本轮只读catalog三个页面与catalog-*两测试，先CodeGraph未索引再读源码，未运行UI、types/build/全局或单测，未改前端/测试/任务勾选。以下仅本快照可证事实；作者继续修改时必须重核，不作为重复派工清单。

## A3指定范围现状

| 要求 | 本快照生产实现 | 判断/待验 |
| --- | --- | --- |
| 专属价>100与可选商品>100 | CustomerListPage fetchAllCustomerPriceRules / fetchAllProductsForRules各自do/while(cursor)，前后检查customerId+seq；保存后完整重取规则再匹配version，删除传真实rule.version | 原“仅首100”在源码已修；没有证据显示新测试创建>100条并在UI选后页，待正式交付核页链 |
| 切客/关窗旧规则隔离 | open推进seq并绑定客户，close清客户并推进seq；规则和商品每页都查scope | 主读取结果隔离已实现；同客切商品/单位报价另有下述快照缺口，不能全称“scope彻底闭环” |
| UnitPatch编辑 | ProductListPage startEditUnit→handleSaveUnitEdit真实调用updateProductUnit，expectedVersion取Unit.version；编辑name/defaultSalePrice/defaultReceiptCost，空成本传null；表格按钮已绑定 | 原“只有新增启停”已修。当前倍率整体只读；本轮不以支持所有UnitPatch可选字段为新要求，也不要求修改已有交易倍率 |
| 地址编辑 | CustomerListPage startEditAddress/handleSaveEditAddress真实绑定；联系人/电话/地址/标签传Address.version，默认/启停仍走各自PATCH | 原“无编辑”已修；空电话/标签无法清除见下 |
| 仓库完整页 | WarehouseListPage调用listWarehouses({q,cursor,limit:50})，存nextCursor、追加页、提供载入更多；名称修改/启停均带真实仓库version | 共享wrapper已独验，不再列外部缺失；本轮未执行第51仓/过滤异步竞争 |
| 价格来源真实可点 | CustomerListPage调用getCustomerPriceQuote并展示source、sourceOrderId；按钮调用handleJumpToOrder(orderId,sourceRevisionId) | 原“只定义未绑定”已修。可选callback未由当前App直接注入，但有huoyoupu:navigate事件fallback，App已有监听/版本路径解析；不能静态判必不可用，仍待实际点击核目标ID/旧版本 |

## 两项可证快照缺口（待D停止后重核，不重复派其施工行）

1. **P2快照：同客切商品/单位的报价响应可错配。** CustomerListPage loadPriceQuotePreview约318–333行只核customerId+弹窗seq；handleProductChange / handleUnitChange（385–409行）在同seq内发多次请求。先选商品A再选B，B先返回、A后返回，A仍通过scope并覆写priceQuotePreview；界面当前选择B，却显示/可点击A的历史价与订单。需要绑定本次productId/unitId或独立报价代次并在切换时清旧预览，不只检查客户。与已实现客户scope隔离区分，正式停工后按新hash确认是否仍存在。

2. **P2快照：地址编辑无法清空电话/标签。** handleSaveEditAddress约237–245行对editAddrPhone/editAddrLabel使用trim() || undefined。PATCH语义中undefined序列化省略，后端保留旧值；清空表单保存后原电话/标签仍在。契约允许空字符串，应让明确清空作为空串发送；这不涉及新增字段或后端变更。联系人/地址本来必填，不受此建议影响。

外部边界：历史价来源按钮最终落到对应订单UUID/修订UUID由A导航和订单详情消费负责；D保留两ID并确实派发已做到。不要据此要求D越权改App或新增来源后端端点。共享warehouse/Page已通过，不再当接口未就绪的理由。

## 测试真实性与未验事实

- catalog-logic-workflow.test.ts名称虽带logic/workflow，主要直接fetch真实API，用随机客户/商品做助记码、条码、单位、地址、专属价CRUD及仓库页。不是常量自证，但也没有导入生产React/client；只能证明其实际运行时后端请求，**本代理未运行**。
- 其中test7“Request Scope Isolation”在测试内自造scopeState/fetchCustA和两个定时器，不导入CustomerListPage/生产scope模块；只能证明复制的算法，不能检出生产删除scope检查或同客商品报价竞争。不是有效生产回归。
- catalog-browser.test.ts真正用Playwright加载localhost页面并点击真实组件，未见route/fulfill/mock替代业务响应；有单位编辑、地址编辑、专属价及350px弹窗宽度等页面断言，质量比纯常量用例更强。脚本当前mtime持续近期变化，作者正在跑，不以文件存在/启动run/截图文件名认定通过；未见本次范围中>100规则商品、延迟报价交错或历史来源按钮定位对应旧版的完整断言。
- 两脚本开头都会搜索并释放其它产品持有的固定00892条码；这是共享开发夹具写入，不是只操作本次随机实体的完全隔离测试。这里只记录测试边界，未执行/未读密码，不将已有虚构数据说成真实客户数据。

## 快照标识

下列mtime为UTC；上海时间+08:00。复核结束与开始hash一致，表示本次阅读期间这五个文件未变化；D仍未正式停工，后续编辑会使此快照过期。

| 文件 | mtime UTC | SHA-256 |
| --- | --- | --- |
| apps/web/src/pages/catalog/ProductListPage.tsx | 2026-11-11T02:12:50.444597+00:00 | 6e1183e4224dc57b84f4077492ed33a313481bee76116368be19298b1b1097f5 |
| apps/web/src/pages/catalog/WarehouseListPage.tsx | 2026-11-11T02:12:05.443211+00:00 | b98664c86b34ef49da22b88498d2c175f69df9d30ca8c2e413de98858c92d89d |
| apps/web/src/pages/catalog/CustomerListPage.tsx | 2026-11-11T02:27:02.206600+00:00 | 5ff13770ebe8f60d2d2cb630e232fe992014f8c330f6df20585def6d313724ca |
| apps/web/test/catalog-logic-workflow.test.ts | 2026-11-11T02:18:51.414789+00:00 | e678dde1bc0d9e78a076fa5ae7b4404f40ecf46a0c0052483bdd0817c231cada |
| apps/web/test/catalog-browser.test.ts | 2026-11-11T02:33:45.425026+00:00 | 1c4ee546b4105d7349948ad8cb2ee4427afcd06cfea46035948ecff97b967195 |

待正式交付后只重核变更hash对应的上述两条、分页和来源调用，再由实际测试/浏览器证据决定12.1验收；不据未完NOTES或本快照勾任务。


## D2停止后源码复验（2026-11-11）

固定hash后只读复核，没有执行测试/API/GUI，没有修改实现/测试/checkbox；不采用作者最终claim作UI通过。**指定已知源码缺口均已修，本轮未发现需退回D2的新源码阻挡；12.1运行/移动布局/来源落点仍待统一后续验证。** 不要求D增加initialCustomerId，客户来源统一B的决策保持。

| 指定范围 | 当前真实生产链 / 测试 | 结论 |
| --- | --- | --- |
| 同客商品/unit旧报价竞争 | 生产quoteScopeRef绑定customerId/modalSeq/productId/unitId/quoteGen；切商品/单位更新所有键并传递到loadPriceQuotePreview→导出的resolvePriceQuoteWithScope；返回时完整核scope才接受，关闭也使代次失效 | 初审P2已关闭，不重报仅客户seq旧逻辑 |
| 空phone/label清除 | 地址PATCH明确传editAddrPhone.trim()、editAddrLabel.trim()，空字符串不再省略 | 初审P2已关闭；Address.version仍正确 |
| >100规则/商品续页 | 导出fetchAllCustomerPriceRules / fetchAllProductsForRules是真do/while游标循环，页前页后都查客户seq；生产弹窗真实传api.listCustomerPriceRules/api.listProducts并消费结果 | 原首100截断实现已修；不是仅测试helper存在而生产未用 |
| 真实生产回归 | catalog-logic-workflow.test导入CustomerListPage实际导出的三helper；test7真实调用规则分页helper跨100+25及中途scope失效，并调用生产resolvePriceQuoteWithScope制造A慢80ms/B快20ms，断言A=null/B有效 | 原纯复制scope算法已替换为实际生产函数回归。fetchAllProductsForRules有import但当前case未实际调用，商品循环的有效性来自生产源码，不能声称该125条测试也测了商品helper；未运行不报测试通过 |
| UnitPatch / 地址 / 仓库维护 | 名称/默认售价/默认成本、地址联系人电话标签/默认启停、仓库q/cursor/limit及编辑均仍真实调用，版本取各实体 | 保留实现修正结论，不重开已修控件 |
| 00892跨夹具修改 | 两catalog测试不再搜索/清除其它商品条码；改用00前导随机6位条码绑定自身product。00892仅剩测试标题/placeholder示例 | 跨fixture清除代码已去；随机碰撞若发生应真实失败，不靠清除别人资料让测试绿 |
| 价格来源 | 页面真实quote及history按钮继续传orderId+sourceRevisionId；可选callback/全局导航fallback保持 | 与A的最终旧版路由消费联调待运行，不因未传callback就判断必断；无新增后端endpoint |

catalog-browser仍是真页面Playwright操作与断言，非整页mock；本轮未运行或打开其新截图，不能把作者停止等同浏览器通过。最少运行未验为：实际商品后页选择/规则版本、切商品unit报价交错、清空地址字段后的GET、来源旧版ID落点和手机表单；按原12.1测试，不扩大新性能范围。

### D2固定hash/mtime（UTC）

| 文件 | mtime UTC | SHA-256 |
| --- | --- | --- |
| apps/web/src/pages/catalog/CustomerListPage.tsx | 2026-11-11T03:19:16.985982+00:00 | e44c3a11f9b9fadabf019c20b8ce2d7813b28500a13d95f4bf0f8fa93f7cbb20 |
| apps/web/src/pages/catalog/ProductListPage.tsx | 2026-11-11T02:42:12.891835+00:00 | 350e3c7b1d779e2914416bc08b4dede79bfd7b39f5c63123f91bf58b666b7c73 |
| apps/web/src/pages/catalog/WarehouseListPage.tsx | 2026-11-11T02:44:26.840802+00:00 | f6ca0040b6247541c0051e39c9570c0de6355c5ac9fe8674f5b20469261a97e4 |
| apps/web/test/catalog-browser.test.ts | 2026-11-11T03:23:32.533612+00:00 | 5f9119cf022c4f5c7c42df7e2d09261287f28bc76a831eb7d6478679c2f79002 |
| apps/web/test/catalog-logic-workflow.test.ts | 2026-11-11T03:28:07.411342+00:00 | c92f18ae4a68ca1265875a8f4e362e4cd27f4e0ffdb1b69334e657b47e9e41fb |
## 12.1最终非作者证据判定（2026-11-12）

只读核[frontend-deepseek-d.log](frontend-deepseek-d.log)：7tests/1suite、pass7/fail0/skip0、duration31041.028625ms。核实际测试控制流而不只看名称：原1/2仍实际新增商品、500mljy检索、人工助记码覆盖/清除、唯一前导零条码、包装单位/UnitPatch、地址新增/编辑清电话、专属价保存13.60及移动390/350布局；新4保留真实历史成交18.50→按钮→精确order/revision事件/GET→历史只读目的页断言，新5实际UI商品/客户停用及后台false、旧引用保留/新交易拒绝均到达。没有以if跳过主验收动作或删断言凑绿。

结合[catalog后端优先级与历史来源证据](catalog-result.md)、[sales独立历史价](sales-independent.md)和旧真实GUI建议/手填保护，完整12.1原文已满足。本代理实际查看本轮`customer-price-rules-mobile.png`：规则/单位/价格输入/保存/完成在390仿真可见，来源优先级与13.600000专属价可读；其余桌面/移动截图由已实际经过的测试保存，不把它们称真安卓。此项不要求重测全部价格组合或等待整体视觉认可；最终视觉/设备仍单列。

按apply真实sourcePath/tasks84行、id41，仅12.1由[ ]→[x]；strict实际通过，刷新apply为**46/56完成、10待完成**。前后56项比较只id41 done变化，描述和其余55项完全不变。本代理未运行runtime/API/browser/GUI，未修改前端，未联动C旧模板缺口或12.7。
