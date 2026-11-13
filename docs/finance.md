# 客户往来与资金边界

净往来以分为 bigint 运算，数据库 numeric(20,2) 字符串读写。正数为净欠款，负数为余额；客户下多个地址共用一套账户。customer_accounts 是事务内汇总/锁锚，customer_ledger_entries 是不可变来源账。期初是 opening，不计销售或实际收款。

订单/退货只调用 `modules/finance/port.ts` 的 FinancePort，必须沿用同一 PoolClient。锁序：订单稳定 id → 全部新旧客户账户稳定 id → 库存商品仓锚点 → 批次/原来源。`lockAccounts` 先创建不存在的锚点，再锁行；`applyCommercial` 更新商业分录和账户并释放本订单已经失效的核销，不接触现金主体。更换客户逐条冲正原客户商业来源，再向新客户重分类，保留 sourceId/sourceVersion/effectiveAt；不得把历史净额统一记入改单日。

实收/实退只有 cash_events；多单分配仅追加 settlement_allocations，不增加现金。收款默认按原确认时间及稳定 id，从最早未结清订单分配；人工核销拒绝跨客户及超额，余款保留原资金来源。余额应用不新增现金或往来净额。资金来源仅为客户原实收及负期初，退货本身不能伪造收款来源。

退款同时检查账户净可用余额和真实资金来源，并锁同一客户账户串行处理。改单、作废、退货后超过有效应收的分配按原来源释放回客户。原现金客户、金额、实际时间保持不变。冲正是 cash_reversals 加原日期反向账，并释放原核销；原 cash_events 保留且标记 reversed，不创建伪造退款。已用于实际退款的收款不能直接冲正：返回 RELATED_RECORD_CONFLICT，需先处理其退款来源。余额不足为 INSUFFICIENT_CUSTOMER_CREDIT；跨客户/超订单金额为 INVALID_CUSTOMER_ALLOCATION；旧版本为 VERSION_CONFLICT。

月结期间左闭右开，保存 query_snapshot、不可变 rows_snapshot、分项合计及来源 watermark；分页绑定快照 id。期初 + 销售 - 退货 - 实收 + 实退 = 期末。区间内切换期初计入 opening 分量，不冒充本期销售/现金。新跨期更正追加账，旧快照内容不覆盖，stale 标记变化；区间后新资金不使旧区间失效。SQL分页游标保留微秒精度，避免JS日期毫秒截断造成重复行。

## 期初资料核对

当前只有虚构测试数据，未导入真实期初。真实切换前须先取得客户唯一编码、切换时点（明确 Asia/Shanghai 到UTC换算）、正欠款/负余额及来源说明；按客户去重，核对逐客合计与原账总额。确认现金来源、未结单据和期初是否重叠，避免把同一欠款或已收款再次导入。用隔离库预检外键、精度、重复切换时点，出具逐客差异后再执行生产导入；真实资料、规模和容量验证属于任务14.4，未执行。
