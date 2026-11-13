# 报表9.1–9.4独立验收

backend_foundation未修改reporting实现，核查query/metrics/sources/service/index、006迁移和作者说明。实际运行：

- `npm run test:db -- apps/api/test/reporting.db.test.ts docs/verification/build-web-inventory-v1/business-loop.db.test.ts`：真实PG2/2，修复销售优惠分值后，报表与真实月结逐项一致。
- `TZ=America/Los_Angeles node --conditions=development --import tsx --test apps/api/test/reporting.test.ts`：6/6；最后自然月边界修复后又以TZ=UTC运行6/6。
- 最后修复后 `npm run test:db -- packages/database/test/backup.test.ts apps/api/test/reporting.db.test.ts`：2/2，其中报表综合1/1。
- API typecheck/build实际exit0。

9.1通过。结构与业务组合白名单、上海区间、短月和自然月未完结输出正确，归一查询可重放。独立核查发现calendar_months曾接受三个月本期却默认一个月基期；按既有契约“下月月初end”补singleMonth语义校验，现拒多月本期/基期，需多期时使用custom明确区间。

9.2通过。两期组合并集、本期零购买、负净量、零/负基期null、不同商品单位不混加。独立构造基期20000、本期13333、实际下降33.335%的边界：展示可舍入33.34，但33.34阈值不应纳入。作者已改整数交叉乘法而非展示值过滤，33.34拒绝/33.33纳入回归通过。

9.3通过。原确认日+当前有效revision归销售，独立确认退货日归退货，返库不重复销售；改客后销售和退货归当前客户，原现金主体不搬。商品仓过滤现金为null。补录现金用actual occurred_at；库存截止用movement登记时间，不能倒生历史库存。新修复优惠分值后，完整HTTP闭环报表净销售17.37、成本信用1.50、毛利9.37，与资金月结同口径。

9.4通过。单RR事务保存不可变rows/source，旧页不读新资料重新统计；source链接真实API可读；分页绑定run和rows/sources视图，错ID/错视图拒绝，过期410。改单/作废后原快照、原版本source仍保持；同条件新结果变化可追溯。真实HTTP管理员、CSRF和员工拒绝覆盖通过。保留期及来源/SQL限制已实现；真实运营规模容量与查询计划仍属14.4未执行，不据小夹具夸称已完成容量验收。
