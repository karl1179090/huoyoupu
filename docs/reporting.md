# 统一报表与快照

接口实现位于 `apps/api/src/modules/reporting`，迁移为 `006_reporting.sql`。`registerReporting(app,deps,options)` 由应用入口统一注册，所有请求每次复核管理员；查询POST校验Cookie、Origin和CSRF，不写业务账、不要求业务幂等键。

`queryReport(pool,actorId,input,options)` 是打印/AI可复用的统一查询入口；`getReportRun`、`getReportSources`只读取原快照，永远不重新统计。options默认为30日保留期、单来源集合100000条、每条SQL15秒；超来源数422 UNSUPPORTED_QUERY，SQL超时503 QUERY_TIMEOUT，过期410 SNAPSHOT_EXPIRED。返回快照不会自动替换为新结果。保留期控制读取有效性，当前迁移保留不可变历史行，清理归运维归档策略，不提供业务删除接口。

## 时间与查询

业务时区始终Asia/Shanghai，Intl解析墙上时钟，不依赖主机TZ。期间左闭右开；本月同期默认从上海月初至查询时刻，上月映射相同日时，短月截至其完整月末。自然月区间必须为上海月初至紧接的下月月初，拒绝多个月对比单个月；自定义比较必须给完整本期和基期。结果同时保留实际区间、未完结标记、当前视图asOf。normalizedQuery为可重放的显式custom区间；刚到月初时可出现零长度同期区间，结果为零而不产生未来数据。

分组与过滤严格按规划白名单，未支持参数不忽略。实体ID去重、转小写、排序；显式空ID数组表示无匹配，不等同省略过滤。quantityBasis只在客户商品比较中接受，缺省ordered；其他类型不填无意义默认值。余额/库存只接受pointAsOf，默认当前且不能未来；发生额类型只接受period。

## 指标

- 销售按sales_orders固定confirmed_at归期，只采用confirmed订单current_revision_id的revision_lines。金额累加持久化net_amount/cost_amount，含已分摊整单优惠和抹零，不按显示单价重估。return_history行仍是原销售的一部分，不能再扣returned计数；订单数量按order_id去重。
- 退货按sales_returns.confirmed_at独立进入期间，只有confirmed信用，absorbed_by_void和作废订单排除。返库不再扣销售。商品仓库来自source_revision_line_id；客户按订单当前customer_id归属，与资金重分类一致，原客户确认事实不覆盖。
- grossSalesAmount为优惠后的有效销售额，returnAmount为本期退货信用，netSalesAmount为两者之差。grossProfit=销售额−退货信用−销售成本+原成本信用；它不是完整净利润。
- 客户商品比较按两期组合并集，基础单位整数分别展示下单、退货、净量。不同商品从不混成一种数量。只按product时客户为null；基期数量非正时百分比为null，零基期正本期为new，其他非正基期为no_baseline。百分比用整数有理数四舍五入至两位，不使用浮点金额。
- 现金只取active cash_events，按实际occurred_at，登记时间另列；核销与历史余额抵扣不新增现金。销售按商品或仓库筛选时收退款列为null，避免机械分摊。
- 截止库存累计stock_movements.recorded_at<=pointAsOf，不能用补录received_at让历史库存倒生。批次组另显示实际入库和登记时间；汇总组批次及其时间为null。
- 库存损益逐笔按effective_at。API金额非负，以kind区分收益/损失/冲回。底层已有两种signed来源习惯：盘盈正、盘亏负；退货不返库费用正、恢复负。需要净收益时必须按kind归一（gain/loss_reversal正，stocktake_loss/return_loss负），不得直接全表sum金额当净收益。
- 客户余额按当前已知ledger的effective_at<=pointAsOf净和；正数为应收、负数为信用。历史unallocated为同业务截止负receipt/opening来源，排除同截止已冲正来源，再减截至该时点已登记核销；核销无业务日期，使用recorded_at。这是当前账视图的业务截止和已登记核销组合，不声称还原当时尚未知的补录事实；asOf明确当前视图时间。version为纳入该截止分录数+1。

## 快照与来源

一次REPEATABLE READ事务读取全部来源、计算结果、保存rows及source manifest；数据变化不会污染后续页。来源带实体ID、当时版本、登记时间及可用API跳转；订单商业版本自身不可变。batch来源跳转至按商品仓过滤的批次列表并带ID锚点，损益跳转至原盘点/退货单，ledger跳转至原客户分录列表。结果保存当时数量金额及名称，不拿当前实体重新组装旧行。

游标绑定快照ID与rows/sources视图，禁止跨结果或跨视图使用；limit可更改但不改变原排序/数据。sourceWatermark是排序来源清单与结果行的SHA256，来源枚举去重；每页沿用同一ID、asOf和watermark。表触发器拒绝覆盖或删除旧快照。
