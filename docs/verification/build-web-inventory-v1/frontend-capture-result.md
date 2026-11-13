# 冻结代码上的串行capture与独立产物验证

2026-11-11，主代理承诺capture完成前不启动任何源码修复后执行。本代理先归档旧56产物（含implementation图）及61代码hash：[before manifest](serial-capture-before/manifest.json)；两脚本完成后固定50份模块产物：[after manifest](serial-capture-after/manifest.json)，其中内容hash新增/变化37份，其余部分图片虽本次重新截取但字节相同。不是声称50张都新生成或全部逐图验收。前后61代码hash未变。

实际串行根目录命令：

| 命令 | 实际结果 |
| --- | --- |
| `node --import tsx apps/web/test/inventory-capture-screenshots.ts` | exit0；库存/批次/入库/盘点/往来/现金/月结双端采集完成 |
| `node --import tsx apps/web/test/printing-reports-capture.ts` | exit0；真实模板/配置、PDF、报表/AI/设置采集完成，脚本pageerror累计0 |

没有GUI/NodeRepl、没有并行capture/browser，没有改前端/测试/checkbox。capture包含本机API queryReport/模板创建等虚构数据写入，不是纯只读；凭据未输出。**A员工管理来源静默拒绝仍未修**，原A4/5失败不因两个capture exit0覆盖。本轮产物可在后续仅权限gate窄改且未触布局/打印时保留限定证据，不为凑总绿重跑无关capture。

## PDF固定版本与实际检查

使用PDF Skill，实际以bundled pdfplumber逐页提取MediaBox/文本，以Poppler pdftoppm渲染并逐页view全部不同页面（custom为needle同版别名）。未仅看CSS或文件大小。[逐页实测JSON及全文](serial-capture-after/pdf-inspection.json)，所有渲染png/逐页txt保存在after目录。

| PDF | 源mtime（+08:00） | SHA256 |
| --- | --- | --- |
| order-print-output-needle-241x93.pdf | 2026-11-11T12:41:37.910441+08:00 | `ff755f30940ee407a28e61fa3c5a8707bed1b631699f48ec7ac1c18d76f3022d` |
| order-print-output-needle-multipage.pdf | 2026-11-11T12:41:38.699026+08:00 | `55530c9806ddaaf99fd9a560cf2d70224c7fd24db9db36173ad80424eef9c6d3` |
| order-print-output-a4.pdf | 2026-11-11T12:41:34.664057+08:00 | `2947e908985a4eb690f019755c7db8cc641104091ed76fb54d85c6399efefb35` |
| order-print-output-custom.pdf | 2026-11-11T12:41:37.911556+08:00 | `ff755f30940ee407a28e61fa3c5a8707bed1b631699f48ec7ac1c18d76f3022d` |
| order-print-output-a5-landscape.pdf | 2026-11-11T12:41:38.274360+08:00 | `73ddf92872ab9fd27d47aa9ebe086b6e37a4db526c049d8ef64807a8d98bb66a` |
| order-print-output-multipage.pdf | 2026-11-11T12:41:38.482019+08:00 | `e8093073eeacd2324d55508b7a1f8a390e25a0b7eea18794fdbaa60b031201e9` |

| 产物 | 实测纸型mm / 页数 | 真实结论 |
| --- | --- | --- |
| A4短单 | 209.889×297.011 / 1页 | 两行单价10/金额10均完整，总计20出现一次，未见裁切 |
| A5横短单 | 209.889×148.167 / 1页 | 横向有效、六列表头与两行/总计完整，未见裁切 |
| needle-241x93与custom别名 | 240.961×93.133 / **2页** | 服务端合法模板且横向列宽容纳，八表头/两行全在第1页；第2页只合计/签名。**短单日常可用性未通过，不能只当分页绿**，见下 |
| A4 multipage | A4 / 2页 | 长名标号1–28及结尾完整，首14/末14行不跨页半截、每页六表头；数量10–37×150，行合计98,700.00，与末页唯一应收98,700.00一致，旧20/98700夹具矛盾已修 |
| needle-multipage | 240.961×93.133 / 3页 | 第一页行1、第2页2–7、第3页8+合计；1–8长名完整，每页八表头、无右裁/断行；数量5–12×85合计5,780.00，与唯一应收一致。仍是browser PDF，不是连续纸实际进纸 |

本次needleConfig先经真实POST /print-templates持久化并返回template id `0dd65dfc-9d0f-4f25-801b-b3b0a5149e52`、version UUID `5f07f9d6-c0f1-4621-88a3-179b7525dfc3`，再真实指定版本getPrintData；columns合计201mm、margin5/边、可用231mm，合法。不同于C3只改paper却保留超宽columns的旧fixture。长单仍由route替换行/金额用于布局，但金额自洽；不伪称后台实际创建了该28行/8行订单，不要求打印端前端重算正式账务。

