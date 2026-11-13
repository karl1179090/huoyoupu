# 14.3全栈部署与11.3角色导航独立验收

2026-11-11。非作者只读核查最终执行记录、原始TAP、源码/归档hash及当前测试断言。没有重新启动库/服务、运行browser/API/业务测试、占用dev/GUI或修改实现。本轮只做文件hash/JSON/tar读取自检与OpenSpec状态校验。

**结论：14.3新全栈路径已具备任务要求证据，可完成；11.3网页角色/会话亦可据下述组合证据完成。** 不代表公网生产上线、最终视觉、安卓真机或针式纸面通过；11.1、14.2、14.4、14.5等未验项不随之完成。

## 14.3证据链

| 要求/交叉核查 | 独立结果与完整依据 |
| --- | --- |
| 双镜像真实构建、迁移及部署命令 | [fullstack-container.md](fullstack-container.md)记录Mini Docker Linux/arm64实际runtime/web build exit0、compose健康、001–008迁移/初始化；初API镜像4aa7…5500d与web f793…c2d1c8，v2仅web变8a3b…7066d5a。结合[部署说明](../../deployment.md)、Dockerfile、Compose/Caddy既有只读复核，非只做YAML推断 |
| 源输入范围 | [初版manifest](fullstack-source-manifest.json)145文件与[v2 manifest](fullstack-source-manifest-v2.json)162文件逐项比较：共同生产输入仅App、navigation、CustomerFinance、OrderPrintPreview、printing.css五项变化；17新增均为测试/NOTES，无删除，无后端/lock/infra差异。对当前v2生产输入逐文件SHA256自检drift=[]。不把初版镜像当已含后续修复 |
| 最终测试确切版本 | [版本JSON](deployment-smoke-ledger-version.json)的[两文件tar](deployment-smoke-ledger-fixture.tar.gz)实际SHA256为17e23e0333ffc5e77cd7ed81ca6920cb4686a38743c194fee592d97f4f3e52f1；独立读取tar仅test/NOTES，内部两hash与版本记录、当前源码一致。最终改动仅测试目标/settings→既有真实ledger来源，不新增产品路由或放松403 |
| 严格TLS边界 | 报告记Mac/Mini curl显式CA及OpenSSL无SNI链/IP SAN校验成功；不支持verify_ip的旧LibreSSL失败后用既有OpenSSL，未跳验证。首轮无pin/错误pin各自独立browser只接受明确ERR_CERT、正确叶pin200；v2叶已变化，严格CA/IP再验证后重算pin。浏览器pin是此进程已认证叶的限定例外，**不是系统CA信任或公网ACME**；没有全局ignoreTLS/ignoreHTTPSErrors |
| 构建资源 | [结构化证据](fullstack-fixture-evidence.json)保存v2 index/js/css hash及MIME/200、缺assets404；与v2 web rebuild记录对应。首次前三段3/3、v2新静态成功、最终业务1/1是分次证据，**不是同一次默认4/4** |
| 最终第4段实际通过 | [原始脱敏TAP](fullstack-browser-ledger-final.tap.txt)确为1pass、0fail/skip/cancel，总10316.328583ms；当前版本test正文没有把业务主体放进可绕过if。旧revision真实GET/只读、批次GET两query/目标payload+DOM、admin→employee→403→orders→admin、0reload、限定窗口0customers/ledger/balance/cash/statements/company/template/users请求、末尾forbiddenWrites.length===0均在测试成功返回前执行，非“只前半过” |
| 失败历史保留 | 第一段约913.95秒失败、[v2 1pass1fail TAP](fullstack-browser-v2.tap.txt)仍保留；最终真实ledger通过覆盖旧/settings未知来源失败。没有把超时算TLS拒绝或将历史失败擦掉 |
| 备份恢复合法复用 | [旧API容器记录](deployment-container.md)与[原非作者审查](deployment-independent.md)有47 BASE TABLE逐行摘要恢复/库存8瓶成本16/净余额-2、恢复切库与迁移失败闸门，非58张表。当前v1→v2 API镜像、数据库迁移/备份脚本未改，仅web重建，复用此历史数据库恢复证据合理。**不声称旧恢复API镜像0765…6069a与新4aa7…5500d是同digest**，也不称本次又跑恢复 |
| 隔离和收尾 | 实例独有项目/端口，虚构夹具，无真实资料；最终finally关闭浏览器后四服务均stop，不down/删共享cache。0700私有目录及0600凭据/卷保留续验，结构化证据只有虚构ID/数值，无密码或会话。私有内容未由本代理读取 |

