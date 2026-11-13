# 最终差异审计

2026-11-12。**当前56/56完成，用户最新验收范围与最终Mini v6证据已完成差异审计；不归档、不commit。**用户已认可所展示电脑/手机视觉；真实安卓及系统服务预览、全新空业务初始化均已独立验收，实纸和真实期初不再是本轮前置。本代理只读核验及维护授权文档/checkbox，未运行新代码测试、GUI或容器。早期验收状态保留历史。

## 十项规格对照

逐项对照活动变更十份spec、design、共享契约和独立记录，不以测试名称、作者summary、准备case或截图文件名替代实际分支。

| 活动规格 | 有效证据与最终边界 |
| --- | --- |
| access-control | [身份独验](auth-result.md)、A电脑/400角色/恢复/CSRF与Mini权限链；[C员工真实预览](frontend-c-independent-result.md)管理GET0、默认print-data200、OrderPublic无成本。11.3重开后已据新证恢复；不称安卓真机通过 |
| product-catalog | [资料后端](catalog-result.md)、[D7/7](frontend-deepseek-d.log)：500mljy/人工校正、单位、前导零条码、商品停用旧引用/新交易约束、移动表单；12.1已验 |
| customers-pricing | 后端历史→专属→默认同单位优先级；D多地址/专属价/历史按钮真实精确revision落点；最终订单迁客保旧快照/现金实证补齐，不重复资料CRUD |
| inventory-batches | [库存](inventory-result.md)及[真实GUI](frontend-deepseek-a-result.md)：实际成本/补录双时间、快照内批次变化stale重建不覆盖、整数/盘盈成本阻断、手选不足补满。新增独立批未改原批并非必stale，旧误判已纠正；12.2已验 |
| sales-orders | [销售独验](sales-independent.md)、[A长单/底栏7/7](frontend-a-independent-result.md)、[最终订单六业务](frontend-order-write-independent-result.md)：联合缺货、raw1规范1.00/总9、非法金额清旧quote、create/confirm各自丢响应原key重放、编辑换key、409刷新201、迁客/作废；12.3/12.4各自完成 |
| sales-returns | [真实退改返](frontend-sales-return-gui.md)：退3信用6/现金0，原仓原批分返1+2，第二次最多2/待0，最终91/成本91/净27；净0价格继承和来源/尾差/重复回补独验保留；12.5完成 |
| customer-settlements | [财务](finance-result.md)及[B10/10](frontend-c-loaders-ab-result.md)：人工100+50、独立余额50→30→20、退款200→150、期初核对、旧stale/新月结/固定分页与来源；12.6完成。新版14.4空业务初始化已另独验，原虚构期初不冒称真实导入 |
| delivery-printing | 后端固定版本/无商业副作用，合法241×93/A4/A5短长PDF逐页核/长名/表头/合计/上海时间，原生对话框/人工状态；[C4/4](frontend-c-independent-result.md)四配置真实发布、双旧UUID/config/CSS/job及人工取消；12.7完成；新版14.2系统服务及真实安卓预览已验，无实纸前置 |
| business-reporting | 统一指标后端独验；[真实比较页](frontend-report-comparison-independent-result.md)两期/三类真实row/同run三页/零新POST/指纹及390左右结果，固定来源/员工证据组合；12.8完成。limit1受控页长不是生产默认或容量 |
| ai-reporting | 后端只读白名单/澄清/证据；[C完整同run与来源](frontend-c-independent-result.md)、旧合法双端条件/表格及真实503降级；13.3完成。AiResult夹具引用真实report/sources，不冒称真实provider质量/费用 |

Ccase1b仅直接观察迟到A后B配置/选择保持；未展开历史versions列表的边界仍留，不冒称所有race已测。组件guard另有源码独审，不新增原文外门槛。

## 最新源、契约、产物

