# A17 / B7 / C短纸修复定向独立验证

2026-11-11，22:01起。本轮不改前端、测试或任务checkbox；localhost仅一个验证进程串行执行，GUI仍归协调者。A/B生产及测试已停、C生产已停；Ccapture等协调者明确停写后才执行。私有凭据只由既有脚本读取，不输出。

[基线与结束哈希](frontend-targeted-baseline.json)：五个受影响App/A测试/B页面/B测试/PrintPreview文件短间隔及结束均无变化；另保存Ccapture/printing.css最终hash及mtime。不是全仓源码freeze证明。A第一次工具调用输出在上下文切换丢失，确认无进程后有日志重跑一次；第一次exit/count未知，不猜通过。

## 实际命令与结果

| 根目录命令 | exit / 实际结果 |
| --- | --- |
| `npm run typecheck:web` | 0 |
| `npm run build:web` | 0；70 modules、CSS20.93kB/gzip4.53、JS655.52kB/gzip159.54；单chunk>500kB是warning |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-workflow.test.ts apps/web/test/batch-session-regression.test.ts` | 0；31/31、15suites、0fail/skip/cancel。pure/controller，不泛称真实页面行为 |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | **1；5pass/1fail/0skip**，[日志](frontend-targeted-a-e2e.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/inventory-finance-browser.test.ts` | **1；6pass/4fail/0skip**，[日志](frontend-targeted-b-browser.log) |
| `node --import tsx apps/web/test/printing-reports-capture.ts` | 0；pageerror0，[日志](frontend-targeted-c-capture.log) |

旧API/Catalog/后端不重复；没有执行deployment入口。A/B失败后经协调者授权继续互不依赖的B/C，未启动源修，均完成teardown，无验证进程遗留。

## A：旧权限缺口真实关闭，新footer证据被测试前置阻断

本轮test1实际employee登录默认订单、管理来源明确403且无管理API通过；test3无刷新Admin→Employee→Admin通过，保留CSRF已关闭事实。test2与setup/teardown也通过。

新增test4在 `agent-a-e2e-regression.test.ts:264` 点击底层“批量选择商品/添加商品”30秒超时，`.modal-overlay`拦截。前置:256查`.customer-card-hover`，但当前CustomerPickerModal客户列表:180起无此class；else仅点确认，没有实际选客户卡及有效地址，更没有等modal关闭。生产确认仍做联系人/地址校验，不能强行穿透overlay。

最小修正：作者用真实客户/地址控件选定有效fixture并明确等待客户modal关闭，再继续实际picker/quote/footer。使用独立可控库存；清理条件性Edit if跳过，补实际400手机Create/Detail/Edit与长单不遮内容。当前只证测试前置/locator不可靠，**未进入后续footer断言，不判底栏产品失败，也不判通过**。测试生成的早期/旧图片不能冒称本轮完整footer通过截图。

## B：失败的最小纠正目标

原test1–4实际再次通过：丢响应重放key与payload、输入改变换key、盘点confirm重试跳过PATCH、月结scope/signed。新增test8真实旧新月结stale通过，test10延迟客户列表与Statement上下文通过。以下四项不以纯测试绿代替页面验收：

| 失败 | 实际位置/证据 | 有界定位与作者要求 |
| --- | --- | --- |
| 5 人工多单核销 | :400，POST `/orders`期待201实际404，7ms即终止 | 新客户:49–69只建客户无地址；订单:385起无addressId或deliverySnapshot。后端catalog/service.ts:162–170无有效默认地址会404，`/orders`本身是合法端点。为独立客户建有效地址或传明确合法配送快照；保存失败响应标准错误以区分fixture与产品；receipt前置还须核返回/确认成功，不能忽略fetch结果。人工核销UI尚未进入 |
| 6 余额应用 | :526等“登记收款”30秒超时 | test6直接假定test5已导航至客户往来。5在建债单时提前失败，页面仍是test4的Statements，故前置依赖未满足。每项独立导航/选择目标客户并创建/核实自己的债单和余额，勿依赖上项成功 |
| 7 来源退款 | :637 `.fin-card:has-text("¥200.00")`5秒超时 | 当前生产:716起为`.fin-stat-card`，没有.fin-card；后面150断言同错。改为真实语义卡/当前DOM定位，再运行退款交互与后端返回验证。尚未提交退款，不称来源退款成功或产品失败 |
| 9 第三页账簿定位 | :833等`tr.fin-target-highlight`8秒超时 | 当前生产:803只有`id=ledger-entry-${entry.id}`与inline outline，无此class。用真实row id并断言高亮/完整页请求和定位结束；fixture还用了amountSigned，生产LedgerEntry使用amount，须按契约构造，不能为了虚构class改生产。此超时不能证明生产跨页effect失败 |

