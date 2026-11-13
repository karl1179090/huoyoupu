# 1.4 独立验收结果

日期：2026-11-10。结论：**通过任务 1.4 的金额基础工具验收**。订单、库存、资金业务集成尚未因此视为完成。

实际执行以下命令，均 exit 0：

- `node --conditions=development --import tsx --test packages/money/test/money.test.ts docs/verification/build-web-inventory-v1/money-acceptance.test.ts`：8/8，无跳过。
- `npm run typecheck -w @huoyoupu/money`
- `npm run build -w @huoyoupu/money`

原测试 5 项覆盖固定样例、200 次来源拆分/逐瓶全退性质和 1000 次优惠分摊性质。独立新增 3 项：遍历 10 元/24 瓶每个两段拆分点并逐瓶全退；穷举三行小金额组合及每个合法减免额，验证合计与行容量；精确检查 half-up、六位单价、零价、数据库上限和派生数量/金额溢出拒绝。

阅读源码确认：中间计算使用 bigint，有理数换算不预先舍入基础单价；来源按累计数量的应分摊金额差计算，每个完整来源最终承接全部余分；退回使用原来源金额；优惠最大余数并列按输入顺序。`docs/backend-development.md` 已说明金额/单价上限、数量精度、尾差及同事务持久化计数器要求。

注意各业务模块必须复用原来源累计计数器，并在同一事务保存；本次工具测试不能替代后续订单退货和库存并发集成验收。未修改金额实现。
