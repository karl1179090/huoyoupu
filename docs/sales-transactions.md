# 销售订单、退货和返库

当前实现对应 `build-web-inventory-v1` 任务6与7。业务规则来自OpenSpec，HTTP结构以共享OpenAPI为准。实现不包含前端或打印机验证。

所有管理员写操作由`SecurityServices.withOperation`创建一次业务事务，使用同一`PoolClient`调用库存与真实`FinancePort`。员工只允许读取独立投影的订单列表、详情和历史；退货来源、报价及写操作要求管理员。成功和业务失败均服从公共幂等重放规则，权限检查先于缓存。数据库004迁移包含销售、商业版本、原消耗段、释放来源、退货及返库事件，005财务迁移单向引用004。

## 顺序与不可变来源

锁顺序是幂等登记、订单、按客户ID排序的账户、按商品与仓库排序的库存锚点、原消耗段、稳定批次。订单锁也串行同单退货与返库；实际库存和商业分录同事务提交。草稿和报价均不占库、不记商业应收。报价在一致、只读事务中模拟释放与新增消耗，只返回实际持久化来源的`sourceLineId`或`null`，新增行不伪装有持久化标识。

确认后`confirmed_at`固定。`version`保护所有订单写入，商业变更追加`revisionNo`；配送元数据不创建商业版本，也不操作库存或账务。每个内容版本及来源链接不可变，`revision_lines`仅允许退货累计计数更新。退货、返库、作废原因与操作ID均保存，审计记录公共写操作结果。

原消耗段` sale_allocations.id`与库存负流水的`source_line_id`相同。改单减量先写` sale_release_lines`数量/金额，再传该已持久化金额给库存恢复；改价不改段，增量仅新扣差额，改仓/改商品/显式批次调整只释放重分配受影响余量。默认释放和退货采用后扣先退，也支持完整、无重复的管理员原段选择。新派生行通过`revision_allocation_links`继承原段，不因明细ID变更重复扣库。

## 金额与已退历史

金额按分使用`bigint`，原输入单价按百万分之一元和倍率构成有理数计算。基础单位显示价最多六位，不能反向重算金额。整单优惠与抹零合并按行原金额最大余数分摊；已退历史优惠固定，余下减免只分配给可编辑行。净额可以小于成本产生负毛利，总优惠不能超过金额。

退货净信用采用原行净额累计比例、末次承接剩余尾差；原小计信用按原小计累计目标分摊，并保证本次及余后净额都有足够小计承接，优惠信用为小计与净额之差。不能分别舍入净额和优惠后人为增加历史小计；成本按原消耗段的累计“已释放+已退货信用”共同占用分摊。确认信用立即减少客户净往来，既不返库也不退款。返库再按已持久化退货来源成本分次恢复，因此允许“信用0.00 → 改单释放0.01 → 实际返库0.00”，不能按返库时间重新估值。

已有退货的明细首次改单时规范化为只读已退历史段与基础整数余量。首次使用原行ID设置数量时，输入仍表示原单位的总量，系统扣除已退量；低于已退量或删除原来源拒绝。规范化后返回的新可编辑行ID只表示余量，其`quantityBase`为可编辑基础数量，`quantity`为`null`；后续命令`quantity`使用其基础单位整数。只读历史行不能修改或删除。历史与余量仍共同组成商业总额，再独立减去退货信用，避免重复扣减。

例如原1件=12瓶，成交10.00，退3瓶信用2.50；将剩余价格改为原件价11.00，历史保持2.50，余9瓶金额8.25，订单商业总额10.75；显示基础价0.916667。余量再改8瓶为7.33，账务使用11/12而非0.916667。

## 客户、作废和损失

更换客户通过财务端口读取该单所有未被冲正的销售/退货商业来源，按原业务日逐笔冲正旧客户并重分类新客户；本次金额差仍归原确认日。账户摘要同时给出旧、新客户前后净额。实际收退款主体、金额、发生日期不搬迁，旧客户无效核销由财务端口释放。

仅已确认且未配送的订单可以作废。作废从原段恢复“已出库-已改单释放-已实际返库-已作废恢复”的余额，吸收关联退货为`absorbed_by_void`，拒绝继续返库；逐项冲正有效商业来源并撤销明确损失剩额，现金保留为客户余额。已配送仍可改单与退货。

`pending`退货不产生损失。明确`not_returning`按原成本写`return_not_returning`损失；后来实际返库写`return_loss_restock`负金额，作废写`return_loss_void`剩余负金额。每项均以原`returnAllocationId`作为`source_line_id`追溯，分次冲正不占用库存损益表唯一`reverses_id`；本组退货损失按费用正数、冲回负数求和；库存盘盈/盘亏另有收益口径，统一损益报表必须按kind归一后汇总，不能将所有来源原始amount直接相加。

## HTTP示例

确认草稿：`POST /api/v1/orders/{orderId}/confirm`，`{"expectedVersion":1}`。

只改价：`POST /api/v1/orders/{orderId}/revisions`，`{"expectedVersion":2,"reason":"纠正成交价","lineChanges":[{"op":"set","lineId":"原明细UUID","unitPrice":"11"}]}`。改单报价把此对象放入`POST /api/v1/orders/quote`的`{"orderId":"订单UUID","revision":{...}}`。

退货信用：`POST /api/v1/orders/{orderId}/returns`，`{"expectedVersion":3,"reason":"退三瓶","lines":[{"lineId":"当前可退行UUID","quantityBase":3,"restockDisposition":"pending"}]}`。

实际返库：`POST /api/v1/returns/{returnId}/restocks`，`{"expectedVersion":1,"restockedAt":"2026-11-10T01:00:00Z","lines":[{"returnAllocationId":"退货来源UUID","quantityBase":1}]}`。此版本是退货版本而非订单版本；不增加商业应收，不登记退款。实际时间支持补录但不能在未来。

以上写请求均需要合法会话、Origin、CSRF与独立幂等键；UUID占位符须替换为真实来源。返回格式、最大精度与角色字段使用OpenAPI校验，不在这里复制全部契约。

## 已执行验证与待联调

真实PostgreSQL测试位于`apps/api/test/sales.db.test.ts`，覆盖事务确认、只读报价、版本和幂等、配送、已配送改价、增量与缺货回滚、退后规范化、分次返库、损失/作废、客户迁移、库存并发、错序分值尾差及员工深层投影。最新结果以实际测试输出及独立验收报告为准。

当前版打印状态已接打印模块只读来源，查看旧版订单仍按实际当前商业版本计算状态；打印不以订单商业版本记录。打印服务联动、打印机、前端视觉确认、真实业务资料仍需单独验收。


## 报价行关联 metadata

已有行的改单set计算会重建临时PreparedLine，现明确保留请求原lineId为对外CalculatedLine.sourceLineId，不借rowId伪造持久化来源。首次部分退货拆分的保护/余量同sourceLineId，以readOnly区分；无退set和同商品多行亦各自保留来源。新增add沿用请求NewOrderLine.clientLineId且sourceLineId为null。保存后刷新当前订单，下一轮用新当前行ID；临时derived clientLineId不作已有行关联。此修复只补内存quoteSourceLineId，没有迁移/API/schema/金额/库存/版本写语义变化。

真实PG回归 `apps/api/test/sales-quote-correlation.db.test.ts` 覆盖1件12退3的初始3+9/改价后3+9关联、同商品两条已有行与新增行不串、重复报价及全业务表指纹不变。准确前端显示/输入recipe见 `docs/frontend-contract-recipes.md`，不向CalculatedLine增造quantity/unitPrice/unitName等字段。