第5响应body未保存，404业务原因由当前请求与后端确定路径定位，未伪称已抓到其body。第9初始href与owner props传递不是本轮新缺口；实际分页/高亮完整通过仍待纠正测试后的运行。

## C：实际PDF修复验证

旧10产物先归档[before manifest](targeted-capture-before/manifest.json)；本轮产物固定[after manifest](targeted-capture-after/manifest.json)，含实际mtime/sha256。独立使用pdfplumber逐页MediaBox/文本抽取，Poppler渲染并view短纸、长纸两页、A4长两页、A4/A5短；不是只读脚本CSS/页数正则。逐页全文与结果见 [pdf-inspection.json](targeted-capture-after/pdf-inspection.json)。

| PDF | 实测mm / 页数 | 逐页结论 |
| --- | --- | --- |
| needle-241x93 / custom同内容别名 | 240.961×93.133 / **1页** | 两商品、八列表头、20.00应收、经办/配送/签收同页，未见裁切；旧合计孤页缺口在该样例关闭 |
| needle-multipage | 同纸型 / 2页 | 第一页1–3行，第二页4–8行；长名完整、每页八表头、金额5780.00唯一并与行自洽，签名保留 |
| A4短 | 209.889×297.011 / 1页 | 两行及20.00合计/签名完整 |
| A5横短 | 209.889×148.167 / 1页 | 方向/行/20.00合计/签名完整 |
| A4长 | A4 / 2页 | 28行标号完整、每页六表头，98700.00应收只在末页，未见跨页半行裁切 |

本轮capture真实PrintData的confirmedAt=`2026-11-11T03:28:47.500Z`，生产页面与本轮PDF显示 `2026-11-11 11:28:47`，Shanghai少8小时缺口关闭。脚本动态取本次PrintData并比较Shanghai；页对象解析失败不再fallback1。短纸[PDF](targeted-capture-after/order-print-output-needle-241x93.pdf)/[渲染](targeted-capture-after/needle-short-1.png)可复核。仍只是browser PDF，不是241×93连续纸实物进纸/清晰度验收。

AI本轮脚本实际生产parseSchema合法fixture、候选点击续答、同report短码复核、真实503清旧答案均执行成功，日志保存；不等于真实provider质量或全部乱序竞态。未新增无关全图审查。新长单仍是自洽布局fixture，不冒称后台真实创建28/8行订单。

## 本轮边界

A/B待作者只修上述前置/locator/契约fixture后定向再验；源产品问题没有因测试错误自动新增或豁免。C本轮短纸/时区产物达到所测限定预期，保留A4/A5；不据此关闭整体打印/真实设备任务。无前端task checkbox变更，41/56不变；最终视觉、安卓真机、针式实纸、期初和Mini部署按各自后续证据。全局构建成功与局部browser失败分别记录。

## A18仅测试修复后的单文件独立复验

2026-11-11，GUI交还root后，协调者确认A18停写，只改测试/NOTES。按要求不重复types/build/pure或Ccapture。

实际命令：`node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts`，**exit1；4pass/2fail/0skip，6.1秒**。[完整脱敏日志](frontend-a18-e2e.log)，[A18开始SHA256](frontend-a18-baseline.sha256)四文件结束`shasum -c`全OK。

- setup test0在:29调用Node中的生产`api.ensureSessionChallenge(true)`，生产client.ts:183执行相对`fetch('/api/v1/auth/session')`，Node缺浏览器origin，实际`ERR_INVALID_URL`；fixture客户/地址/商品/草稿尚未建立。
- test4在:372读取未定义`fixtureCustomer.name`失败，属于同一前置失败的后果，不是底部布局产品错误。未到选客/quote/footer分支，没有新的footer截图成功证据。
- 原employee默认与明确403/0管理请求、test2、无刷新Admin→Employee→Admin仍真实通过；teardown成功，无运行进程遗留。

作者最小修正：仅在测试fixture层使用明确API origin和正确cookie/CSRF认证（沿既有真实API fixture方式），不要为Node测试特殊化生产client；setup失败必须阻断依赖分支。当前入库fixture还`catch`吞失败，不能将它当“独立有库存已保证”，需核真实成功或给明确已存在库存证据。修改后单文件重跑即可，不重复本轮无变化production的构建/C PDF。

