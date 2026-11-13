# 报表9.1–9.4验证证据

2026-11-10，contracts/reporting Agent。此报告为实现作者证据，主代理另行独立验收并管理tasks勾选。

| 任务 | 对应实现与实际用例 |
| --- | --- |
| 9.1 | query.ts组合白名单、Intl上海期间、同期短月/完整月/可重放规范化；metrics.ts与sources.ts六种查询。纯单测覆盖跨年、闰年短月、自然月未完结、非法参数组合。 |
| 9.2 | compareProducts两期并集和基础单位、独立退货、负净量、零基数null、产品独立比较；纯单测100%/130%下降、new/no_baseline、精确阈值和重叠区间；真实销售一单两仓1件12瓶+2瓶，基期14、订单数1，本期退3后净-3。 |
| 9.3 | 真实确认订单固定原月，当前月改单26→28更新原月；当前月确认退货进入当前月。退货后改剩余段确实生成return_history，原下单量仍14且退货只扣一次。客户更换后销售与退货一起归新客户；现金补录实际上月/登记当前，库存补录实际2020但登记前截止库存为空；直接用分摊net/cost。 |
| 9.4 | 006不可变report_runs/来源清单/固定页；改单前旧结果和原revision来源保持，新增库存后旧页保持，跨ID游标拒绝，超过保留期410；同客户同期销售/退货/实收与真实finance月结逐项相等；真实HTTP管理员查询、CSRF缺失与员工403。 |

实际命令：

- `node --conditions=development --import tsx --test apps/api/test/reporting.test.ts`：6/6通过，exit0。
- `TMPDIR=/tmp npm run test:db -- apps/api/test/reporting.db.test.ts`：1项综合真实PG/HTTP测试通过，exit0；覆盖六种结果schema和上述业务断言，无skip或模拟数据库。
- `npm run typecheck -w @huoyoupu/api`、`npm run typecheck -w @huoyoupu/database`：exit0。

共享类型微修另见docs/contracts.md：仅把规划非required且含default的ReportQuery.quantityBasis保持为可选；契约14项、contracts生成check/typecheck/build和API typecheck均通过。

独立验收发现33.335%下降先展示舍入后筛阈值的问题，已改原数量交叉乘法并加20000→13333对33.34/33.33相邻阈值反例；最新纯单测6/6通过。

自然月模式补充拒绝三个月区间，保证calendar_months当前和基期均为一个完整自然月，避免把多月与单月默默比较。
