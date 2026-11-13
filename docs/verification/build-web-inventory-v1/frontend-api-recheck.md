# 前端API封装第三段只读复核

日期：2026-11-11。只读复核Gemini第三段已稳定的`apps/web/src/api/client.ts`和`api/types.ts`；批量交互正另行修订，本报告不重复列其旧问题。原`frontend-early-contract-review.md`及`frontend-batch-review.md`保留历史。本轮未修改前端或测试，未运行施工中的TSX全局检查；下述“修正”是源码/契约一致性结论，不是浏览器或整体验收通过。

## 原确认问题复核

| 原问题 | 当前封装状态 | 边界 |
| --- | --- | --- |
| confirmOrder未发送版本正文 | 已接收共享VersionInput并把body传入请求 | 源码修正；实际确认/并发/重放待UI验证 |
| 多个写wrapper无幂等键入口 | 现有契约要求key的写封装均接受可选key，并传`idempotencyKey || generateIdempotencyKey()` | 旧“根本没头/不能传旧key”已修；页面同意图是否持有旧key未验证 |
| 手写商品/地址/配送/公司/模板/打印输入漂移 | 已替换相应共享schema类型；打印body含PrintJobInput、模板版本含TemplateVersionInput、CompanyPatch含版本及phone | 先前输入封装矛盾已修，组件调用是否一起对齐另待typecheck/页面回归 |
| ReportRun不存在schema | 已删除该别名，getReportRun返回ReportResult；静态遍历所有Schemas别名均存在 | 源码修正，未宣称已跑整个前端tsc |
| after/现金kind参数漂移 | 列表改cursor；listCashEvents改customerId/from/to/limit/cursor | 封装修正，实际分页待UI验证 |
| 订单概要/余额应用/地址返回误型 | 订单列表用OrderSummaryAny，余额应用CustomerBalance，地址创建/更新Address；模板版本创建返回PrintTemplate | 这些原响应错型已修，尚有下列三处残留 |

使用TypeScript AST只读提取77个已有request封装，对照当前共享OpenAPI：**77个方法/路径均有匹配，未发现遗漏契约必需body或幂等键的现有封装**；没有要求前端必须封装全部79个操作，也没有把尚未实现页面列成缺陷。该检查没有创建前端测试文件或运行TSX工程编译。

## 剩余明确契约矛盾

1. **P2：createProductUnit返回类型仍为Promise<Product>，实际响应Unit。** updateProductUnit同样错型。应返回共享Unit，避免调用方误以为可以读取product.units等字段。目前只确认封装声明错误，不声称已有页面已实际错误读取。
2. **P2：recordOpeningBalance返回类型仍为Promise<LedgerEntry>，实际响应CustomerBalance。** 输入OpeningBalanceInput与key入口已修，响应声明尚未同步；后续读取分录id/kind等会误导。未将当前尚无该页调用证明当成已失败页面。
3. **P2（调用时必现）：deleteCustomerPriceRule缺query.expectedVersion，签名也没有版本入口。** 该DELETE契约要求expectedVersion查询参数；当前只传路径、method与key，无法合法删除。应让调用方传入所选PriceRule的版本，并按契约序列化query。此项不同于已修的key问题。

以上合计4处封装位置：两个单位返回、一个期初返回、一个删除价规则版本查询。无需更改后端或共享contracts。

## 仍待后续证明的边界

- key默认值每次省略会生成新key，这是给新意图的默认路径；现已允许显式传旧key，**不能据此认定每次请求都被强制换key**。UI必须在同一业务意图的失败/超时期间保留key与正文，修改意图才换key；页面的持有与恢复逻辑尚待稳定后验收。
- request仍采用传输层泛型返回断言，本轮只核对封装签名与schema，不声称有完整运行时响应校验。响应三处错型也说明仅编译不保证实际JSON语义，需Gemini以现有契约案例回归。
- Cookie仍是credentials:include，CSRF继续由session/login成功响应更新，未见本轮改坏；真实登录轮换、旧令牌拒绝、401/403身份刷新待浏览器验证。
- 金额/单价继续使用共享十进制string类型和JSON原值；本轮不检查页面计算或最终提交精度，亦不重复批量会话处理中问题。