### 当前可用性阻挡：241×93两行短单合计落第二份纸

这次是真实合法模板，不是非法列宽fixture误判。实际PDF：

- [短单固定PDF](serial-capture-after/apps/web/src/pages/printing/screenshots/order-print-output-needle-241x93.pdf)
- [第1页渲染](serial-capture-after/order-print-output-needle-241x93-1.png)：标题/公司电话、八项单头及两商品行。
- [第2页渲染](serial-capture-after/order-print-output-needle-241x93-2.png)：只有商品总额、优惠、抹零、应收20及经办/配送/签收栏，没有商品明细。

逐页文字位置（含纸张5mm边距，坐标距纸顶）：第1页标题10.85–16.14mm，单头到53.45mm，表头64.56–67.73mm，商品两行72.76–75.94及81.23–84.40mm；第2页合计区8.20–33.07mm、签名44.19–47.36mm。目标纸高93/上下各5，内容高度仅83mm，日常两行配送单已需要两张纸，需C做短纸紧凑布局，而非以两页不裁判完整可用。

只读对应主要垂直占用：OrderPrintPreview.tsx:514标题20px、marginBottom16/paddingBottom10；:525–534八单头字段三列auto-fit、gap8/16、marginBottom16/paddingBottom12，长订单号换行；:549 table marginBottom16；:618 td外padding4px叠加配置minRowHeight6mm，实际行距约8.47mm；:652四行totals/13px/gap4与上padding10且break-inside:avoid；:674签名marginTop36px。printing.css保留这些通用大纸间距，尚未对93mm高纸紧凑化。需针对真实目标压缩单头/空白与合计签名占用，保必要字段/完整金额，不靠删合计、缩成不可读或改后端金额；单页短单与长单分页都需修后PDF重新测。**12.7不因capture绿关闭，14.2真实针式出纸另待设备。**

## AI真实交互分支与截图实证

本轮capture实际运行并输出：

1. 真实POST reports/query与getSources生成report fixture，answered与clarification在fulfill前生产parseSchema('AiResult')成功；fixture用于页面状态，真实provider仍未配置。
2. 输入原问题“统计销售情况”显示候选；**实际点击c1**，拦截到续答正文：question仍原值、clarificationRunId=`11111111-1111-1111-1111-111111111111`、clarificationAnswer=`c1`，断言通过。旧“另问新问题不算续答”的证据缺口已补这一候选路径；自由文本续答不是本次已执行路径。
3. answered后点“在普通报表中复核此快照”，实际转到普通报表，显示真实report UUID **2ecbd50f-ce63-4776-9a89-2e3397d3a1c6**；现生产initialReportRunId读GET而非新POST。脚本断言同ID前8位可见；本轮未另抓完整GET响应逐字段对比或late GET回流竞态，不把这个有限断言写成所有sameid/race已验。
4. unroute AI后提交真实新问题，显示未配置服务/转普通报表，旧.ai-answer-card不存在；本代理已view新503图无旧答案。answered摘要仍为人工固定文字，不能当真实模型正确业务分析。

本代理实际查看了after中的[clarification](serial-capture-after/apps/web/src/pages/reports/screenshots/ai-report-clarification.png)、[answered](serial-capture-after/apps/web/src/pages/reports/screenshots/ai-report-answered.png)、[手机](serial-capture-after/apps/web/src/pages/reports/screenshots/ai-report-mobile.png)、[503](serial-capture-after/apps/web/src/pages/reports/screenshots/ai-report-503-fallback.png)；手机为headless390×844，不是安卓实机。真实provider质量/费用、自由澄清、所有并发失序仍未由截图证明。

## 其它图的抽查与未验

实际view新cash-events-desktop，确为“收退款流水台账”、客户过滤与现金表，不再是旧错误销售页截图；文件名不能替代这次页面核对。其余库存/财务/设置图虽脚本产生且部分标题有断言，本轮没有逐张目验全部，所以不据50文件整体关闭12.2/12.6等任务。捕获没有覆盖Create/Edit/草稿Detail手机底部确认与长单遮挡；A新桌面Edit图的有限证据见frontend-serial-result。

全栈Mini、真实安卓与针式设备、期初、最终视觉仍未完成。本次代码hash未变，产物已固定；后续A权限窄修不会自动推翻上述合法纸型/AI候选路径事实，C短纸布局若变则只重跑受影响PDF产物/必要门槛，不用重做不相干已证项。当前无capture进程，GUI仍归root，未动checkbox。
