# 前端停写后的串行验证计划

2026-11-11，只读检查package/scripts、现存测试/capture及本机`node --help`，**本轮未运行测试、构建、浏览器或写服务**。四组已实际收到阶段调整：完成当前源码/测试代码后停写，暂停新增browser/E2E/capture/PDF及含browser的全局tests；原验收义务不免除。A合并A13（A12已交付待独验）、B合并B3/B4、C合并C4/C5/C6、D合并D2。待协调者确认所有源码/后台测试停止后才执行本计划；此文不是新结果或任务完成声明。

## 实际命令入口

`apps/web/package.json`当前仅dev(vite)、typecheck(tsc --noEmit)、build(tsc -b && vite build)、preview(vite preview)、test(tsx --test test/*.test.ts)。根已有`typecheck:web`/`build:web`。没有test:pure、test:browser、capture或deploy-smoke脚本，不编造这些命令。

本机`node --help`已实际核实支持`--import`、`--test`、`--test-concurrency`、`--test-name-pattern`、`--test-skip-pattern`、`--test-timeout`；下文只用已确认的`node --import tsx --test --test-concurrency=1`，参数在文件名前。不要以`--test-force-exit`掩盖挂起/清理错误。分文件串行时不加concurrency:true；不随机顺序破坏现有setup依赖。`npm run test -w @huoyoupu/web`通配13个*.test.ts，**包含browser**，默认不保证文件串行，不能当纯逻辑检查或在施工期运行。

## 当前13个测试文件与2个产物入口分类

| 文件（apps/web/test/） | 实际类型 | 副作用与证据边界 |
| --- | --- | --- |
| batch-session-regression.test.ts | 生产pure/controller | 导入实际batchPickerLogic；生产组件使用controller/session/append，已实证接线；不执行React输入或实际网络 |
| finance-logic.test.ts | 生产pure | financeLogic金额/分配/期间/类型等；不证明弹窗状态/真实写重试 |
| inventory-logic.test.ts | 生产pure | inventoryLogic数量/盘盈/stale/整单校验；不证明确认按钮是否真的调用完整校验 |
| agent-a-workflow.test.ts | 混合本地pure/结构探测 | 有生产navigation/Restock时间/client导入和内存fetch；仍有手造条码/价格version、复制route Set/mapping、CSS includes。无真实HTTP/browser，不把名称Workflow当集成 |
| catalog-logic-workflow.test.ts | 直接API | 实际fetch创建商品/客户/单位/条码/地址/规则，名字logic不代表无服务副作用；不执行Catalog页面 |
| inventory-finance-api.test.ts | 直接API+少量helper | 实际虚构入库/盘点/账户/现金/月结，可能选择已有商品/仓；不替代页面事件/重试 |
| live-api-workflow.test.ts | 直接API | 确认/改单与角色投影，读取已有客户/商品/仓并追加订单，可能改变DEMO历史建议价；不是client/页面验收 |
| printing-workflow.test.ts | 生产pure+直接API混合 | printConfigLogic真导入，创建模板/版本/job并状态变更；先取已有订单，有if无订单return/跳过。不得单按绿数说所有打印路径执行 |
| reports-workflow.test.ts | 生产pure+直接API混合 | 真实report snapshots/sources与角色，部分测试模拟分页状态/旧if(nextCursor)，一行可能不走第二页；不存在ID404不是410证据 |
| settings-workflow.test.ts | 直接API，全局设置 | PATCH公司名称/电话/地址与创建/停用用户；清空字段用例有恢复，但前置修改和version变化仍影响打印证据。须独占运行 |
| agent-a-e2e-regression.test.ts | 真实headless浏览器+本机API | playwright新context登录/页面/来源事件/历史与logout生命周期；有if元素存在才执行；禁请求监控范围有限；未全量覆盖quote竞态 |
| catalog-browser.test.ts | 真实headless浏览器+API setup | @playwright/test chromium，实际维护资料并截图；当前快照仍搜索00892并清其它匹配产品条码，属于跨fixture破坏性准备，D2已要求改唯一00条码；未修不得对共享演示库运行 |
| inventory-finance-browser.test.ts | 真实浏览器+请求拦截夹具+实际setup | 新建独立客户，页面事件/响应丢失/盘点阶段/scope验证；page.route拦截的成功对象不是服务端最终账务证据，需分别标真fetch/fulfill |
| inventory-capture-screenshots.ts | 独立browser PNG入口，非*.test.ts | 实际页面点击截图；一些if/等待，可截到不正确状态；截图需核标题/数据，不能据文件名通过 |
| printing-reports-capture.ts | 独立browser PNG/PDF+合法AI fixture+API | 真实queryReport/getSources及创建模板、page.route/fulfill、page.pdf；会覆盖已有图片/PDF，必须先hash归档。AI模拟回答/澄清不是真provider；最新241×93产物须重新独验 |

所有脚本仍在作者最后合并期，执行前只读复核本表是否新增文件/配置/副作用，记录固定源码hash。不能在新测试未运行时用本表中的旧计数报通过。

## 建议串行执行顺序（以下均为未来命令，本轮未执行）

先确认四组无后台browser/写入任务，固定App/Auth/navigation及owner源码hash/mtime、package-lock；只用明确的本机虚构fixture，不把真实生产数据库作为这些会写业务事实的脚本目标。保持一次只有一个校验进程操作同库/同截图目录，独占GUI另排，避免HMR及headless改全局配置交叉。

### 1. 静态门槛，再本地pure/controller

从仓库根逐条运行，失败即回对应作者，不在错误构建上批量截图：

```sh
npm run typecheck:web
npm run build:web
node --import tsx --test --test-concurrency=1 apps/web/test/batch-session-regression.test.ts apps/web/test/finance-logic.test.ts apps/web/test/inventory-logic.test.ts apps/web/test/agent-a-workflow.test.ts
```

纯测试中临时mock global fetch须确认恢复；一旦某用例泄漏，在同进程后续结果不得直接采用。Controller通过仍需后续组件事件与HTTP证据。

### 2. 直接API各文件一次，固定顺序

每条完成再下一条；不与GUI、browser/capture并行。命令包含setup，不按名字筛掉setup导致后续空变量。

```sh
node --import tsx --test --test-concurrency=1 apps/web/test/catalog-logic-workflow.test.ts
node --import tsx --test --test-concurrency=1 apps/web/test/live-api-workflow.test.ts
node --import tsx --test --test-concurrency=1 apps/web/test/inventory-finance-api.test.ts
node --import tsx --test --test-concurrency=1 apps/web/test/reports-workflow.test.ts
node --import tsx --test --test-concurrency=1 apps/web/test/settings-workflow.test.ts
node --import tsx --test --test-concurrency=1 apps/web/test/printing-workflow.test.ts
```

Settings放打印前独占：它改company/version，打印/截图应在该轮确定的公司快照下采集，不与公司PATCH/默认模板修改竞争。printing-workflow显式版本测试与默认模板测试应核各自实际versionId，不把列表第一张模板默认为固定基线。无足够已确认订单、后页行或来源时判缺夹具/未执行分支，不能以if绕过当业务通过。每文件记录新建fixture IDs/相应结果，勿清理别组数据或改现存DEMO以凑断言。

### 3. 真实browser逐个运行，再独占GUI

D2消除固定00892跨fixture清理后，且所有代码冻结才运行。root不同时用同一业务fixture/设置，headless新context不等于数据库隔离。

```sh
node --import tsx --test --test-concurrency=1 apps/web/test/catalog-browser.test.ts
node --import tsx --test --test-concurrency=1 apps/web/test/agent-a-e2e-regression.test.ts
node --import tsx --test --test-concurrency=1 apps/web/test/inventory-finance-browser.test.ts
```

catalog浏览器会改商品/客户/价格；放A之前并记录实际历史建议价，避免A硬编码价格。B浏览器可能追加资金/盘点或拦截响应，必须确认route被清理、context关闭；失败后不复用污染context。测试成功还要检查if分支确实执行；不以总passed替代员工无全部禁请求、退后改单、真实分次返库或全部来源钻取。

再由协调者授予单一Computer Use owner完成独立Edge smoke：11.3无刷新切账号、默认与刷新、双端只读/直接管理源拒绝、预览；A控制器实际响应乱序/地址/改单与来源；B/C/D指定失败复测。按照项目规则Codex不写前端测试，发现缺口交Gemini owner；真实安卓/针式实物另按device-acceptance-plan，不用仿真关闭。

### 4. PNG/PDF最后采集，结束后独立读产物

以上没有新源码变动后，先归档旧产物hash/mtime，明确公司/默认模板当前版本及目标订单revision。现有capture没有package script，实际可执行入口为：

```sh
node --import tsx apps/web/test/inventory-capture-screenshots.ts
node --import tsx apps/web/test/printing-reports-capture.ts
```

两条必须分开串行，第二条包含真实report POST/模板创建与AI route fixture，不能称只读截图。若脚本全套有无关路径失败，不以已有部分图片猜整套通过。241×93及长单PDF实际跑后再pdfinfo/MediaBox、抽取全部行/每页表头/合计一次、渲染核裁切/金额自洽；旧C3 120×180非法跨字段fixture与旧20/98700长单不作为新合法目标证据。PNG核页名/账号/条件/状态，AI标注合法fixture/真实503/真实provider三类，不混称。

完成分阶段运行后不为重复绿数再执行一次全部变更业务的npm test；只有新源码变动/失败或未闭风险需要时再定向重跑。如果确实要求一次全文件汇总且接受重复fixture写入，可用`node --import tsx --test --test-concurrency=1 apps/web/test/*.test.ts`，这是现有13文件的串行调度，不含capture；不可与上面阶段并发，不能假称package默认test已天然串行。

## 跨组干扰与验收边界

- 新context只隔离cookie/local storage，不隔离同一后端商品、历史价格、默认模板、company version、用户角色和report过期。Settings公司空清/恢复与打印capture必须错开；没有统一恢复机制时记录最终值，不能强行用旧version覆盖别组新值。
- 目前catalog-browser的固定00892清理会删除其它fixture条码（已排D2），即便串行也不可误删。唯一00随机条码同样能验证前导零，不要求本轮由Codex改测试。
- live API选择现有商品/客户，确认后改变建议历史价；价格测试应读取服务端来源/当前值或使用隔离客户，不据旧截图硬断默认2.5。入库/盘点测试选择正库存批次也会改变同仓余量，后续按冻结后的实际fixture检查。
- 报表/AI fixed report.id应先记录水印/期间，后续写入不污染旧snapshot但可能让新query结果不同。来源页顺序/分页不能靠列表第一页或伪造cursor；若if(nextCursor)未进入，明确“后页未验”。
- 打印pure当前导入production printConfigLogic，但历史generatePageStyle复制测试证据仍不可用；agent-a旧复制Set/mapping、常量barcodes/version与CSS includes仅有限结构证据，不能自动升级组件测试。打印/AIcapture的if条件与route.fulfill也须逐项核实际经过。
- 每一轮至少记录命令exit、实际pass/fail/skip、真正执行的关键分支、源码与产物hash、fixture范围及未验项；NOTES、作者绿数或“Idle/无Stop”不证明后台停止。

## Mini HTTPS构建包smoke：现成适配能力与最小缺口

当前auth/navigation browser入口`agent-a-e2e-regression.test.ts`把goto写死`http://localhost:5173`，凭据路径写死本机/tmp；其它browser/capture及直接API也硬编码localhost5173、127.0.0.1:3000、Origin和私有路径。所读脚本没有process.env读取BASE_URL/ORIGIN/CREDS配置，**不存在可直接设置env就对Mini HTTPS运行的现成命令**。`vite preview`只是本机产物预览，不等同Caddy HTTPS/部署cookie/深链；设置Playwright通用环境变量也不会改这些字面量。

最小缺口交Antigravity对应owner：把现有入口的目标网页origin、API基址、凭据文件路径做环境覆盖（默认仍本机），同源部署API取真实HTTPS origin+/api/v1；启动所需浏览器/CA信任由环境准备，不能把关闭TLS/CSRF当smoke通过。凭据只从目标隔离fixture私有文件读，不上传生产秘密。应在已有auth/navigation browser入口中验证真实HTTPS构建包health/静态hash资源、session challenge→login→logout换账号、员工管理源403、真实order revision/batch query+fragment来源；不得用page.route替代部署请求，不对生产库跑建单/公司PATCH的全套。

当前没有该env适配和只读部署smoke子集，所以本计划不编造`BASE_URL=... npm run test:deploy`可执行命令，不用Codex新增前端测试或大框架。可由协调者Computer Use在隔离部署进行只读GUI smoke，或待Gemini最小改现有入口并独立核对后列真实命令；14.3新双镜像/HTTPS路径仍需独立freeze与实际运行，14.4期初仍缺，任务状态不因本计划变化。


## 2026-11-11当前入口更新（保留以上原计划为历史）

当前新增加`apps/web/test/deployment-browser-smoke.test.ts`，原“13个test/不存在部署env入口”是编写计划时快照，现已有专用第14个test。它只读取`HYP_DEPLOY_ORIGIN`、`HYP_DEPLOY_CREDENTIALS_FILE`、可选`HYP_DEPLOY_TLS_SPKI`，TLS方案按DEPLOYMENT_SMOKE_NOTES及foundation隔离CA准备；两目标配置都未提供时显式skip。部署专用真实命令为`node --import tsx --test --test-concurrency=1 apps/web/test/deployment-browser-smoke.test.ts`，**仅在Mini隔离HTTPS部署及专有私密fixture配置好时运行**，不把localhost全套指向Mini，也不以默认skip称通过。原其它API/browser入口仍本机硬编码，专用入口新增不等于它们都已支持env。

本轮已按计划执行静态/pure/API/Catalog/A/B browser，实际记录见frontend-serial-result.md；A有真实失败，不能写整轮全绿。capture/241×93新PDF未运行，底部确认手机/长单截图缺口须另补，不由Codex写前端测试。
