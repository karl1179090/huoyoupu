# AI统计后端独立验收

结论：**13.1、13.2通过本轮后端独立验收**。验收者没有修改AI实现。曾发现合法统计措辞误拦截的P2问题，作者已修，最新实际复跑通过。

## 实际执行

- `npm run test:db -- apps/api/test/ai.db.test.ts docs/verification/build-web-inventory-v1/ai-independent.db.test.ts apps/api/test/routes-contract.db.test.ts`：真实PostgreSQL18，**5/5通过，exit0**；其中独立AI3项、作者AI1项、79操作路由覆盖1项。
- `node --import tsx --test apps/api/test/ai.test.ts docs/verification/build-web-inventory-v1/ai-transport.test.ts docs/verification/build-web-inventory-v1/ai-request-boundaries.test.ts`：**6/6通过，exit0**，包括本机真实HTTP传输与实际Fastify输入管线。
- `npm run typecheck -w @huoyoupu/api`：exit0。
- 公共`app.test.ts`也已独立重跑2/2通过。

## 13.1：适配器、候选与白名单

独立启动本机HTTP服务，通过真实fetch/Responses JSON信封验证配置模型、Authorization头、store=false与strict结构化输出；不是只mock fetch函数。服务端key仅在provider请求头，提示/问题/报告体中没有key；provider错误体故意包含key，客户端只收到脱敏503。外部明文HTTP端点拒绝，原生请求配置redirect=error。

实际API验证员工请求403且模型调用计数不增加；SQL自然语言、明确业务写请求、模型额外SQL字段、自行指定实体ID和非法选择均拒绝，不增加报表或业务事实。真实两个“华联”客户返回候选，澄清前report_runs为0，跨管理员使用澄清ID返回404，错误候选422；明确选中后只返回该客户。相关联系姓名、电话和详细地址没有进入模型请求。

未配置模型时API已注册，但返回可重试AI_PROVIDER_UNAVAILABLE/503，AI和报表结果表均不生成成功记录。模型计划超时503，同管理员重叠请求429，无库存、商业分录、账户版本或现金改变。

发现并修复的P2：合法“统计本月新增退款金额”原被`新增…退款`关键词误判为写操作，422且不调用模型。作者修改为分句与统计动词管辖判断后，独立正向“查看本月退款金额”“查看库存增加趋势”“统计本月新增退款金额”均进入模型澄清；“先查看本月退款，再增加商品库存10瓶”“统计完成后修改订单价格”仍422且不额外调用模型。没有修改或弱化验收案例迁就实现。

实际HTTP输入管线对未知media、非法JSON、声明Content-Length与实际不符、AI未知SQL字段、超长body均返回400 INVALID_REQUEST/retryable=false，响应不回显私密sentinel。

## 13.2：统一结果、解释方向与异常降级

作者固定真实数据库夹具已由验收者实际重跑：上月10瓶、本期0购买仍进入下降结果，−100.00%，基期净销售20.00；单位/退货单列、模型编造999.99解释被丢弃。同一reportRun通过普通报告接口逐字段重现，按返回规范化query重新查询时数值与watermark一致；来源绑定原订单revision。

独立精度案例：选中客户净往来12.34，故意错误模型摘要999999.99被确定性摘要替代；后来实收1.00，旧reportRun仍12.34。新查询证据11.34，模型保持数字却将“应收”改“可退款”，也确定降级为正确“应收11.34”，说明不仅比较数字。模型解释超时仍保留合法报表并返回精确摘要；模型计划超时才返回可重试失败，不生成虚构结论。全过程前后实际业务操作、账户、商业分录、现金、库存逐字段不变（测试中明确实际登记的1.00实收除外）。

`本月`默认已实际纯测试按MTD/ordered，明确完整月或日期保留显式条件。实际输出包括规范化条件、Asia/Shanghai时区、截止、两期、单位、结构化精确值、同一reportRun及来源，不以模型叙述改写数值。

## 边界

本轮没有调用真实外部模型账户，没有真实provider凭证和费用验证；本机协议夹具证明适配器实际传输、超时与安全边界，不能证明真实模型的自然语言识别质量。配置真实模型后的问题集回归和13.3前端仍待执行。真实业务资料、前端与打印设备也不属于本轮后端结论。
