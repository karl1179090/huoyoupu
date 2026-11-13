# Mini v5 实际隔离部署定向验收

2026-11-12。Root冻结Money最终production source并授权后，已实际切换v5专用Compose、验证严格HTTPS/静态产物与真实浏览器role/ledger流程，随后四服务全部安全stop。不是把build-only的v4/v5候选或旧v3结果当本次通过，也不代表真实生产发布/设备出纸或未完成的订单独验已经通过。

## 实际版本与保护范围

- [shipping manifest-v5](fullstack-source-manifest-v5.json)：146文件、archive SHA256 `7751eb00d09e6075a7251b9457d81752017693d4d72390743af40c9114433ab1`，Money helper及Create/Edit源修都在；tests/support/factory/凭据/env/截图/tsbuildinfo等均不shipping。启动前与smoke后逐文件SHA256均drift=[]。
- 独立后端/共享保护不是上面的shipping范围，也不是60文件frontend baseline。按Root给定的私有protected-before.json的**完整scope重新枚举**，90→90，新增/删除/修改均[]；见 [90文件核对](fullstack-v5-protected.json)。当前订单test的允许时序修订未算成production drift。
- `/tmp/huoyoupu-test-fullstack-2Sm3Fc3D/prepare-compose-v5.py`本次已执行，生成独占0600 compose.test-v5.json，api/migrate/initialize-admin与proxy image字段真实换成v5 tag。原v3解析JSON保留，没有只设env假切image。
- 实际docker inspect运行容器：api-1的Config.Image为`huoyoupu-test-fullstack-2sm3fc3d-api-v5`、Image为`sha256:396b979111706257521878430d13d52319df85be5219b5ddc5bae3bd11d48233`（未变API复用v3）；proxy-1的Config.Image为`huoyoupu-test-fullstack-2sm3fc3d-web-v5`、Image为`sha256:f9a7a0502b1a023ded7b93b906ea418c883c2c2eef33baf9508a1aa696082e71`。二者Linux/arm64，db/api健康、migrate exit0、compose up --wait exit0。
- 原隔离数据库/Caddy卷及虚构fixture复用，没有新seed、业务资料或dev API操作；唯一对外发布为私有IP192.0.2.10:49543，无生产80/443/public DNS。

## TLS 门槛（不是浏览器系统CA信任测试）

先curl --cacert公开测试root.crt得到health200；现有OpenSSL执行`-noservername -CAfile ... -verify_return_error -verify_ip 192.0.2.10`，链与IP SAN验证成功，SAN实际为192.0.2.10。然后从当前已验证的leaf重算Base64 SHA256 DER SPKI，不照搬上轮pin。Node只通过NODE_EXTRA_CA_CERTS加载公开CA，Edge只对本次leaf公钥在新的临时profile加入精确例外；不装系统根、不设置ignoreHTTPSErrors/全局ignore、不改PUBLIC_ORIGIN为HTTP。旧no/wrong-pin负向保留已有证据，本次未重复。

## 两项实际执行的测试，不能混称浏览器证据

真实执行既有`apps/web/test/deployment-browser-smoke.test.ts`，选择`Node fetch|Read-only Browser Smoke`，120秒总上限、test-concurrency1。结果 **2/2 pass、fail0、skip0、exit0，总3440.60475ms**；[原始脱敏TAP](fullstack-browser-v5.tap.txt)保留。

1. **`Node fetch HTTPS health, index HTML, hashed static assets & 404 missing asset probe`**（82.2465ms）：这是Node HTTP验证，没有操作浏览器。真实HTTPS GET health/index均200，index有React root；从index真实引用取JS/CSS并核200、MIME和非HTML响应；随机缺失assets返回404而非SPA壳。实际index及JS/CSS内容SHA256、大小/路径见 [结构化结果](fullstack-v5-result.json)，JS为本次构建`index-rmei_GfS.js`，不是源码Vite引用。
2. **`Read-only Browser Smoke: Auth lifecycle, deep linking, source resolution, and role gating`**（3078.0475ms）：这是实际本机Edge headless临时context，直接访问Mini HTTPS构建包，未用page.route/mock/替换API响应。真实匿名挑战→管理员表单登录；原生历史confirmed revision URL触发真实GET200和只读横幅/禁止动作；派发生产batch来源CustomEvent，核真实GET的product/warehouse参数、返回目标batch与DOM定位（这是event来源入口，不冒称点击报表来源行）。管理员退出→员工表单登录、订单打印入口可见；真实customer ledger SourceRef事件被403 gate拒绝，限定员工窗口内customers（含balance/ledger）、cash-events、statements、company、print-templates、users等受限API计数0；卸载该监听后返回订单、员工退出→管理员再登录。整个角色切换main-frame reload0，且末尾`forbiddenWrites.length===0`**实际经过并通过**：除了auth/login与auth/logout外没有POST/PATCH/PUT/DELETE业务写，不创建PrintJob或改订单。没有只跑前半段后声称完整通过。

这两项测试彼此证据范围不同。浏览器确实执行了构建JS和登录/导航/权限，Node段则额外明确验证hash assets/404；都不意味着真实安卓、针式241×93纸张、所有订单异常边界或最终视觉已经验收。

## 已停止与后续边界

浏览器context/browser finally关闭，session39957结束exit0；之后对唯一project、compose.test-v5.json执行stop --timeout15，proxy/api/migrate/db均Stopped，已立即向Root释放browser/runtime。没有其它project、Vite/dev API/PG操作，也没有down、prune或共享cache清理。保原0700目录、0600凭据和卷供续验，v3/v4镜像与配置可回溯。

后续若要续启，用同project和compose.test-v5.json；这不会自动吸收未来源码。生产源码再变则须重核shipping和实际镜像，不沿用本报告。未重跑旧备份恢复/容量/27/37/107；旧47表恢复等证据继续按原版本/范围保留。任务勾选与完整前端结果由Root/非作者复核，本报告不自行宣称生产上线。
