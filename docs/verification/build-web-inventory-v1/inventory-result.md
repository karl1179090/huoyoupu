# 库存独立交叉验收

实施者之外的 backend_foundation 代理核查 003_inventory.sql、库存服务和 HTTP，并增加 inventory-acceptance.db.test.ts。

实际运行：`npm run test:db -- apps/api/test/inventory-acceptance.db.test.ts apps/api/test/inventory.db.test.ts apps/api/test/inventory-http.db.test.ts`，真实隔离 PostgreSQL，15/15 通过，无跳过。

4.1：独立入库来源、分仓数量/实际成本、业务及登记时间、不可变流水、非负及安全整数约束成立。新独立测试实际损坏汇总后重建，批次余成本与流水不符时拒绝且不改汇总，DELETE 流水受约束拒绝。

4.2：实际成本入库、补录时间不改既有出库、角色鉴权、严格契约、幂等和审计覆盖通过。

4.3：真实并发不超卖，多商品仓锁序，FIFO跨批及人工不足补选，重复行需求合计，10元24瓶逐瓶全出全回，以及错序尾差来源守恒通过。销售整单联调由销售实施/验收补充，不以底层测试代替该证据。

4.4：盘点快照、版本冲突、盘盈独立批次与成本、盘亏损益、确认重放通过；真实已确认订单毛利不被盘点改写的跨模块场景尚待销售验收证据，本报告不据此宣称4.4完整完成。

补充4.4独立验收：只读复核 inventory-sales.db.test.ts 与 docs/inventory-verification.md，实际 `npm run test:db -- apps/api/test/finance.db.test.ts apps/api/test/inventory-sales.db.test.ts` 7/7通过，其中库存跨模块场景1/1通过。真实HTTP确认后的盘亏/盘盈不改任何商业revision、行、sale_allocation和ledger；cost4.00/profit6.00保持，独立损益-4.00/+9.00，库存7瓶21.00元。至此4.4所缺跨模块证据齐备。
