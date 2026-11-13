# 前端早期接口与身份架构只读核对

日期：2026-11-11。施工快照，**不是最终前端验收**。只读审阅`apps/web/src/api/client.ts`、`api/types.ts`、`context/AuthContext.tsx`与当前共享OpenAPI；未修改前端、未编写前端测试、未执行尚在施工中的前端全局检查。页面未完成不列为功能缺陷；本文件中的问题是已存在封装与契约的明确矛盾，不代表页面已实际触发。后续实现者修复后须重新核对，当前行号仅对应本次快照。

## 需要Gemini先修的已确认问题

| 优先级 | 来源 | 已确认矛盾与影响 |
| --- | --- | --- |
| P1 | client.ts:411–412 `confirmOrder` | 只有订单ID与key，不发送正文。契约必须`VersionInput={expectedVersion}`；按现封装调用必然不能确认，页面无法通过它传入版本。 |
| P1 | client.ts:119与各写封装，如403–408草稿、191–196账号、210–218商品、486–487月结 | request仅在显式传key时加`Idempotency-Key`；这些wrapper既不传key也不接收key，而契约要求该头。即使正文合法也被拒绝，且UI没有沿用同意图key的入口。应按各操作契约接受/传递业务意图key，不是给每个fetch无条件换key。 |
| P1 | types.ts:77 | `Schemas['ReportRun']`引用不存在schema；当前getReportRun响应为`ReportResult`。已静态遍历所有Schemas别名，仅此名称不存在；未宣称已运行前端tsc。 |
| P2 | client.ts:210–218、客户地址封装、431 | 手写输入漂移：ProductCreate.baseUnit需要`name/defaultSalePrice`，不接受`isBase/precisionDigits`；AddressInput使用`address`，不接受province/city/district/detailAddress；DeliveryInput是`not_delivered/delivered`，不是pending。JSON原样发送无法满足契约。 |
| P2 | client.ts打印与公司封装 | createPrintJob仅接templateVersionId，缺必需orderRevisionId/clientPlatform；getPrintData查询应是revisionId/templateVersionId，不能传templateId；模板新版本需要expectedVersion、响应为PrintTemplate；CompanyPatch需要expectedVersion与phone，而非contactPhone。均应先对齐实际契约，再接页面。 |
| P2（使用时必现） | 多个列表query手写`after` | 契约分页参数是cursor，`after`是额外字段，使用该参数会400；listCashEvents的kind也不属于现有查询参数。尚无分页/筛选页面调用证据，不把未使用的功能当已失败场景。 |

建议Gemini从现有`OperationRequest/OperationResponse`或对应schema复用请求与响应类型，逐个核对79操作中实际要使用的封装，避免只在返回类型处断言`T`、请求正文仍为unknown导致漂移。Response也应分别核对：订单列表不是完整OrderAdmin/OrderPublic数组，余额应用返回CustomerBalance而非LedgerEntry，地址创建返回Address而非Customer。

## 暂未发现明确冲突与待观察

- fetch使用`credentials:'include'`，写请求携带当前CSRF；getSession/login成功后更新CSRF，logout成功后清除。与匿名挑战/登录轮换的后端流程一致。尚未通过真实页面运行证明会话恢复与跨端Cookie行为。
- 金额主体类型复用共享schema，Money/UnitPrice仍是十进制string；请求JSON不在封装层转成Number。尚无页面金额计算源码证据，不能据此宣称整页精度通过。
- recordCashEvent、confirmReturn、recordRestock等允许调用方显式传key；**没有认定它们无条件换key**。默认参数会在未传key的每次调用生成新值，必须观察页面是否按“业务意图”持有key，超时重试传回旧值，修改正文才换新值。
- AuthContext有refreshSession入口，但未来401/403如何更新身份、登录前是否等待挑战、登录/刷新并发响应如何处理、失败退出是否正确提示，均待页面接入后验收，不先列成已确认缺陷。

## 请Gemini补齐的验收案例（由Gemini编写/执行）

1. 从匿名session挑战登录，使用轮换后的CSRF执行真实受保护写入；旧CSRF/缺令牌失败，刷新后继续成功；员工无法管理业务。
2. 所有实际写入wrapper携带所需幂等键和版本。收款请求模拟“服务端已成功、客户端超时”，同一意图重试必须相同key与正文，仅一笔现金记录；用户改变金额或分配方案后使用新key。
3. 确认订单实际发送expectedVersion；旧版本拒绝、相同key重放不双扣；报价类只读POST按自身契约，不强加不存在的幂等要求。
4. 依据共享输入schema覆盖商品/单位、客户地址、配送、模板/打印、余额应用，验证没有额外字段、遗漏必填或错误响应类型。分页实际使用cursor读取下一页，不静默过滤局部页。
5. 使用高精度单价与分值尾差样例，保证发送/显示以原始十进制string和后端金额为准；多商品会话及订单页修改后仍关联稳定行，不把同商品不同行合并。

后续前端稳定后再由非Gemini作者运行实际存在的typecheck/test/build和只读源码验收。修复与新前端测试回Gemini/主代理Computer Use处理；本轮没有操作线上凭据或输出测试账号秘密。
