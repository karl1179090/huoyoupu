# GLM CLI 接管：真实阻挡与恢复入口

2026-11-12（Asia/Shanghai，含11月11日晚历史）。用户已授权本轮以前端专属Claude Code CLI＋GLM替代Antigravity，不再等待Gemini额度；Codex仍不代写前端，不改AGENTS长期规则或任务状态（43/56）。本代理只读核验，没有发起新模型/网络请求、测试、API或GUI。

## 实际结果

root已安装CLI2.1.319；显式模型`glm-5.3[1M]`，轻量无工具请求曾返回`GLM_READY`（root提供的成功记录，route canonical `glm5.3[1m]`）。这仅证明该次无工具请求成功，不代表能够读文件或已开始实现。没有改全局配置、付费或输出密钥。

随后四次日志均真实包含网关`www.nexavlinks.com`的HTTP524、120秒origin read timeout；逐条JSON核对`is_error:true`、assistant tool_use=0、permission_denials=[]。终端result虽然写`subtype:success`，**不能据此写成功**；result正文是API Error。root已确认四个exec session均exit1，未继续自动重试。

| 尝试 / 私有日志 | exec session | 日志session ID | duration_ms |
| --- | --- | --- | --- |
| 正式首任务 / stream.jsonl | 80476 | c343fa3d-a8fb-4f1b-8e0f-3a03fa2d3a16 | 130751 |
| 短Read先行重试 / retry-stream.jsonl | 85276 | e7c2257b-5783-4ebc-a338-506451f3d418 | 129035 |
| safe-mode单Read / read-smoke.jsonl | 97088 | 7ff76f90-eb02-405a-b876-086d20c7b02f | 128691 |
| raw glm5.3、max output1024/MAX_THINKING0/beta兼容单Read / compat-read.jsonl | 39431 | 9c1de52c-c356-4140-8ae2-8a5914a66c58 | 129185 |

最终追加两条标准路径后，**合计六次工具请求均524，实际tool_use均0**，不是仅四次兼容参数失败：

| 新增路径 | 已退出exec session | 实际结果与时间 |
| --- | --- | --- |
| 原生默认52 tools，CodeGraph/ai-memory MCP connected；`--model sonnet`实际映射glm-5.3[1M]；native-read.jsonl | 84600，exit1 | is_error=true、permission_denials=[]、duration129803ms；网关UTC 2026-11-11 15:54:28，即上海11月11日23:54:28，524且0tool |
| 标准交互TTY（不用-p），glm5.3[1M]/acceptEdits；仅要求Read package.json | 72148，正常/exit后exit0 | 请求仍524，网关UTC 2026-11-11 16:05:48，即上海**11月12日00:05:48**；assistant错误记录16:05:49.055Z，实际Read未发生。正常关闭进程exit0不能当请求通过 |

只读核查第二条指定transcript：`/Users/dev/.claude/projects/-Users-dev-Desktop-Project-HuoYouPu/ece8e321-df18-4a48-87cc-c1495265a25b.jsonl`；未扫描其它个人会话。原前五次错误均属上海11月11日夜间，第六次跨至11月12日。交互中正常确认本项目信任，不是付费授权或私改模型；默认全局模型/auth未手工修改。CLI安装及此前轻量GLM_READY不证明编程工具可用。root已向用户询问恢复现网关或另一份**本机配置名**，不聊天发送密钥；不再自动请求。

失败发生在工具实际执行之前，现有证据不支持归咎于文件权限拒绝，也不能据524确定究竟网关还是上游模型内部原因。下一步由root协调网关恢复或用户本机另一有效配置；不在聊天发送密钥，不自动换其他模型。

## 前端落盘独立核验

私有恢复目录`/tmp/huoyoupu-claude-5hDABR`为0700；含`frontend-task.md`、`before-manifest.json`、`before.tar.gz`与上述JSONL/对应stderr。没有读取`~/.claude`认证配置。

按before清单所定义的**完整src/test中.ts/.tsx/.css＋五份根NOTES**重新枚举：before67、当前67，新增[]、删除[]、SHA256修改[]。不仅检查原67存在，也比较了当前集合，未漏新增源码/测试。归档SHA256为`edb2db060ccde1437b2df0825b95760d3606b887e1797f3c99fe827930e43ef8`。其余四个web入口/配置（vite.config.ts、tsconfig.json、package.json、index.html）不在before清单，不能伪称有其before hash；当前mtime均早于00:30、早于23:23接管，配合四次零tool_use未见CLI修改证据。截图/构建产物不属于这67份代码清单。

因此本轮CLI**没有前端编写成果**。A21的derived原价继承P1、A两测试错误、B人工收款option等待/余额420基线、D错误cleanup与停用测试半前置、C模板完整游标问题均保持原状；准确修复要求见`frontend-task.md`和[最新独立串行结果](frontend-quota-result.md)。已验后端metadata、退改返91/成本91/净应收27、C PDF及Mini能力不因此失效。

11月12日最终只读再枚举完整67文件集合，新增/删除/修改仍全部[]。另foundation已实际完成v3最新API/web双镜像重建、HTTPS metadata及静态/ledger 2/2并安全stop，见[容器报告末v3](fullstack-container.md)、[v3结果](fullstack-v3-result.json)及`fullstack-browser-v3.tap.txt`/quote fingerprints；保留其已运行边界，不等于前端derived原价继承P1已修，43/56不变。

恢复时由单一前端owner读取原任务文件，显式指定用户授权模型，先确认能执行一项只读工具再接原任务；不要把旧四次失败继续算实现进度。后续验证/服务重载仍由root串行协调，最新源最终需统一构建API/web镜像。不得为额度/网关失败回退源码或降低断言。
