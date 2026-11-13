# 空业务初始化：只读核查与最小实测计划

后续：Root已批准并完成新增真实CLI/API定向测试，见 [实际结果与UI交接](empty-bootstrap-result.md)；本文件保留最初只读阶段计划，不用它覆盖后续实际证据。

2026-11-12。用户已取消真实期初资料作为上线前置，选择空业务数据初始化；导入/导出以后另做。本轮仅CodeGraph CLI优先查找（当前未索引实际bootstrap文件）后读源码、迁移和已有测试，不启动PG/API/Mini、不读现有凭据、不清空任何已有库，不改生产代码/规划checkbox，也没有重build或跑全套。

## 真实路径与初始化允许的内容

- 生产迁移：`packages/database/src/cli.ts`/`infra/runtime.mjs migrate`，按001–008顺序、事务/锁/checksum保护。全部SQL唯一静态数据INSERT是007创建`company_profiles(id=1)`，空name/phone/address、version1、default_template_id=null；无演示/期初业务seed。
- 首次管理员：现有`npm run admin:init`实际执行`tsx --conditions=development apps/api/src/modules/auth/initialize.ts`。读取指定私有密码文件，createDatabase→initializeAdministrator；建1个有效admin、1条initializeAdministrator operation与1条用户audit，不建员工/客户/商品/仓/现金或期初。密码不放argv/仓库/日志，测试时只生成自己的临时随机值，不读取现有dev/Mini凭据。
- 生产`server.ts`/`createApp`只连DB并注册模块，没有seed。`scripts/dev-api.ts`才负责演示商品/客户/仓/批次/订单/模板；`createComparisonReportFixture`也明确会造跨期业务。两者都**不得**拿来验证空初始化。
- roles是users.role CHECK(admin,employee)，没有必须预填的roles字典；单位是商品所属product_units，无商品时单位行0合理，不能为“有基本单位”偷建SKU。print_templates0/default_template=null是待管理员配置状态，不是演示订单。当前未发现需改生产API/迁移的具体缺口。

## 推荐最小范围：本机新私有PG，不争用Mini或安卓

获Root放行后，拟新增一个后端定向测试`apps/api/test/empty-bootstrap.db.test.ts`（**目前尚未创建，不可把下方计划命令称为已跑**），复用已有`test:db`私有cluster与`createTestDatabase({migrate:false})`，但不使用会预建admin的apiFixture。

为明确不接外部数据库，调用现有runner前移除TEST_DATABASE_URL，使它自行initdb一个新的`/tmp/huoyoupu-pg-*`、唯一Unix socket且无TCP；runner只清自己临时cluster，测试只DROP自己生成的随机huoyoupu_test_*库。DATABASE_URL不用于父层选库，所有子CLI明确由该随机库连接参数覆盖，不继承dev URL。

获批、创建测试后的现有命令入口：

```bash
env -u TEST_DATABASE_URL TMPDIR=/tmp npm run test:db -- apps/api/test/empty-bootstrap.db.test.ts
```

单测内部使用**真实现有CLI**而非SQL INSERT/DELETE模拟初始化：

1. 新随机库`migrate:false`，确认无public业务表。
2. 子进程`node infra/runtime.mjs migrate`，DATABASE_URL仅指该新库；现有编译产物存在时直接用，不因无源码变动重build镜像。若产物缺失则报具体缺口，不假称运行成功。
3. 新0700临时目录创建0600随机密码文件（值只在测试内存/文件），子进程执行现有admin:init对应CLI；仅捕获退出状态/脱敏结果，不输出环境或密码。
4. SQL只读计数/内容digest核bootstrap基线，随后spawn现有compiled runtime serve到动态127.0.0.1端口，明确PUBLIC_ORIGIN和禁用未配置模型；Node真实TCP登录/列表/报表检查，不用inject代替启动。
5. 优雅停该子API，再启动一次同DB；重跑migrate应applied=[]，重复admin CLI应exit1“已有账号，禁止重复初始化”，首账号、权限、密码hash和业务内容均不变。**重复初始化是安全拒绝，不能写成exit0幂等成功**；API正常重启没有seed才是本项重复启动要求。
6. finally关闭本测试子进程/pool，DROP自己的随机库、停止/删除自己cluster和私有密码目录，不碰dev97364、PG42535、Vite5173、原Mini测试卷或任何已有业务。

现有tests可作支撑而非替代新增事实：database.test.ts已验证空库迁移/replay/checksum；auth.db.test.ts已验证重复初始化拒绝与角色权限；server-smoke.db.test.ts已验证compiled TCP migrate/serve。但它用apiFixture预建admin、没有证明本计划全部业务零基线，所以不能据历史测试直接勾本轮空初始化验收。

## 精确预期与检查边界

初始化基线应有：8条schema_migrations、1空company_profiles、1有效admin、对应1operation/1audit。认证后sessions可增加；报告读取会新增report_runs，这些是正常系统记录，不能把所有表非零都当seed。

业务表应0行：products/product_units/barcodes、customers/addresses/专属价、warehouses、receipts/receipt_lines、inventory_batches/stock_movements/stock_balances、sales_orders/revisions/lines/allocations/releases、sales_returns/return_lines/return_allocations/restock_events/restock_lines、customer_accounts/customer_ledger_entries/opening_balances/cash_events/settlement_allocations/statements及库存损益等；逐表名单按实际47 BASE TABLE扣除上述系统白名单生成，不能漏掉未命名业务表。库存数量/成本、应收/信用/现金等SUM用COALESCE应为0，不靠只核某个列表。

HTTP管理员列表products/customers/warehouses/orders/receipts/batches/balances/stocktakes/cash-events等应items=[]、nextCursor=null；无客户时不伪造customerId去创建业务账户/月结。company配置返回真实空值，users只列首admin，不暴露密码hash/token。

六类报表用真实HTTP/契约，保存真实run，不造响应：inventory、customer_balances、cash_flow、inventory_loss、customer_product_comparison应空行；sales_summary在默认无groupBy下可合法为**1行所有指标0**（orderCount0），不能错误断言六类全rows=[]。报表/列表/重启后业务表仍0。

匿名管理/业务读应401。为验证员工管理403，可在独立测试的第二阶段经正常管理API创建一个随机员工账号，只增加系统账号/审计，不建任何业务；保留第一阶段“只有1admin”的基线。员工订单空页合法且无成本/利润字段，管理列表/报表403；旧账号和业务零基线不受影响。若Root希望严格只保首admin，则可用已有独立auth角色证据覆盖员工部分，本轮至少验匿名401。

这只是可审核方案，尚无本轮空业务实际运行结果。用户“真实期初不再前置”的规划调整由Contracts/Root维护；当前不把无数据初始状态等同未来期初导入/导出功能，不自动开真实生产或真实客户资料。