B8当时仍写测试，NOTES末尾通用“源码收尾完成”是旧状态，不足以证明B8停写，因此没有抢跑B；待协调者正式交付通知后继续串行。

## A20生产修复与B8测试修复：本轮独立串行结果

2026-11-11约22:35起。协调者已确认A20/B8交付停写，后端quote source metadata新实现已在3000运行；C/D此时只写其独立新test，未参与本轮。固定[src+A/B tests+build config 52文件基线](frontend-a20-baseline.json)，结束均无hash漂移。不操作GUI，不写前端/测试/checkbox；本轮只一个localhost验证进程。

| 实际根目录命令 | exit / 结果 |
| --- | --- |
| `npm run typecheck:web` | 0；[日志](frontend-a20-typecheck.log) |
| `npm run build:web` | 0；70modules，CSS20.93kB/gzip4.53，JS659.22kB/gzip160.30，单chunk warning；[日志](frontend-a20-build.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-workflow.test.ts apps/web/test/batch-session-regression.test.ts` | 0；32pass/15suites/0skip，含新增首退量helper测试；[日志](frontend-a20-pure.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts` | **1；5pass/2fail/0skip，7项**；[日志](frontend-a20-e2e.log) |
| `node --import tsx --test --test-concurrency=1 apps/web/test/inventory-finance-browser.test.ts` | **1；7pass/3fail/0skip，10项**；[日志](frontend-b8-browser.log) |

A setup此次已真实通过Node认证和fixture准备，原ERR_INVALID_URL缺口关闭。员工默认/明确403且0管理请求、原test2、无刷新换号、teardown均过；原保护徽章已真实显示。新增两个失败：

- test4 :640 使用 `.modal-body text=北京市海淀区科技大厦A座801室`，混CSS与text引擎语法，Playwright明确Unexpected token '='；未进入picker/quote/footer，不据此判断布局产品失败。作者需用合法locator链定位当前fixture地址，保真实选客/关闭modal。
- test5 :876 等“已退3瓶(只读)”后立即`protectedSubtotal.first().isVisible()`断言6.00，实际false。它没有等当前异步quote成功/按钮就绪。生产Edit :277先setLines、:281结束loading、:405定时quote、:430才apply，因此保护行先于报价出现是当前确定的时序。生产已在:631传calculatedLine，并按sourceLineId/readOnly关联，不再是旧省prop问题。最小修正是等待当前有效quote及真实可见desktop金额（避免隐藏双端DOM），再断言；若等待后仍失败才定产品。此次没运行到价格更正/提交后的后续断言，不以pure32替代GUI金额证据。

A test2仍生成其既有历史/改单截图；新增test4/test5在前置失败，**没有本轮footer/首退提交成功新截图**，不冒称已有400/350/长单覆盖通过。

B原1–4、真实stale8、受控第三页定位9、延迟客户/Statement10全部通过。第三页旧虚构class/amountSigned夹具的失败在本轮指定测试已关闭。3个失败：

- test5 :495、test6 :613 在资金modal打开之前等`text="完整orderNo"`可见而8秒超时。当前主往来账簿不展示完整订单号，只有人工收款/余额应用modal里的options显示（CustomerFinancePage.tsx:1029/:1199），且文本带“单号: … (应收…)”。作者应先打开相应modal、等待真实订单options并按orderId选择，不能把API建单成功误当主页面必有订单号文本。后续核销提交尚未执行，不能称人工多单/余额应用已验通过或产品失败。
- test7 :755 在退款提交后modal成功关闭，但5秒等“退款成功登记！”超时。**生产反馈文案P2**：CustomerFinancePage.tsx:441–448对任何res.kind都前缀“收款成功登记！”，refund只在后缀说“实退资金已按服务端规则冲减对应资金来源”。需要作者按res.kind使用正确收款/退款成功前缀；不能仅改测试接受错文案来豁免。modal关闭位于API成功分支，当前并无退款API失败证据；test7后续payload/150余额断言尚未执行，需修后定向补证。

本轮运行均已结束，A/B未并行、无残留验证进程；立即报告失败后继续了独立B。旧C PDF、原GUI退改返库91瓶/成本91/净应收27、打印/盘点GUI证据保留，不为总绿重复。C/D新文件等明确交付后另串行，不纳入本轮绿数。未改任何任务状态。
