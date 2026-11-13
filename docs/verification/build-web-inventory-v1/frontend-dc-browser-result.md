# D资料 / C打印报表新增页面验收：独立运行结果

2026-11-11。协调者正式确认D/C交付停写且无browser后台后，按D→C顺序各执行一次；无并行、未重跑types/build/pure/旧PDF/后台。没有改前端、前端测试或checkbox。两文件[开始哈希](frontend-dc-baseline.sha256)结束`shasum -c`全OK，运行结束无残留验证进程。production冻结期间，协调者未派源修。

| 根目录实际命令 | 实际结果 |
| --- | --- |
| `node --import tsx --test --test-concurrency=1 apps/web/test/catalog-browser.test.ts` | **exit1，5pass/2fail/0skip，7项**；[日志](frontend-d-final-browser.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/printing-reports-browser.test.ts` | **exit1，0pass/0test fail/2cancel、suite before hook失败**；[日志](frontend-c-final-browser.log)。不得写成两项业务断言失败或通过 |

## D实际已证与前置阻断

原setup、商品搜索/单位/助记码/条码真实UI、客户地址/价格规则真实UI、仓库搜索分页/编辑/停用真实UI、teardown通过，约21.5秒。新增历史价来源test4和停用旧引用test5均未进入目标UI分支：

- test4 :479真实POST `/receipts`返回409而非201。请求仓来自:448 `/warehouses?limit=5`，:452 `find(active) || items[0]`。独立只读同GET确认HTTP200，首5条全部active=false且nextCursor存在；fallback确实选停用仓，不是入库生产缺陷。应自己创建独立active仓或穷举游标只选active，不依赖首页有可用仓。
- test5 :760读取`confirmedHistOrder.status`得到undefined，而前置receipt/order各返回状态没有逐步核对；同样从首5仓fallback。需对每步HTTP status/标准错误明确断言，不能把错误对象当业务单据继续确认。
- 两新增fixture还调用POST `/receipts/{id}/confirm`；现有契约只有POST `/receipts`即时入库确认，不存在该再次confirm接口。该步在test4尚未到，test5忽略结果。应删除虚构确认步骤并用真实Receipt结果，不改后端来迎合测试。

新增历史价用例计划的真实button点击→监听huoyoupu:navigate href精确orderId/revisionId→单独GET目标两个资源，当前均没执行到。即使未来该分支过，事件监听+独立GET也只证事件href和资源可读，不自动等于App最终落历史详情DOM；必须按实际分支保留这层边界。停用商品/客户后的旧引用读、新建阻断均待fixture修后真正运行。

## C实际before失败，页面场景均未开始

:88非默认模板setup POST `/print-templates`返回400而非201，before hook中断，两个子测试被cancel，尚未启动页面模板编辑或AI交互。payload :81–85含`isDefault:false`，而production `TemplateCreate`只有`name`和`config`。

为精确隔离，本代理仅临时调用已存在production `parseSchema('TemplateCreate', ...)`与`getDefaultPrintConfig()`：带isDefault得到“Value does not satisfy TemplateCreate”；同配置去isDefault通过。没有额外API写。这是非法跨契约fixture，**不是模板保存生产错误**。作者应只传name/config，创建默认就是非默认，不触碰公司/全局默认模板。

后续纸型/表头/列宽/行高真实页面保存、旧订单/模板版本选择、AI自由澄清/same完整run GET且无新POST、真实来源点击最终订单DOM，这一轮全部未执行；不能用作者描述或旧capture绿代替。源码中表头可选if和历史revision可选if的条件覆盖也应在实际重跑报告，不预先称四配置/旧版完整通过。AI采用合法fixture+真实report/sources，只能验证UI/契约/来源链，不等于真实provider配置或质量。

## 后续边界

两套修测试fixture后各自单文件再跑即可；没有因before失败推翻已过C合法241×93/A4/A5产物和GUI打印/盘点/退改返库守恒证据。A20/B8失败与原价继承P1另见frontend-targeted-result及协调者新source审查，不混入D/C前置错误。当前无新增截图成功证据、无前端任务状态变更。
