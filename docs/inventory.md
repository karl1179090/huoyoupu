# 库存模块与同事务调用边界

实现范围为任务4.1–4.4：采购/期初入库、独立批次、商品仓库汇总与追加流水、实盘快照和损益，以及供订单/退货调用的库存底层。HTTP字段完全复用规划OpenAPI；本文件描述实施边界，不更改业务口径。

## 数据与金额

`003_inventory.sql` 创建 receipts、receipt_lines、inventory_batches、stock_balances、stock_movements、stocktakes、stocktake_lines、inventory_loss_entries 和查询投影视图。来源行唯一、批次来源恰选一个、商品单位归属由复合外键保障。数量、倍率、版本在安全整数范围，批次余量与金额非负；空批次不残留成本。已确认库存流水与损益只能追加。

数据库的 bigint/numeric 在服务内以字符串读取、BigInt运算。实际输入单位成本保留六位和原倍率；入库总成本以分按half-up确定。分批销售按批次剩余数量与剩余成本分配本次实际成本，剩余分子/分母保留尾差；最后出清承接余额。不预先把基础单位成本舍入为两位单价。每次恢复使用原消耗金额或已经持久化的释放/退货成本来源，不能读取当前参考进价。分、倍率及成本函数来自 `@huoyoupu/money`。

每笔实际入库时间可补录但不可未来，系统登记时间独立保存。自动选择由PostgreSQL比较完整精度的 `received_at, recorded_at, id`，不使用被JavaScript Date截成毫秒后的值作排序。补录只参与此后的分配，已经形成的负流水和成本不重算。

## 统一锁与来源接口

所有函数接收当前操作的 `{client, actor, operationId}`，不自行开启或提交事务。订单调用者先锁订单和客户账户，再一次性传入全部受影响商品仓库，保持全局锁顺序。

- `lockStockBalances(client, keys)`：归一化UUID、去重、按商品/仓库排序建立零余额锚点并锁定。先取得本次全部锚点，再锁任何批次；其他路径不得交错按明细临时加锁。
- `rebuildStockBalances(client, keys)`：先锁选定锚点及批次，仅在批次合计和不可变流水合计完全一致时重建汇总并增加版本；两份依据冲突则拒绝。测试实际破坏汇总后验证重建。该修复函数供受控维护调用，不新增公开业务路由。
- `issueInventory(context, {sourceId, lines})`：同一来源订单已由调用方锁定；逐行提供逻辑行标识、商品、仓库、正整数基础数量、auto/manual和可选手选批次。先合并同商品仓库总需求检查，再分配。手选必须完整覆盖且不得重复，不能自动跨仓。批次锁按稳定id，实际选择按FIFO。返回 `{id,lineId,productId,warehouseId,batchId,quantityBase,costAmount,inputUnitCost,multiplierBase,issueSequence}`；调用者同事务写sale_allocations及商业内容版本。`id`对应原消耗流水的source_line_id，不能另造替代来源。
- `selectReleaseSources(sources, quantity)`：按原issueSequence倒序选择。调用者必须只提供扣除已释放、已确认退货占用后的可用量；本函数不代替订单/退货的商业来源核对。
- `restoreInventory(context, {sourceKind,sourceId,selections})`：只接受order_revision_release / return_restock / order_void。selections含allocationId、quantityBase及可选costAmount。通过原sale_issue负流水查原仓原批，累计恢复不得超过原数量和原成本，最后一次必须承接剩余原金额；source/effect唯一约束防止事件重复。底层仍锁全部相关锚点及批次。

显式costAmount必须来自订单/退货层已持久化的原来源分摊，并在该层证明归属和可用量；库存层独立验证原消耗累计上限和末次守恒。不能强制按实际返库顺序重新分配原金额。例如原3瓶合计0.01元成本，先确认1瓶退货并锁定0.00，随后改单释放1瓶0.01，之后才实际返库之前的1瓶0.00，最后作废恢复余下1瓶0.00。该合法次序必须保持原3瓶/0.01元，不能因物理时间顺序改变已确认信用额。库存服务测试包含此例。后续订单、退货、返库仍需联调其持久化来源和同事务调用。

数量和金额上限由公共工具及数据库双重校验；公开路由把换算超限转换成标准422响应。没有原来源的恢复、超额恢复、跨批重估或末次少还成本均拒绝。

## 盘点

创建捕获原批次数量/版本；batchId为null只允许账面为零，并另存汇总锚点版本以检测此后新增库存。空批行和相同商品批次不能重复。实盘修改不改库存，全部行填写后才能确认。确认锁定相关锚点及批次，再检查所有快照，一行过期则整次失败。

盘亏只扣指定原批成本；盘盈要求该商品成本单位和实际单位成本，只为正差新建批次，不覆盖原批。损益独立追加，gain为正、loss为负，不能据此改历史销售毛利。盘点的实际计数时间与库存流水生效/登记时间分开；较晚的真实库存更正不会倒记到旧销售日。

## HTTP与验证

`registerInventory(app,deps)` 注册规划中的11个库存接口，使用真实身份服务及withOperation；结构校验置于幂等事务callback中，合法key的失败可缓存，权限/CSRF先于缓存。输出按OpenAPI校验，所有写入追加实体审计。员工在执行查询或校验正文前被拒绝。

列表使用绑定查询条件的不可透明游标，limit最大200；余额按商品/仓库，其他按稳定id排序。库存流水时间过滤为左闭右开，普通列表asOf表示本次查询时间，不声称冻结整个资料库。

服务测试位于 `apps/api/test/inventory.db.test.ts`，使用临时真实PostgreSQL：验证来源/范围约束、双时间与补录、联合需求、完整手选、跨仓拒绝、并发不超卖、反序多键锁、逐瓶出清全退、错序原成本恢复、盘盈/盘亏/旧快照及汇总=批次=流水核对。`inventory.test.ts`验证后扣先退的来源选择。HTTP联调用真实登录、角色、CSRF、幂等和审计验证。未运行的命令不能视为通过。