- [Money源审](frontend-money-source-review.md)与[独立结果](frontend-money-independent-result.md)分别记录：精确字符串补Money两位、raw保留、invalid清quote/禁提交，不改UnitPrice/数量/priceBasis/intent；pure9不能代替UI，最终订单真实raw1/非法输入已补页面证据。
- 最终订单[原始TAP](frontend-order-write-complete-independent.log)为1准备＋6业务，7pass/0fail/0skip/0cancel、23829.928292ms，types0；[60文件基线](frontend-order-write-complete-baseline.json)changedAtEnd=[]，本代理重算当前亦0drift。case6真实外部201→旧UI409→自动GET/新版quote→新key/expectedVersion201→离开Edit精确orderNo→current原因及外部历史均实际到达；前失败保留历史，不当最终现状。
- 本代理完整JSON深比较规划OpenAPI与contracts/generated/openapi.json相等：153 schemas、79 operations；[90文件保护](fullstack-v5-protected.json)完整枚举90→90/增删改[]。授权backend test factory属隔离支持，不shipping、不算生产越界。
- 本代理比较[v4](fullstack-source-manifest-v4.json)→[v5](fullstack-source-manifest-v5.json)及当前本机shipping：146文件，仅Create/Edit修改、moneyInput新增，无删除/当前drift[]；archive SHA256为7751eb00d09e6075a7251b9457d81752017693d4d72390743af40c9114433ab1，由构建者在Mini复算一致。本代理未重新下载/构建归档。
- [Mini v5最终记录](fullstack-v5-final.md)、[原始TAP](fullstack-browser-v5.tap.txt)、[result](fullstack-v5-result.json)：未变API输入复用396b979，新web f9a7a050真实Linux/arm64构建；严格CA/IP SAN/当前leaf pin。Node静态82.2465ms、真实Edge角色/旧revision/batch/ledger3078.0475ms，2/2总3440.60475ms；最终zero-business-write/0reload/0员工受限请求真到，四服务Stopped。不是生产公开发布、系统CA信任或实物出纸。14.3保留；旧47表恢复按原版本范围复用，未伪称新镜像重跑恢复。

## 参考图与实际实施渠道

保留docs/ui/build-web-inventory-v1原v1/v2/v3草图及用户方向、[最新净图/manifest](../../ui/build-web-inventory-v1/latest-implementation/README.md)。旧v3在当时未获用户最终视觉接受；“确认按钮放下面”已在design/tasks与电脑/400及350所测Edit实际几何对应。旧400/350 Edit pending图按原限制，不替代后来有效报价/提交，也不冒称350 Create已测。

前端最初由Antigravity/Gemini经Computer Use实施，额度中断后用户本轮授权外部Claude Code CLI替代；GLM六次524无编写成果，后来DeepSeek真实工具/前端实施，Sol非作者独验。Codex没有代写前端，AGENTS长期规则/业务spec未被改写。design旧“Working/Antigravity”保留当时交接历史，当前渠道由明确用户方法覆盖及实际记录说明，不声称原Gemini完成全部新改动。

## 用户调整后的两项验收已完成

- **14.2**：[真安卓/系统打印](android-real-independent-result.md)与[Detail修后独验](frontend-detail-independent-result.md)，组合既有电脑原生窗口、合法单多页/长名PDF与C旧订单/模板双UUID重打，覆盖新版全文。SM-G981N/Android13/Chrome157、360×718 DPR3真实三行开单/14.50并确认；修后长UUID及五操作完整，表格自身横滚，UTC07:05:35Z显示上海15:05:35，历史只读/旧版打印及desktop权限保持。系统PrintSpooler活动/原始树有两preview_page，BACK后仍requested。系统原生PNG两方式0byte，应用图不冒系统像素图，不声称原生内容清晰度或241×93系统纸型匹配；Android当时A4，未出纸，实纸不是本轮前置。
- **14.4**：[最终空bootstrap](empty-bootstrap-result.md)、[TAP](empty-bootstrap-final.tap.txt)与[独立8页空UI](empty-ui-independent-result.md)：真实随机空库/8迁移/47表/安全首admin，39业务表逐表0且库存/成本/往来/现金SUM0；重复migrate[]、重复admin拒绝无改、重启无seed。公司配置API保存并持久（不冒GUI保存）；浏览器8空页正常，报告合法零聚合。release后再核39zero并清理自有API/随机库/私有PG/私密文件。初始1admin与后续employee权限阶段分开，系统元数据/报告快照不当业务seed。真实期初与导入预检不是本轮前置，导入导出未来另提需求，未新增实现。

已知规模100–200商品/约100客户/日50单，[容量独验](target-scale-independent.md)按原范围保留；模拟一年/热缓存/-F/非Mini结果不是生产写SLA。真实AI provider质量/费用、生产公网DNS/ACME、物理打印清晰度/走纸未被冒称通过，不重新变成本轮已取消的设备/期初前置。

## 14.5独立判定（本次视觉答复前的审计记录）

