# 库存4.1–4.4实施与验证

2026-11-10，contracts/inventory Agent。执行后的当前库存源码没有未解决测试失败；后续订单/退货调用仍需交叉验证其来源授权和同事务商业账务。

| 任务 | 实现与实际证据 |
| --- | --- |
| 4.1 | `003_inventory.sql`、`schema/inventory.ts` 建立入库/批次/汇总/流水/盘点/损益；真实PG测试拒绝来源行重复、source/effect重复、负余量和安全整数溢出。`rebuildStockBalances`先比对批次与追加流水，测试实际将汇总置零后重建，并核对数量/成本三者相等。 |
| 4.2 | `service.createReceipt`及完整HTTP注册；每次来源独立，实际单位成本不套默认值，同时间按登记时刻/稳定id，补录更早批只影响后续销售。测试实际/登记时间分别输出、跨商品单位拒绝、未来时间拒绝、原成本流水不改，HTTP幂等单批单流水及失败缓存。 |
| 4.3 | `stock.ts`统一先锁全部商品仓锚点、再按batch id锁，数据库完整时间精度FIFO；同商品重复行联合需求、手选完整且不得扩选、不跨仓、联合需求安全整数上限。真实PG竞争最后5且两方各需4只有一方成功，反序多键并发无死锁。逐瓶销售10元/24瓶再全部原来源恢复，数量/金额守恒。 |
| 4.4 | 创建快照/填写实盘/确认与HTTP接口齐全；所有行先检查版本再执行，batchless零库存快照另验汇总版本；盘亏指定原批，盘盈成本必填且只创建差额新批，损益独立。测试旧批与零库存快照stale失败、确认幂等一笔损益、原入库成本和负流水保持不变。新增 `inventory-sales.db.test.ts` 经真实HTTP确认销售后分别盘亏/盘盈，核对全部商业版本、行、原扣库来源、客户往来逐字段未变；订单成本4.00/毛利6.00保持，库存损益独立为-4.00/+9.00。 |

模块边界和原成本错序恢复例子见 `docs/inventory.md`。没有修改规划OpenAPI、前端、root配置或其他作者的模块。

实际执行：

- `npm run typecheck -w @huoyoupu/api`：exit0。
- `npm run typecheck -w @huoyoupu/database`：exit0。
- `npm run build -w @huoyoupu/database`、`npm run build -w @huoyoupu/api`：exit0。
- 独立私有Unix socket PostgreSQL18，运行 `node --conditions=development --import tsx --test apps/api/test/inventory.db.test.ts apps/api/test/inventory-http.db.test.ts apps/api/test/inventory.test.ts`：15 tests / 15 pass / 0 fail / 0 skip。
- 随后连同fixture生命周期回归、既有database和operations，在另一独立PG18运行31项：31 pass、0 fail、0 skip，覆盖本报告最新源码和新增联合数量上限/来源唯一/末次成本约束。详细fixture独立证据在 `docs/verification/build-web-inventory-v1/database-lifecycle-independent.md`。

期间曾观察全局operations测试清理竞态，已交foundation实际复现并修复；它不是库存业务失败，也没有通过屏蔽错误处理。最终上述定向验证无残留异步异常。此报告不替代主代理的独立验收或任务勾选。

补充4.4交叉验证：`TMPDIR=/tmp npm run test:db -- apps/api/test/inventory-sales.db.test.ts`：1/1通过，exit0；`npm run typecheck -w @huoyoupu/api`：exit0。测试用真实销售/库存/资金模块，不手填销售表。