原任务要求隔离验证和Linux生产运行说明，不要求此次立即发布公网生产。真实域名/DNS/ACME、独立Linux宿主管理/持久化容量与运营备份保留仍需按[部署说明](../../deployment.md)落实；这不把已完成隔离交付重新改成未执行。当前目标规模/期初/设备和整体差异各按原任务保留。

## 11.3独立判定

- 当前修复的[本机真实A E2E日志](frontend-targeted-a-e2e.log)与[定向报告](frontend-targeted-result.md)明确test1员工管理来源可见403通过、test3无刷新Admin→Employee→Admin通过；该文件整体5pass1fail仍如实保留，失败是新增footer前置被modal阻挡，**与已执行通过的角色/CSRF用例不同**，不把整文件写全绿。
- 以上Mini最终测试又在真实HTTPS构建包执行管理来源拒绝、零相关管理API和零reload，员工订单/打印入口可见；后端角色响应/拒绝与CSRF已有独立验收。无需通过改测试降低门槛。
- [既有手机有界GUI](frontend-browser-review.md#有界113员工gui-smokea11等仍施工)实际400×662员工仅订单/打印导航、Cmd+R会话恢复、所看订单无写入口/成本，电脑当前角色实测与它共同支持网页双端同权限。旧手机退出后换号问题后来由真实无刷新E2E关闭；不因旧历史打印施工空白否认当前权限与会话证据，打印完整功能仍另验。
- 11.3勾选仅代表网页登录/恢复/角色导航/CSRF与拒绝提示，**不是安卓真机、整页最终视觉或全部打印完成**。不把它联动完成12.*或11.1。

## 任务状态更新范围

按刷新后的apply sourcePath/line，只允许11.3及14.3两个checkbox由[ ]→[x]；其余54项状态/文字应完全不变。更新前41/56，预计更新后43/56、剩13；实际结果以下方校验记录为准。不归档、不commit。

实际更新：apply刷新为 **43/56完成、13待完成**。与更新前完整56项快照比较，仅id40（11.3）和id54（14.3）done由false变true，其余54项及全部描述不变。`openspec validate build-web-inventory-v1 --strict`实际通过。本次没有重跑浏览器或启动服务。

## 其余四项的最小未闭证据

不要求重复全部分支，但任务明确要求的页面路径仍须有实际执行证据：

| 任务 | 有效证据保留 | 最少剩余，当前不勾 |
| --- | --- | --- |
| 12.1 | Catalog5/5、500mljy检索/人工校正、单位条码/地址/专属价编辑和移动表单；历史建议/手填保护；后端价格优先级 | 页面历史价来源点击落准确订单/版本；商品或客户停用。仓库停用不替代后者，不重做全CRUD |
| 12.2 | 仓库/批次接线和分页；真实GUI raw1.5拒绝、盘盈成本空阻断；后端守恒/并发 | 页面入库补录上海时间及实际成本、旧盘点快照提示/重建；此次GUI只生成draft，未确认盘盈，不写成过账已验 |
| 12.7 | 新PDF独立逐页核查241×93/A4/A5、长短分页/表头/金额/上海时间；GUI原生打印取消仍requested、人工取消/新job重打/人工确认；手机预览 | 页面四配置编辑保存并改变预览；选旧revision及旧模板版本重打。物理针打另属14.2，不以它阻挡本软件任务 |
| 13.3 | 合法fixture实际候选c1续答绑定原question/id、条件/表格/双端截图、同report短码复核（生产GET原snapshot）、真实503清旧答案/普通查询 | AI结果来源按钮实际点击至准确实体/版本。Mini ledger403已证权限接线，但不是AI来源点击；仅补一条，不要求所有澄清/race或真实外部provider |

依据：[定向执行/PDF](frontend-targeted-result.md)、[capture实际分支](frontend-capture-result.md)、[最新打印与盘点GUI](frontend-browser-review.md#2026-11-11-22时有界gui打印调用与盘点输入)。12.3–12.6等A18/B8及GUI，不联动勾选；11.1/14.2/14.4/14.5保持待完成。

## 11.3新增打印预览缺口，精确重开（2026-11-12）

覆盖上文11.3整体完成判断：新打印分页源审发现OrderPrintPreview加载时无isAdmin分支，员工也会调用管理员模板列表；Promise.all失败还阻止订单版本列表落地，模板版本请求同样没有role guard。原文明确“员工不能……触发被禁接口”，故仅导航403/CSRF通过不足以继续勾整项。这是before源码已存在、本次发现的覆盖缺口，不伪称分页新增回归。

旧电脑/手机导航限制、来源403零管理请求、会话恢复、无刷新换号/CSRF及Mini所测ledger权限证据全部保留，不因新打印路径推翻。14.3及v3部署证据不重开，前端修复后的最新双镜像另按最终冻结范围构建。

按协调者授权只将apply id40/tasks80行11.3由[x]→[ ]；strict实际通过，刷新为**45/56完成、11待验**。56项完整比较仅该done变化，描述及其余55项不变。待两打印组件内role/异步选择修复及独立员工preview真实context证明**0 templates/versions GET、默认print-data200、员工无成本投影**后才能恢复；本次未运行runtime/GUI或改spec/前端。

## C真实验证后的逐项恢复与完成（2026-11-12）

非作者只读核[完整C独立报告](frontend-c-independent-result.md)、[原始TAP](frontend-c-independent-final.log)及已审测试：4pass/0fail/0skip，10386.220542ms；54文件冻结清单当前亦无drift。本代理没有另跑runtime。

- **11.3恢复：**员工独立context真登录，监听全部含/print-templates的request而非只200，预览管理请求0、无templateVersionId默认print-data200，OrderPublic/PrintData/PrintConfig校验及sheet/JSON无成本毛利。加旧电脑/400仿真角色导航/恢复/CSRF实测，精确重开的打印路径已补齐。
- **12.7完成：**真实四配置发布201与逐项回读；独立确认后改单的订单old revision非当前，old template UUID与新发布不同，真实print-data双旧UUID/config/@page均匹配旧serverVersion；生产job handler真实POST双旧UUID/requested、UI取消user_cancelled。结合此前合法241×93/A4/A5短长PDF逐页核、重复表头/长名、手机预览及原生打印窗口/人工状态，不再要求重复已证路径。headless window.print stub不是物理出纸，设备仍14.2。
- **13.3完成：**合法共享schema澄清/回答夹具引用真实report/sources，页面自由续答原question与完整clarificationRunId；复核完整report.id GET且新query POST0，来源按钮真实精确order/revision GET并落只读页。旧双端条件/表格截图、候选c1和真实503清旧答案/普通查询保留；本轮503为route模拟，与旧真实503明确区分。不是外部provider质量/费用已验。

case1b只实际证明控制A真实versions迟到后B配置/选择未变；未展开历史，regex也不能可靠证明版本列表未串。该边界保留，源guard已有只读证据，不将额外race场景设为11.3/12.7/13.3原文新门槛；最小补强另列报表指南。

三项分别独立快照、精确checkbox与strict/apply：11.3 id40第80行46→47；12.7 id47第90行47→48；13.3 id51第97行48→49。**每一步前后完整56项比较均仅对应done变化，描述/其余55项不变，各strict实际通过。最终49/56、7待验**；12.8仍未勾，14.3不重开，11.1/14.2/14.4/14.5不联动。
