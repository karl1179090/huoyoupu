# 最终C打印/报表/权限页面独立验收

2026-11-12。外部Ctest写者自然停止后，非作者验收子代理固定[最终source/C/A/B/D/config 54文件](frontend-c-final-baseline.json)。本轮开始结束0漂移。只执行类型检查与完整C单文件一次，没有改前端/测试/任务、没有GUI或并行runtime；结束已明确通知协调者可开启下一唯一A实现自测。

| 实际根目录命令 | 实际结果 |
| --- | --- |
| `npm run typecheck:web` | exit0，[日志](frontend-c-final-typecheck.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/printing-reports-browser.test.ts` | **exit0，4pass/0fail/0skip/0cancel，10.4秒**，[完整日志](frontend-c-independent-final.log) |

没有重复build/pure5；其最终同源码门槛证据见frontend-c-loaders-ab-result.md末节和frontend-c-guards日志，不把作者4/4代替本轮独立4/4。

## 1. 四配置真实保存与两个真实旧UUID的软件打印

独立context与非默认模板，不改公司/全局默认。真实页面编辑并POST新模板版本201，服务端GET版本核：A5/landscape/边距6、companyAddress加入且恰一次、第一列宽36、最小行高12。全游标核默认模板唯一且原id不变。

独立确认订单已先更正为新revision；选择的oldRevisionId明确与currentRevisionId不同，oldTemplateVersionId也与新发布版本不同，而且旧纸型确实不同于新A5。真实getPrintData同时请求两个旧UUID，响应config逐项对照**oldServerVersion.config**，页面@page纸型/方向/边距也按旧配置，不把新A5预期硬套旧A4。

点击生产“调起打印机”handler，真实POST print-jobs；用production parseSchema核请求orderRevisionId=旧订单revision、templateVersionId=旧模板version，响应requested且同两UUID。再真实UI“取消出纸”，PATCH状态200、user_cancelled。

**边界：headless中仅window.print对话框被stub为空函数**，job API和页面handler是真实的；这不是原生打印窗口或物理出纸。此前CU原生对话框取消、合法241×93/A4/A5 PDF及长单产物证据继续保留，本轮没有重做/重新声称实物纸面。

## 1b. 管理员A→B受控迟到versions

另一个独立context。读取真实服务端A/B模板/versions，控制A版本响应迟到；真实UI选择B后先核B配置，释放A后仍保持B纸型/B名称，A的v2未串到B名下。route用于控制真实A响应到达顺序，不是将任意合成模板冒作后端事实。

此case证明指定成功迟到版本路径；没有因此把所有网络失败/race组合称穷举通过。最后guard的source审查由contracts另留记录。

## 2. AI自由澄清、完整同run GET与真实来源落点

独立context，真实POST reports/query和GET sources准备report事实，必须有真实order来源；clarification与answered夹具均过production parseSchema('AiResult')。实际页面输入原问题→自由文本续答，捕获发送原question、精确clarificationRunId、完整freeTextReply绑定。

answered后实际点击普通报表复核，捕获真实GET report-runs/{完整id}200，响应完整id等于准备的realReport.id；从点击监测起POST /reports/query计数0，不只是UUID短码可见。打开依据来源，点击精确order/revision href，真实GET对应revision200，页面目标订单/历史版本banner与返回当前入口均出现，未落默认订单页。

503降级这轮是**route.fulfill模拟AI_PROVIDER_UNAVAILABLE 503**，实际UI显示未配置/固定业务报表入口；不能写成真实provider不可用探针，也未以此case单独证明同一页旧答案所有失序清除。AI摘要与澄清为合法受控fixture+真实report/sources，并非真实AI provider质量/费用验收。原独立后端AI边界及旧真实503证据分别保留。

## 3. 员工默认打印权限与投影

又一独立employee context，真实页面进入该确认订单打印：捕获GET default print-data200，请求不含templateVersionId参数；parseSchema PrintData/OrderPublic/PrintConfig通过，返回默认模板版本存在且isCurrentOrderRevision=true。

挂载后额外等待800ms，监听所有包含`/print-templates`的请求为0；模板配置按钮和模板sidebar均不存在。可打印sheet无成本/毛利，完整PrintData JSON无成本/毛利/进价以及unitCost/costPrice/grossMargin键。不是仅隐藏按钮或只看纯函数，真实员工请求链已实际运行。

## 交付边界

四case全部独立context并finally关闭，0skip，无因前case弹窗遗留误伤后case；before合法模板/全页默认检查均已实际通过。当前没有新增净截图/capture/PDF，此报告不伪造新产物路径。B10/10、D7/7及独立GUI已过路径保留；A旧5/7由下一唯一写者校准真实DOM后另验。没有以C4/4自动勾任务，最终视觉、安卓实机、针式实物纸面、期初等仍按实际依赖。
