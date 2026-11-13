# DeepSeek B/D/C与A2：文件级串行独立结果

2026-11-12。BCD外部CLI经协调者精确停单进程，属于保留修改的中止，不包装自然交付；其三test及production明确冻结后，本代理B→D→C各一次串行。同期唯一CLI只改A E2E，故[52文件冻结基线](frontend-deepseek-bdc-baseline.json)排除A测试，结束0漂移。随后A2明确自然停写，再[A2独立哈希](frontend-deepseek-a2-baseline.sha256)固定单文件运行一次，结束hash一致。没有运行全套通配/后台/旧PDF/GUI，也不改前端、测试、checkbox。

| 实际根目录命令 | exit / 结果 |
| --- | --- |
| `node --import tsx --test --test-concurrency=1 apps/web/test/inventory-finance-browser.test.ts` | **1；8pass/2fail/0skip**；[日志](frontend-deepseek-b.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/catalog-browser.test.ts` | **0；7pass/0fail/0skip**；[日志](frontend-deepseek-d.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/printing-reports-browser.test.ts` | **1；0pass/2fail/0cancel/0skip**；[日志](frontend-deepseek-c.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | **1；5pass/2fail/0skip**；[日志](frontend-deepseek-a2-e2e.log) |

## B：8项保留通过，两个新的测试locator/加载前置阻断

原1–4真实事件与响应丢失重试、退款7（payload/余额均到）、stale8、受控第三页9、延迟客户10再次通过。人工分摊和余额应用没有通过：

- test5 :517订单options attached已越过，但`.modal-body div[style*="grid-template-columns"] select`.first对orderId执行selectOption30秒，实际该泛祖先grid还包含资金方式select，首个select不是订单分摊select，日志“did not find some options”。应定位实际分摊行/订单select，不能只以通用CSS祖先有grid判断。实际分摊提交未执行，不归生产核销失败。
- test6 :655对客户下拉选择新balanceCust.id30秒找不到option。该客户为本test从后台新建，当前组件客户列表在此前已加载；未重载或通过initialCustomerId深链定位。应使页面自身重新载入/等目标客户真实可选，不能假定旧下拉自动得知后台新资料。未执行存50/余额应用30，不重复旧420余额错误结论（本版已改独立客户）。

## D：本轮7/7真实通过的范围

旧商品搜索、助记码覆盖清空、单位/条码、客户地址/专属价格与报价、仓库搜索/编辑/停用流程均执行通过。新增历史价与生命周期也实际完成：

- 历史成交价UI18.50及source order/revision；点击真实“查看来源订单”按钮，精确href事件正确；目标订单及历史revision单独GET200；最终实际DOM等到目标订单号、“历史版本只读快照”、对应revisionNo及返回当前入口，原价格modal已卸载。不是只有事件监听和API可读。
- 真实UI停用商品/客户，徽章按真实“停用”，GET商品/客户active=false；过去确认订单GET仍confirmed且保留原客户/商品；新订单同停用客户返回409 RELATED_RECORD_CONFLICT。该新建拒绝同时带停用商品和客户，先客户校验，不能凭这一条说“单独停用商品且客户有效”的新单拒绝也独立重测。
- 截图由脚本保存。手机响应式是headless视口，不是真安卓。原小数/异步价格race证据沿此前源审与其它测试，不把这7项自动扩成全部矩阵通过；最终12.1判定由协调者/独立规格核对。

## C：首次真正进入页面，但新模板不在首50不可达

before已完成合法TemplateCreate201、穷举所有模板确认默认不变、独立确认订单等准备。test1在:225断言新独立模板存在于TemplateManager失败（233ms）；本轮非before取消，两个test均实际启动。

有界只读核对本轮新模板`E2E测试独立非默认模板-446392`、id `f73ededc-5bf3-40c4-8f38-17e6d55ecd4d`：完整游标能读到，默认首50无此项。Production PrintTemplateManager.tsx:68和OrderPrintPreview.tsx:124均只调用listPrintTemplates()首屏，没有加载后页；因此本轮不是单纯等待不足，新建模板在后页实际不可选，属于全量可达P2缺口。不能换用别人的首屏模板或改全局默认掩盖。需要外部前端作者窄修列表分页完整可达，再用原独立模板验四配置/历史版本。

test2 :431在AI侧栏点击30秒被test1遗留modal遮挡，未发澄清/同id/source交互。需每个test独立恢复页面/隔离context，不能把该失败当AI业务坏或沿旧capture称通过。当前四配置保存、精确旧订单/模板版本、新AI自由文本/同完整run GET无新POST/真实来源落点均仍未由本文件证成。

## A2：修复越过旧位置，但尚未到目标提交

旧setup/员工403且0管理请求/CSRF无刷新换号/原test2/teardown通过。A2新标题和可见desktop价格输入修复已实际越过：

- test4 :660仍找`.modal-footer button:has-text("统一加入订单")`，当前生产按钮可见文字“确认加入订单(n行)”，统一加入订单是title/Help，不是可见text。故isVisible=false。应按真实按钮文字或accessible name定位，不改生产来满足旧文案。
- test5真实已到保护6.00、余量27.00、总33.00及账户预测标题，:912硬等“¥18.00 → ¥27.00”30秒超时。createTest4Fixtures同客户还确认了另一张4行×2×30=240订单，客户余额基线不是仅当前退货单18。应为退货case独立客户，或从该客户真实余额计算+9影响；按fixture可推算应包含额外240（预期258→267，未在本轮另抓该quote完整响应），不能将不匹配18→27当报价错误。后续确认/详情校验未执行。

没有新增footer成功截图或A test5提交成功图；不以GUI另一独立case通过掩盖本文件失败。此前真实GUI半分余量仅改头部lineChanges=[]/净0及手选不足补足quote200已证，仍按frontend-deepseek-a-result.md限定保留。

全部文件已运行到底并teardown，无残留browser/runtime进程。协调者可据精确失败集中派外部CLI修复，Codex不写前端。任务checkbox与最终视觉、真机、实物打印、期初等边界未改。
