# 打印10.1–10.3作者验证

2026-11-10，contracts/printing Agent；不改任务勾选，不包含前端和物理出纸完成声明。

| 任务 | 实现及证据 |
| --- | --- |
| 10.1 | 007/schema/printing、config.ts、templates.ts；四项配置、十进制宽度累计、合法尺寸/边距/最小高度、cost/未知字段拒绝；真实HTTP公司维护、模板首版/默认/另建第2版，旧第1版配置保持，超宽422不发布。 |
| 10.2 | jobs.printData只读repeatable-read且总是OrderPublic；真实确认一单同商品两仓1件12瓶+2瓶，保留两行及28.00总额和完整长名；admin/employee输出都无costAmount/grossProfit/inputUnitCost/allocations。改单后旧订单+旧模板版本仍读28.00且isCurrentOrderRevision=false。 |
| 10.3 | jobs/index/state + security公共allowedRoles；员工发起/重打3次，重放只1次记录，商业订单/所有版本/库存汇总与流水/客户ledger逐字段不变；本人状态允许，管理写员工403；原管理员修改他人job后被降为employee，相同key重放403且不带replayed。销售读模型已接state，旧job不标新revision，当前版请求/人工取消只更新状态不改订单version。 |

实际命令：

- `node --conditions=development --import tsx --test apps/api/test/printing.test.ts apps/api/test/reporting.test.ts`：7/7通过，exit0。
- `TMPDIR=/tmp npm run test:db -- apps/api/test/printing.db.test.ts apps/api/test/reporting.db.test.ts`：2/2通过，exit0，真实PG和HTTP，无skip。
- `npm run typecheck -w @huoyoupu/api`：exit0。

设备要求已记录于docs/printing.md，由后续真实环境补证据；模板排版和UI属于前端任务，未由Codex编写。
