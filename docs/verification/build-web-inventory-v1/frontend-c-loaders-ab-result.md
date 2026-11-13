# C role/race门槛与A/B定向页面独立复验

2026-11-12约01:40起。全组production停写后固定[53文件src/A/B/config/newpure基线](frontend-c-loaders-ab-baseline.json)，Ctest未纳入冻结范围，允许唯一外部CLI改该test但不能运行。结束53文件无漂移。验收子代理不写前端、不GUI、不跑旧C browser或D/PDF/后端全套。

| 根目录实际命令 | 实际exit / 结果 |
| --- | --- |
| `npm run typecheck:web` | 0；[日志](frontend-c-loaders-typecheck.log) |
| `npm run build:web` | 0；70modules，JS661.19kB/gzip161.05，仅chunk warning；[日志](frontend-c-loaders-build.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/printing-loaders.test.ts` | 0；5pass/1suite/0skip；[日志](frontend-c-loaders-pure.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | **1；5pass/2fail/0skip**；[日志](frontend-ab-final-a.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/inventory-finance-browser.test.ts` | **0；10pass/0fail/0skip**；[日志](frontend-ab-final-b.log) |

前三门槛完成即通知协调者，随后A→B单进程；C写者无runtime gate。B完成teardown后已明确通知A/B全部结束，可开启C自测gate，本代理没有继续启动任何browser。没有把gate通知本身当C测试已通过。

## C门槛边界

printing-loaders 5项调用生产collectAllPages，覆盖游标穷举及单页不多请求。该pure本身不验证employee零模板请求、admin迟到versions隔离或真实UI模板选择；这些由新C browser在稳定交付后单独跑，不能由本轮type/build/5绿代替。D7/7及旧合法PDF产物保留，无需重复。

## A仍有两个测试自身阻断

旧员工默认/明确403且零管理请求、无刷新CSRF换号、setup/旧test2/teardown继续过。footer与首退改单新分支仍未跑完：

- test4 :701点击确认加入30秒disabled超时。真实按钮locator已修，但前面仍以`.picker-product-card`选择添加按钮，production没有该class；addCount=0时for可直接跳过，没有assert至少一个真实配置。空会话正确禁止加入，不是产品按钮故障。作者需用真实fixture搜索/商品卡添加、明确配置数/仓/价格后再确认。该同一test后续“商品明细列表”和input“整单备注信息”也与当前Create实际“订单商品明细”及运输备注textarea不符，应按同一生产路径一次校准，不能逐轮猜selector。
- test5已越过旧独立客户余额问题与价格输入，保护段6.00、余量27.00、总33.00、18→27账户预测的前置检查已走到。:947硬等`text=+9.00`30秒超时，production金额格式是`+¥9.00`，不是无币符连续文本。需按真实差额元素核BigInt分金额9.00，不能改生产金额格式只为旧断言。后续确认/新详情校验未执行，不写成该case业务全通过。

本轮没有新footer成功截图；旧其它截图不能冒作本轮400/350长单底栏完成。先前独立真实GUI已验证半分derived净0/lineChanges=[]等有限证据仍保留。

## B真实10/10与新产物

全部10项实际执行，0skip：

1. 资金提交服务端已记账但响应丢失，UI重试同key/相同冻结payload；输入修改换key。
2. 盘点两阶段确认丢响应后跳过PATCH安全重放；Statement客户scope/signed双符号回归。
3. 人工实收150真实UI分摊两订单100+50，捕获真实POST payload，页面成功反馈已手动分配2单。
4. 独立客户实收50未分配，真实页面余额应用30后未分配20；不是复用已有370余额假定从0。
5. 退款50真实UI提交，payload kind=refund且无receipt分配字段，余额200→150，正确退款成功提示；不代表物理现金/银行实际转账。
6. 旧月结stale与新快照保留、受控第三页账簿来源定位、延迟客户列表与Statement同步均跑过。后两项含route受控夹具，不等于全部失序race穷举。

新4张截图固定在[frontend-b-final-artifacts](frontend-b-final-artifacts/manifest.json)，包含source path/mtime/SHA256。本代理已view人工分摊、余额应用、退款和旧新月结：均是相应真实页面净图，非文件名误指销售页。它们是桌面headless1280×800，不是真安卓；截图只能证明当时页面，不替代请求断言或所有交互。

人工分摊截图同一客户带前两项实收150+220，故页面未分配370是其它独立来源保留；本次新150手动分配100+50并非把历史资金静默搬走。余额应用另用独立客户，截图未分配20与成功提示一致。退款截图显示实际退款台账+50、信用150；月结图同时保留旧stale及新有效两行，不能把变更后的快照覆盖旧行称通过。

本轮没有修改任务checkbox。B运行完成已交协调者/独立任务原文核验；全局最终视觉、真机、实物打印、期初等仍按原边界，不因10/10一并关闭。

## C末guard候选独立门槛（2026-11-12后续快照）

外部CLI因max-turns16退出1仅表示执行预算终止，不当功能测试失败；其两组件Edit落盘并停写后，本代理重新独立执行：`npm run typecheck:web` exit0、`npm run build:web` exit0、`node --import tsx --test --test-concurrency=1 apps/web/test/printing-loaders.test.ts` exit0（5pass/0fail/0skip）。日志为frontend-c-guards-{typecheck,build,pure}.log；JS661.61kB/gzip161.12、CSS20.93kB，单chunk警告仍非失败。

最终source/newpure/config/A/B/D共54文件固定frontend-c-guards-baseline.json，开始结束0漂移。没有跑A/B/D或旧C页面、没有GUI/前端修改。三门槛完成已立即通知协调者，无运行进程；employee默认零模板请求、受控迟到GET隔离等最终业务仍待新Ctest稳定后实际独立运行，不能由pure5或类型构建代替。B10/10与D7/7原证据保留。