十项规格、参考设计、角色契约、最新源/镜像与实际结果已逐项对照，软件范围未发现尚未处理的真实阻挡。旧失败与最新成功、作者/非作者、pure/API/真实页面/实物及fixture边界均明确。**最终差异审计工作已完成，可只勾14.5；不等于完成三个外部任务或允许归档。**该任务原文要求缺少设备等时保留相应待验，本报告已落实，不另设原文外“全部设备已齐才可记录审计完成”的条件。checkbox精确校验见随后记录。

实际精确更新：12.3 id43/tasks86行50→51；12.4 id44/tasks87行51→52；14.5 id56/tasks105行52→53。三次均分别保存apply前后完整快照、按sourcePath/line仅改对应checkbox并执行strict validate通过，再刷新apply；每次56项比较均只有该项done变化，描述及其它55项不变。最后机器断言仅11.1、14.2、14.4三项未勾；没有归档。

## 用户明确视觉验收与11.1关闭（2026-11-12）

用户对“这两张电脑、手机实际页面的配色、布局和底部确认按钮位置，可以通过最终视觉验收吗？”明确回复“可以通过”。对应[电脑1280×900实际Create图](../../ui/build-web-inventory-v1/latest-implementation/order-create-bottom-bar-desktop.png)与[手机仿真400×750实际Create图](../../ui/build-web-inventory-v1/latest-implementation/order-create-bottom-bar-mobile-400.png)。本代理核看两图，文件SHA256/大小与既有manifest一致；结合保留的设计参考、实际实现与独立验收记录，11.1的最终视觉确认条件已满足。认可范围为已展示实现的配色、布局及底部确认位置，不扩大为实体Android或针打纸面验收，也不改写旧草图当时尚未获接受的事实。

实际命令：先`openspec list --json`确认项目root，再`openspec status --change build-web-inventory-v1 --json`与`openspec instructions apply --change build-web-inventory-v1 --json`核53/56及11.1原文。按返回tasks.md第78行仅勾id38，`openspec validate build-web-inventory-v1 --strict`通过；刷新apply为**54/56**。前后56项机器比较仅11.1 done变更，描述及其它55项不变；当前仅14.2、14.4未勾。不运行代码检查/GUI，不归档或commit。

## 14.5最终刷新：最新范围、Detail与Mini v6

用户本轮范围已同步proposal/design/delivery-printing/tasks，既有库存、销售、资金及共享API语义不变，导入导出不追加。Detail源码本轮CLI old/new逆向重建起点哈希等于持久化前端基线；仅header/actions收缩换行及既有上海formatter显示替换，role/handler/历史只读/草稿确认逐字不变，无新增全页hidden掩盖。修后独立types/build0、订单7/7、真机/desktop图与[60文件结束及当前0漂移](frontend-detail-final-baseline.json)成立，旧失败保留历史。

[v6正式报告](fullstack-v6-final.md)、[result](fullstack-v6-result.json)、[TAP](fullstack-browser-v6.tap.txt)及[manifest](fullstack-source-manifest-v6.json)互证：146文件相对v5仅Detail/CSS两变、144稳，无增删/前后drift=[]；本代理另核生产源无新增删除。API输入仍同v3，实际inspect API396b979/webf60f3158。标准Dockerfile首次auth token连接reset未进编译，保历史失败；原样受控重试Linux/arm64构建exit0。严格CA/IP SAN/currentleaf下Node静态84.839917ms、真实Edge8716.605625ms，2/2、0fail/skip、exit0，总9094.591416ms；零业务写/0reload/员工0受限API终断言真到，finally四服务exited。

旧90仅v5历史已验事实，原私有逐文件baseline缺失，本轮不冒称重算原90；当前覆盖为持久化shipping146/生产源枚举及最终前端60无漂移，shipping不冒覆盖AGENTS等非shipping文件。授权新空bootstrap后端test不shipping。旧47表恢复、容量、TLS负向按原版本范围保留，不称本轮重跑。仅隔离Linux/arm64内部CA/IP验证，不冒公网生产发布。

14.4及14.2各自单独精确勾选/strict/apply，54→55→56，每次只自身done变、其它55项与全部描述不变；14.5本次依据最新范围、源与正式v6结果重新审计完成，不重复翻转已有checkbox。最终strict通过、apply56/56/remaining0；不自动归档、不commit，不把范围内完成称为所有设备/生产环境均已验证。
