# 稳定基线串行实际验证结果

日期：2026-11-11。基线时间2026-11-11T12:36:23.881304+08:00，[61个src/test/style文件SHA256](frontend-stable-baseline.json)。本轮共享dev唯一验证进程由验收子代理运行，无并行browser/capture、无npm test通配、无GUI。Mac锁屏不阻CLI/headless；不是实际安卓/实物打印。没有修改前端/测试/checkbox。以下全是本代理实际命令结果，非作者旧绿数。

## 静态与pure/controller门槛

| 根目录命令 | exit与实际结果 |
| --- | --- |
| `npm run typecheck:web` | 0 |
| `npm run build:web` | 0；Vite70 modules、JS654.28kB/gzip158.74kB、CSS20.75kB。单chunk>500kB仅warning，非失败 |
| `node --import tsx --test --test-concurrency=1 apps/web/test/batch-session-regression.test.ts apps/web/test/finance-logic.test.ts apps/web/test/inventory-logic.test.ts apps/web/test/agent-a-workflow.test.ts` | 0；17 suites、57 tests/pass、0fail/skip/cancel |

pure57包含本地状态与部分复制测试，不等价57个真实页面业务；生产helper与事件接线边界沿core-review/serial-plan。门槛通过才开始下面六文件。

## API/混合阶段：逐文件串行

每条实际命令均为`node --import tsx --test --test-concurrency=1 apps/web/test/<文件名>`，按表顺序执行。Settings在printing前，不与其同时修改公司/模板。每个文件exit0、0fail/skip/cancel；59 tests合计只代表此阶段，不与UI成功混称。

| 文件名 | 实际pass | 证据类型 |
| --- | --- | --- |
| catalog-logic-workflow.test.ts | 9 | 真实API资料CRUD/价格与生产helper，非Catalog页面 |
| live-api-workflow.test.ts | 7 | 真实API报价/建单确认/改单/员工投影，非销售页面事件 |
| inventory-finance-api.test.ts | 9 | 真实API库存/资金/盘点/stale/月结及部分导航读取 |
| reports-workflow.test.ts | 19 | 真实report API+helper/模拟状态混合；存在if后页/过期等有限覆盖，非全部UIrace |
| settings-workflow.test.ts | 4 | 真实公司PATCH/清空恢复、用户创建停用，改变虚构库全局公司版本 |
| printing-workflow.test.ts | 11 | 生产打印配置helper+真实模板版本/job/状态；不是纸面/所有PDF |

各脚本自行从既有私有夹具文件读认证，不输出秘密；本轮含真实虚构业务写入，非只读。没有为取得绿数清理其它组资料。后续显示价格/余额须以本轮实际新状态为准，不机械套旧截图。

## 浏览器阶段：仅一个进程，逐套运行

每条实际命令同上，均`--test-concurrency=1`；不调用GUI/NodeRepl。Catalog完成后A，再B；A新阻塞已先报告协调者，协调者明确B互不依赖可继续，因此随后才单独运行B。

| 文件 | exit/计数 | 实际结论 |
| --- | --- | --- |
| catalog-browser.test.ts | 0；5/5、0skip | 独立headless真实资料维护/响应式操作；生成Catalog新图。不是整个12.1全部边界已终验 |
| agent-a-e2e-regression.test.ts | **1；4pass/1fail**，0skip | 首项employee管理来源403文案超时；其余setup、admin快照/导航、无刷新切账号生命周期、teardown通过 |
| inventory-finance-browser.test.ts | 0；4/4、0skip | 实际browser事件：同意图丢响应key+payload一致、改输入换key、盘点两阶段重试不二次PATCH、Statement scope/signed。含route拦截夹具，不泛称后端所有资金守恒 |

### 当前A阻塞：employee管理来源静默回页，无明确拒绝

失败位置`agent-a-e2e-regression.test.ts:50–54`：登录employee成功、默认订单通过，然后发`huoyoupu:navigate` href **`/customers/cust-1`**（生产resolver归finance），等待“403 访问权限受限”30秒超时，exit1。最后forbiddenRequests断言未执行，不能将该项无禁请求标通过。

只读App:176–181的employee+ADMIN_ONLY_PAGES(target.page)分支仅清目标并setActivePage('orders')后return；pending分支:92–97同样静默。后面虽有403渲染gate，但提前回页使它在此路径不可达。**当前没有权限绕过证据，但清晰拒绝提示确实缺失**；11.3原文要求服务端拒绝有清晰提示，A16原预期与部署smoke也使用明确拒绝。不能仅改两个测试接受无提示回页凑绿，应交A窄修明确可见拒绝同时保持零管理API。修后需真实重跑该套；本代理没有改实现或测试。

### CSRF与A16已证/未证

A套第3项真实浏览器完成Admin→Logout→Employee（无刷新）→Logout→Admin（无刷新），实际通过，原匿名challenge缺口的这条运行回归通过；不因此将失败首项泛称通过。

A16只读窄核：loading/anonymous时pendingTargetRef保留目标；身份明确后消费，admin getReturn定位、employee分支不发getReturn。原“初始return在身份恢复前永久丢失”的源码缺口关闭。pure项22也通过，但现browser没有实际完整return深链身份恢复断言，故不将源码+模拟测试当真实该路径通过。

## 新截图与用户底部确认要求的覆盖边界

A本轮确实覆盖写出两张新图（并已view）：

- `docs/ui/build-web-inventory-v1/implementation/order-revision-snapshot.png`：mtime12:38:11.764+08，真实历史只读v2页面；不是底部确认场景。
- `docs/ui/build-web-inventory-v1/implementation/order-edit-customer-accounts.png`：mtime12:38:11.914+08，1280×900真实改单，**可见内容下方的确认/取消条**；当时quote仍“待报价/正在核算”，确认禁用，不能证明有效报价后的确认行为。

该现有A脚本只有1280桌面context与条件性截图，无400手机context/截图，没有Create/草稿Detail底部截图，也没有长单滚动到底/底栏避移动导航safearea断言。**PC Edit底部外观部分已有新图；Create/Edit/Detail手机400、长单不遮内容及按钮quote/权限/幂等行为仍未覆盖**。旧mobile-batch-400仍是旧图，不能称A15最新手机确认图。未由Codex补写前端测试；后续协调者独占GUI补验，用户仅提“确认按钮放下面”，不是最终视觉认可，11.1不勾。

## 源码/后续状态

本轮最终比较时间2026-11-11T12:40:16.767327+08:00，原基线61个文件hash均未变化。截图为测试产物更新，不在production/test代码变动之列。没有运行capture/PDF或Mini deployment入口，没有重跑后端全套。A静默拒绝阻塞已上报，后续修源码后对受影响门槛/定向browser再验；不因B/Catalog通过把A失败覆盖成全绿。

新增deployment-browser-smoke.test.ts是独立env入口，仅Mini隔离HTTPS环境安排，不混入localhost套件；未配置skip不能称部署通过。Mini sync/build/真实HTTPS/设备/期初/最终视觉仍按各自证据，不因本轮前端门槛成功关闭14.3/14.4/14.2或最终差异项。


后续独立capture阶段已完成：两既有脚本实际exit0，见frontend-capture-result.md。新合法241×93短两行落2页（合计独页）是当前可用性重点，不能凭脚本绿关打印；A静默权限提示失败仍未修。其余限定通过/未验按产物报告，不覆盖本报告A4/5原结果。
