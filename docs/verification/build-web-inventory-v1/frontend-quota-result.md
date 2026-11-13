# 额度中断后的现存代码：独立串行验收

2026-11-11约23:13起。A21/D最后编辑因Gemini额度中断，未当完整交付。接收contracts只读hash/语法结论后，协调者确认全组停写，按门槛→pure→A→B→D→C每套一次。没有等待模型选择才推进，没有改前端/测试/checkbox或操作GUI。54个src/test/config[基线](frontend-quota-baseline.json)结束无漂移；无残留验证进程。

## 实际命令结果

| 根目录命令 | exit / 实际结果 / 日志 |
| --- | --- |
| `npm run typecheck:web` | 0，[日志](frontend-quota-typecheck.log) |
| `npm run build:web` | 0；70modules，JS659.28kB/gzip160.30，CSS20.93kB；仅单chunk warning，[日志](frontend-quota-build.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-workflow.test.ts apps/web/test/batch-session-regression.test.ts` | 0；32pass/15suites/0skip，[日志](frontend-quota-pure.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | **1；5pass/2fail/0skip**，[日志](frontend-quota-a.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/inventory-finance-browser.test.ts` | **1；8pass/2fail/0skip**，[日志](frontend-quota-b.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/catalog-browser.test.ts` | **1；5pass/2fail/0skip**，[日志](frontend-quota-d.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/printing-reports-browser.test.ts` | **1；before失败，0pass/0test fail/2cancel**，[日志](frontend-quota-c.log) |

不混加pure/API/browser为“全部场景通过”；旧C PDF/后端/设备GUI/退改返库守恒不重复。

## A：半成品状态未改变已知错误

A生产Edit SHA仍`bd795d58fc0d0f024eb8cf391c6188b8757218e50d50f7692b3cb8a42c81e061`，与A20一致；contracts已指出后续derived原价继承无条件发unitId/unitPrice P1尚在，纯测试32没有证明该业务已修。

A真实员工403/0管理请求、无刷新CSRF换号、旧test2与setup/teardown仍过。新test4 :640非法CSS/text混合selector仍报Unexpected token '='；test5 :876仍在保护badge出现后直接isVisible金额，未等quote，依旧false。没有A21新case，也没进入footer/首退后提交的后续断言，不能称额度中断编辑已交付或补齐截图。最小修复及生产P1按此前报告/源审，不新增推测。

## B：退款已过，人工核销/余额应用仍因测试前置失败

原1–4、退款7、stale8、第三页9、延迟客户10实际通过。test7这次已跑过成功提示、真实退款payload字段和150余额后续断言，旧退款成功文案缺口在所测路径关闭。

- test5 :507等`.modal-body option[value=目标orderId]`默认visible 8秒超时，日志明确该option**已存在但hidden**。原生select option不应当可见行等待，作者应等待attached/已含目标，再对select做selectOption并核选择值。不是后端未返回订单或页面缺订单。
- test6 :636等未分配总余额50.00超时。该测试继续复用test1/2客户；只读由本轮test5订单反查同客户，实际实收有150.00、220.00、50.00三笔且allocations=[]，unallocatedAmount=420.00。test1/2已真实记款，test6又存50却假定账户从0开始。需要独立客户/债单/资金fixture，或读取前余额按+50核对；不得清理前项记录凑零。该失败不证明生产漏记50，后续余额应用30未执行。

## D：来源业务路径已有新实证，错误cleanup使单项仍红

原产品/客户/仓库UI维护通过。test4新独立active仓和即时入库fixture已使其进入真实历史价来源路径：历史价18.50、按钮click、精确orderId/revisionId事件、目标订单与历史revision两次独立GET200均完成；随后截图确实保存。

本代理实际view固定[来源落点截图](quota-artifacts/customer-price-quote-history-source.png)：蓝色“历史版本只读快照 - 版本号#v2”、目标订单详情、18.50单价/37.00总额，已真正落到历史订单页；不是仅监听事件。截图[hash/mtime](quota-artifacts/manifest.json)已保留。最终:616还无条件找旧`.modal-content button:has-text("完成")`30秒超时，因为来源已导航卸载modal。作者应断言当前真实落点DOM并移除错误旧modal cleanup，不能改生产阻止导航来迎合测试。整test4仍exit失败，不据截图把它改绿。

test5已实际进入商品编辑/取消启用，但:795断言badge“已停用”失败；生产ProductListPage.tsx:429实际徽章文本是“停用”。需要按真实DOM与后台active=false核对。客户停用/旧引用/新单阻断后续尚未执行。test5仍残留首5仓inactive fallback、虚构receipts/:id/confirm和忽略前置HTTP状态，这次借test4新建仓进入了后续，不代表这些残留已修。

## C：合法创建已过，首50条默认定位是假失败

C新增TemplateCreate生产parse与去isDefault修复真实生效：before创建201且isDefault=false通过。随后:113只比较GET `/print-templates`首50条中的默认模板，新增一条改变第一页边界，使after find得到undefined，而不是原默认id。

本代理只读完整游标**2页/66模板**确认原默认id `d94a910f-7914-4f12-9f81-81dacb419869`仍存在、isDefault=true；首50无默认且nextCursor非空。**没有默认模板被新建覆盖的证据**，这是分页未遍历。作者应before/after穷举游标比较，不把首屏缺失当默认污染。

before因此中断，2个页面子测试cancel；四配置编辑/发布、旧模板/订单版本预览、AI自由澄清/full-run GET无新POST、来源按钮最终落点本轮全部未执行。不能用旧capture或合法AI fixture声明这些新交互完成；真实provider仍另待配置。

## 交接边界

本轮可执行验证已完成，所有日志保留。额度中断是后续修改的真实外部限制，未自行换模型/开付费；下一波由协调者获得用户模型方向后经Antigravity修上述源P1和测试，不由Codex代写。production构建成功、旧已证业务与当前未过分支分别保留，不关闭前端任务或最终视觉/实物设备/期初事项。
