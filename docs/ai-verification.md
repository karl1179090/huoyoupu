# AI13.1–13.2作者验证

2026-11-10，contracts/AI Agent；没有真实provider凭证，不作真实模型调用成功声明。

| 任务 | 实现及证据 |
| --- | --- |
| 13.1 | model/service/index、008/schema/ai；严格意图、SQL/业务写入/额外字段/非法组合拒绝，模型不得自行选实体ID；真实PG中两个商品和两个客户分别触发候选澄清，原候选ID续答不再调用模型，错误ID422；员工/CSRF失败在model计数前拒绝；仅把问题/时间与授权报表发送模型，客户电话/地址不进入提示。 |
| 13.2 | AI调用统一queryReport，同ID GET严格相等，与普通报表新执行rows/sourceWatermark相等；真实上月销售10瓶、本期0，下降100%，基础单位、退货0、净量分列且金额20.00/0.00为字符串；错误模型摘要999.99被确定性摘要替换；未匹配商品要求澄清不编0；模型挂起503、并发429，所有订单/库存/ledger逐字段不变。 |

实际命令：

- `node --conditions=development --import tsx --test apps/api/test/ai.test.ts`：4/4通过，exit0；覆盖协议请求格式、无工具、store:false、密钥仅header、原错误正文不泄漏、默认本月期间政策和摘要核对。
- `TMPDIR=/tmp npm run test:db -- apps/api/test/ai.db.test.ts`：1项综合真实PG/HTTP测试通过，exit0，无skip。
- `npm run typecheck -w @huoyoupu/api`、`npm run typecheck -w @huoyoupu/database`：exit0。

默认app的可选AI装配和生产env由foundation实施；其公共层、部署和外部协议独立验证另见docs/verification。真实provider model/key/额度与效果待部署配置，不阻止本地协议、契约和业务闭环复核。

独立验收发现“统计本月新增退款金额”被误识别成写入；已修当前分句统计修饰与后续命令的边界，并补合法2条/混合写6条纯回归。最新真实PG同时运行作者AI和非作者ai-independent文件：4/4通过，exit0，覆盖新增退款统计、查询后增加库存、统计完成后修改价格，以及同金额换方向叙述的确定性降级。非作者文件由其作者独占，本次仅运行未修改。