下一步由Gemini修上述4个位置并补相应已有契约回归；入口与页面稳定后，再由非作者运行工程实际存在的typecheck/test/build及真实API/浏览器验收。当前不更新OpenSpec checkbox。

## 2026-11-11 第五段定向复核：四处P2源码已关闭

仅重新读取上述4个函数，并逐项对照当前OpenAPI；不涉及仍在施工的batch、其它页面或TSX工程检查。

| 位置 | 当前源码 | 对照契约 | 结论 |
| --- | --- | --- | --- |
| createProductUnit | Promise<Unit> | createUnit 201 → Unit | 返回声明已修 |
| updateProductUnit | Promise<Unit> | updateUnit 200 → Unit | 返回声明已修 |
| recordOpeningBalance | Promise<CustomerBalance> | recordOpeningBalance 201 → CustomerBalance | 返回声明已修 |
| deleteCustomerPriceRule | 必填query:{expectedVersion:number}参数，并把query传给request；继续接受幂等键 | deletePriceRule要求expectedVersion查询参数及幂等头，成功204 | 版本参数入口及序列化已修 |

因此，本报告第三段识别的四处封装P2在**源码/契约层已关闭**，不再列为当前未修问题。实际调用者传递正确版本、真实删除/期初响应与浏览器联调尚需后续稳定验收，不能据此宣称整个前端通过。没有运行全工程TSX、没有修改前端或测试、没有记录凭据。

## 2026-11-11 A10仓库/库存汇总分页独立定向复核

仅复核新交付的三个函数及新增相关测试；未运行全局typecheck/build/test、GUI或业务API，未改前端/测试或重启服务。

- `listWarehouses(query?:{q?:string;cursor?:string;limit?:number}):Promise<WarehousePage>`与GET `/api/v1/warehouses`一致；query原样交给request，响应保留items/nextCursor/asOf。无参数和现有`.items`调用保持兼容，没有被改成数组。
- `getStockBalances(query?:{warehouseId?:string;productId?:string;cursor?:string;limit?:number}):Promise<StockBalancePage>`与GET `/api/v1/inventory/balances`一致，两个过滤和游标/页长都有入口。两个Page来自已有共享Schemas别名，未手写窄响应。
- `listAllWarehouses(query?:{q?:string}):Promise<Warehouse[]>`实际调用生产listWarehouses，每页固定合法limit=100，保留q、传下一cursor，直到nextCursor=null才返回合并数组；这是另增方法，未改变原listWarehouses返回形状。

**非作者定向运行结果：** `node --import tsx --test --test-name-pattern='Shared API Pagination Wrappers' apps/web/test/agent-a-workflow.test.ts`，exit0、2/2通过。质量边界：case9只导入生产client断言函数存在；case10在测试内部复制paginateHelper循环，用mockPages自证，**没有调用生产listAllWarehouses**，不证明真实循环/HTTP query。

为补足本次验收证据，本代理另在临时Node进程中直接import上述生产三个函数，仅替换global fetch为内存HTTP响应，未写任何测试文件、未请求真实网络。实际验证：仓库q/不透明cursor（含+/=）/limit序列化、库存warehouseId/productId/cursor/limit序列化、两Page保留nextCursor/asOf；真实listAllWarehouses跨2页返回2个仓库、第二页沿cursor且q不丢、limit=100、null后停止，全部断言通过。它验证生产wrapper，不冒充真实后端联调或浏览器通过。

**结论：无新增wrapper阻挡，B/D可以接入完整Page或显式listAllWarehouses。** 注意listAll返回数组，不能继续读`.items`；原listWarehouses继续返回Page，不能把Page直接setWarehouses。各owner仍须实际接入续页/全量加载及过滤隔离、移除暂时as any，不能仅本次共享封装通过就勾页面任务。作者所称“全局77绿”和当前其它组施工类型错误不在本轮结论内。
