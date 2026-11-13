# 订单写流程异常的后端/契约独立诊断

2026-11-12。先CodeGraph（未索引到当前页面/route实际模块），再只读new frontend test与生产OrderCreatePage/OrderEditPage/OrderQuoteSummary及生成OpenAPI。没有改前端、生产后端、契约或输入校验，没有用dev/Mini；只另建一个独立comparison-report-fixture的私有PG+动态HTTP测试。

## 实际HTTP与schema结论

`node --conditions=development --import tsx --test apps/api/test/order-payload-boundaries.db.test.ts`：1/1 pass、fail0/skip0、exit0，1.96秒；`npm run typecheck -w @huoyoupu/api` exit0。结构化公开响应见 [order-payload-facts.json](order-payload-facts.json)，没有凭据/cookie/CSRF/连接串。

| 输入 | 实际响应 |
| --- | --- |
| 同一独立SKU、同仓两条clientLineId不同，各quantity20，unitPrice分别`'2'/'3'`，discountAmount`'0.00'`，实际stock31 | HTTP409，code=INSUFFICIENT_STOCK，message=所选仓库库存不足或需要补选批次，retryable=false，无details |
| 同上quantity改2+2，discountAmount`'1'` | HTTP400，code=INVALID_REQUEST，message=请求不符合接口约定，retryable=false，公开body无details |
| 同上discountAmount规范为`'1.00'`，roundOffAmount`'0.00'` | HTTP200合法OrderQuote，subtotalAmount10.00/discountAmount1.00/totalAmount9.00、两行独立、stockReserved=false |

这些报价后，fixture全部业务表指纹保持不变。不是后端多行库存/优惠算法bug。

合法请求形状（所有ID替换为本fixture真实UUID）：`{customerId, lines:[{clientLineId:'independent-0',productId,warehouseId,unitId,quantity:2,unitPrice:'2',allocationMode:'auto'},{clientLineId:'independent-1',productId,warehouseId,unitId,quantity:2,unitPrice:'3',allocationMode:'auto'}],discountAmount:'1.00',roundOffAmount:'0.00'}`。fixture客户有正常HTTP创建的默认地址，省略addressId由既有规则解析，不伪造地址或修改生产API。

OpenAPI Money必须`^(0|[1-9][0-9]{0,17})\\.[0-9]{2}$`，即金额恰两位小数；UnitPrice允许整数或1–6位小数，所以`'2'/'3'`合法而Money`'1'`不合法。不可为此放宽后端schema。

## 生产UI确定的格式化缺口

new frontend test case1实际上调用`fillDiscount(page,'1')`，不是`'1.00'`。OrderQuoteSummary的onChange直接传e.target.value；OrderCreatePage报价及两处建单payload用`discountAmount || '0.00'`原样发送，OrderEditPage revision payload亦如此，未按Money格式规范化。故原selftestquotes[[409,null],[400,null]]与真实后端响应一致，不能将第二次400认定库存/报价后端错误。

需由Root/前端owner在金额输入或提交边界精确规范化Money（优惠/抹零）并保持意图/校验语义，既不能使用Number浮点重算金额，也不能仅把测试输入改两位掩盖真实用户输入整数时的产品缺口。Codex未修改前端或编造响应。

## Case6：版本与正确接口

真实同库正常HTTP序列：

1. 已confirmed订单：order.version=2，revisionNo=2。
2. POST `/orders/{id}/delivery` `{expectedVersion:2,deliveryStatus:'delivered'}` → order.version=3，但revisionNo仍2，说明两者不能互换。
3. 外部POST `/orders/{id}/revisions` `{expectedVersion:3,reason:'真实外部空行更正',lineChanges:[]}`，正常新幂等key → HTTP201，order.version4/revisionNo3。空lineChanges合法，不要求改金额才可形成商业版本。
4. 再以旧expectedVersion3提交 → HTTP409 VERSION_CONFLICT，公开details=`{expectedVersion:3,actualVersion:4}`，不增加商业版本。
5. GET订单刷新真实version4，再以新幂等key/new payload提交空行更正 → HTTP201，order.version5/revisionNo4；历史仍有外部更正reason。

quote只是POST `/orders/quote`，改单写是POST `/orders/{id}/revisions`，不是PATCH或confirm。并发版本用order.version，**不拿revisionNo充当expectedVersion**；内容改动/刷新新意图用新key，不拿缓存失败key改body。此序列的库存31瓶/成本31元、客户账户数值均不变。

初次本测试将GET结果整个asOf也做相等比较而失败，随后只排除合法变化的读取asOf、保业务数值/行内容完整比较后通过；这不是生产故障或放宽版本/金额断言。最后自己的HTTP/随机库/私有PG均已close，没有业务流量发往97364/42535/5173或Mini。只新增后端定向测试与本事实记录，不跑旧全套。
