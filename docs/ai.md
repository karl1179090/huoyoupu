# AI只读统计接入

`registerAi(app,deps,{model?,timeoutMs?,reportOptions?})` 注册管理员POST `/api/v1/ai/queries`；默认app已经装配。`ModelAdapter`只提供`plan(input,signal)`及可选`explain({report,canonicalSummary},signal)`，无Pool、数据库凭据、业务写接口或SQL执行工具。运行前先复核当前管理员会话和CSRF；员工403发生在访问模型之前。

生产由API进程读取`AI_API_KEY`或`AI_API_KEY_FILE`、明确的`AI_MODEL`，可选`AI_ENDPOINT`。key和model必须成对配置；未配置时保留路由并返回503 AI_PROVIDER_UNAVAILABLE，可用普通报表。不选择隐含或所谓最新模型，不向客户端发送密钥；请求body和模型错误正文不记录日志。适配器使用原生fetch，HTTPS（本机协议夹具可HTTP），禁止重定向，最多读取256000字节响应。

## 官方协议依据与验证边界

已使用OpenAI Docs技能核查官方[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)的Responses `text.format`、严格JSON schema以及所有字段required/可选null的约束。本机没有可调用官方文档或key管理专用工具，因此采用官方文档搜索后实际打开页面，并核对请求结构。适配器使用`/v1/responses`、明确model、`store:false`、Bearer仅Authorization头，不提供任何执行工具；输出仅解析completed消息的output_text，拒绝refusal、不完整、非JSON或超长结果。ReportQuery以queryJson字符串封装，后端再用既有严格契约解析，避免把业务optional/$ref定义误当作服务商严格schema子集。

目前验证为本机协议夹具和真实数据库业务测试，未持有或调用真实外部provider凭证。真实模型服务配置仍待部署输入；协议夹具通过不代表某一外部模型账号、额度或模型可用性已经验证。

## 意图与候选

模型只能输出query/clarify/unsupported、ReportQuery、实体名称/编码和澄清问题。额外字段、任意SQL、未知分组/过滤、无效时间和模型自行填实体ID均拒绝；模型意图不提供权限。用户直接要求改库存/订单/资金或执行SQL也先拒绝。查询参数最终仍走统一报表的完整业务校验。

客户、商品、仓库和批次由服务端固定SQL的绑定参数检索。商品支持名称、代码、助记码、条码；客户/仓库支持名称、编码；批次支持明确ID或ID前缀。只读取候选id/code/name，不读取联系人、电话、地址或凭据。唯一匹配才选择；多匹配返回明确候选，零匹配返回补充提示，候选超过100返回超限而不截断猜测。

澄清持久化在008_ai的ai_query_runs，后续输入须带clarificationRunId和答案；记录绑定原管理员，候选答案必须精确且唯一匹配原候选ID/标签。已解析条件沿用，不通过再次模型推理猜一个实体；一般期间歧义的补充说明才重新调用plan。每个后续run追加保存并关联parent，不覆盖旧回答。

“本月/这个月”且没有完整月或明确日期范围时，后端独立采用mtd_previous，不允许模型悄悄切换完整月。用户明确自然月或具体日范围则保留模型给出的合法条件并显示实际期间。比较默认下单量，净销量须合法指定；两者与退货量分别显示，输出明确比较变化口径。

## 证据与降级

AI直接调用`queryReport`，回答中的report ID、规范化query、两期区间、基础单位、asOf、精确金额及来源和固定报表完全一致。模型从不计算或修改结构化数值。普通报表GET同一ID读取原快照，不另做一次当前查询。

解释只允许返回与后端canonicalSummary逐字一致的摘要；不一致、额外字段、拒绝、无效输出或解释超时均使用确定性摘要。摘要标明本页及后续页，最多展开前5行；结构化表格和同ID分页保留全部查询结果。回答最多附1000条来源，更多来源明确提示按report ID继续读取，不宣称已经附全。空表说明当前筛选/期间没有匹配，不泛化为其他范围无业务。

plan超时返回可重试503，尚未产生报表或业务写入；已取得合法查询且解释失败时返回真实报表加确定性摘要。模型等待在所有业务事务之外，每次模型调用默认15秒并传AbortSignal；同管理员仅一个进行中的AI请求，竞争请求429。报表自身来源上限/SQL超时/快照过期继续使用统一错误，不转为虚假成功或零数据。
