# Android真机与系统打印有限独立验收

2026-11-12，用户授权USB调试后实际设备ADB为device。设备：Samsung SM-G981N、Android13、Chrome157.0.8103.48，实际CSS viewport360×718、DPR3，不是手机仿真。未记录设备序列/RSA/个人tab。Homebrew platform-tools37.0.2下载404；Google官方latest安装在/tmp自有工具目录，adb37.0.1。没装APK、改系统设置、清Chrome资料或动用户已有tab。

创建Chrome独立BrowserContext/专属Target，只连接该目标；手机localhost19373由adb reverse指向本机临时代理，静态资源来自本轮恢复的真实Vite5173，API全部指向独立PG/随机DB动态HTTP factory，Origin固定http://localhost:19373，真实Cookie/CSRF。不是共享dev登录/数据。临时脚本仅/tmp，不修改前端source/tests。

## 实际页面业务

同一批量选品会话真实加入两个SKU共3行：原商品独立两行，qty2/价2与qty1/价2.5；长名称第二商品qty2/价3。浏览/搜索切换后配置值仍2/2、1/2.5、2/3，一次加入三行，没有静默合并。订单页直接把第一行qty2改3，无需重开picker，真实quote200总14.50/成本7/毛利7.5。底栏rect bottom658，底导航top668.5，CSS width/scrollWidth均360；确认按钮enabled。

真实设备CDP Input事件点确认：create201(v1)→confirm200(v2)→详情GET200，订单c13676fa-7431-4fc2-8653-983f7d36ad14，三行3×2、1×2.5、2×3，total14.50/cost7/profit7.5。数据和请求均虚构。早先Input.touch未触发确认，已核录制0order写才改用trusted mouse input；不是API代替UI确认。

有效净图及HTTP字段在[android-real产物目录](../../ui/build-web-inventory-v1/implementation/android-real/)：mobile-picker.png、mobile-create-ready.png、mobile-confirmed.png、mobile-print-preview.png、mobile-print-requested.png；mobile-{network,confirm-network}.json、mobile-layout.json、合法模板配置legal-template.json和manifest。没有headers/cookie/凭据。已actual view确认详情及应用预览图。

**真实视觉限制**：开单360底栏与无横溢通过；确认详情图的长订单号标题及操作行向右裁切，宽商品table仍需横向滚，不能说详情全面手机适配通过。应用打印预览是缩放/横向纸面，当前截图片段不能证明长名称在原生纸面完整；DOM实际3行含完整长名称。此限制交前端owner判断，不由Codex改源码。手机旧revision切换未新增实测，保留下方既有PC证据。

## 实际系统打印

首次进入打印显示缺默认模板，属本隔离fixture未seed前置，未当源码bug。随后正常API创建合法241×93 landscape/margin5模板并设默认。真实应用预览显示本单号、order v2/模板v1、三行与14.50，确认时间Asia/Shanghai14:45:53，配置可打印宽231mm。未伪造PrintData。

通过真实“调起打印机”按钮发送trusted Input，未stub/window.print替换。设备实际输出曾为：

```
topResumedActivity=... com.android.printspooler/.ui.PrintActivity
mCurrentFocus=... com.android.printspooler/com.android.printspooler.ui.PrintActivity
```

[原生UI树print-ui.xml](../../ui/build-web-inventory-v1/implementation/android-real/print-ui.xml)实际包含“选择打印机”“份数01”“纸张大小ISO A4”“第1页共2页”“第2页共2页”两个preview_page，证明实际系统打印服务/预览页面加载存在。**Android系统当时默认A4，未证明241×93原生纸型匹配**。未点击物理打印或保存PDF。

手机Awake、keyguard showing=false/inputRestricted=false，非锁屏。exec-out与设备端/data/local/tmp screencap两种方式均命令exit0但文件0byte/stderr空；后者stat实际0，pull也0。未查明根因，不猜incognito限制，不把0byte当截图。原生预览内容清晰度没有图证，不能称内容已目视通过。有效CDP PNG是应用预览，不能冒充原生系统图。

确认当前为自己的PrintSpooler后BACK取消，Runtime恢复。网页真实移动端job短码e93bba7b仍requested，未自动标user_confirmed；UI提供人工成功/取消/失败，本轮不人工标成功。原生打印调用POST body本轮未持久化，只有应用job状态/系统activity/tree实证，不编造缺失请求dump。当前用户验收范围为系统服务+预览，不要求物理纸面；是否据此与既有PC证据完成14.2，由完整规格独判者决定。

既有PC真实系统对话框取消/人工状态证据见frontend-browser-review.md打印段；完整模板四配置、旧订单非current+旧template双UUID/软件job、权限与race实证见frontend-c-independent-result.md；241×93短单、A4/A5/长单真实PDF及Shanghai时间见frontend-targeted-result.md/targeted-capture-after产物（保原限定，不重跑）。本轮不拿PC软件stub冒原生手机或实物出纸。

## 结束与边界

已正常BACK取消自己的原生界面，关闭唯一自有BrowserContext，删除自有device临时XML/PNG，移除本轮19373 reverse与19222 forward，没有kill adb server/关用户tab/拔USB；自有fixture47157已SIGINT正常cleanup。Vite86513本轮启动供手机及后续空UI使用，空UI结束后已停。未影响devPG/Mini。60源码/config/既有tests哈希相对最终订单基线0变化，见frontend-device-baseline.json。无前端修改、无任务checkbox变动。此为本机一部真实Android有限业务链，不冒全部设备/浏览器/最终视觉接受。

### 收尾校准：Detail待修与时间字段

协调者actual view再次确认：长UUID订单号/操作行右裁切及整页横向滚属于**真实Detail手机适配缺口，待唯一前端owner修复后针对性复验**，不是以业务能完成为由放行；mobile开单链已过与Detail未通过必须分开。本报告不提前判14.2整体或14.5完成。

本轮原始真实响应：createdAt=`2026-11-12T06:45:53.234Z`，confirmedAt=`2026-11-12T06:45:53.279Z`（create201时confirmedAt=null，confirm200/详情GET时为后者）。应用详情截图显示创建06:45，应用打印预览确认时间显示14:45:53：两原始事件仅差45ms，不能用不同时点解释8小时差。按Asia/Shanghai创建应14:45。未保存PrintData原始JSON或printedAt字段，不编造该值；系统请求日志的06:52另为打印任务请求，不冒充createdAt/confirmedAt。后续时间源定位交只读源码复核。

当前无browser动作。自己的手机context与factory已cleanup、设备USB连接/ADB工具保持；Vite在收到备用要求前已正常停止，后续需要可按既有dev:web恢复，不重启/改dev数据。
