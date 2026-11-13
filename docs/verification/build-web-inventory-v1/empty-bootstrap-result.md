# 空业务初始化实际后端检查与 UI 交接

当前最终状态：显式UI handoff整轮已真实1/1通过并完成自有资源cleanup；独立验收者已实际查看8类空页，见文末最终结果。下面保留最初CLI/API与接管设计的阶段说明。

2026-11-12。用户选择空业务初始化，不再以真实期初资料为前置；导入导出另行规划。仅新增后端`apps/api/test/empty-bootstrap.db.test.ts`，不改生产API/迁移、前端、镜像或规划checkbox。当前dev97364/PG42535/Vite5173与原Mini卷均未触碰。

## 已真实通过的 CLI/API 部分

`env -u TEST_DATABASE_URL TMPDIR=/tmp npm run test:db -- apps/api/test/empty-bootstrap.db.test.ts`：初始非浏览器模式 **1/1 pass、fail0/skip0、exit0，总4231.536042ms**；API typecheck exit0。[脱敏结构结果](empty-bootstrap-api-result.json)保留。仅test:db自己新建的私有Unix-socket cluster、新随机库；测试先明确migrate:false并确认public无表，不用apiFixture、不用dev-api/demo seed、不SQL清空旧库。

- 真`node infra/runtime.mjs migrate`应用8迁移，47 BASE TABLE：只有schema_migrations8与空company_profiles1，其它行全0。company name/phone/address为空、default_template_id=null、version1。
- 真`npm run admin:init`，只读取本测试生成的0600随机密码文件，未读取现有凭据；得到1有效admin、1initialize operation、1audit，其余业务39表全0。product_units0/print_templates0合法，不伪造商品/仓/模板/期初。密码不入argv/源码/日志。
- 真实compiled TCP runtime serve动态端口（非3000/5173），不是inject：health、管理员登录、11个基础列表空items且nextCursor=null；匿名users401。company正常PATCH保存并在重启后保留，没有业务seed。
- 六类真实报表：默认sales_summary为1条orderCount0及金额全0聚合，其余5类rows=[]；正常report_runs6是系统快照，不是业务seed。
- 二次迁移applied=[]；第二次admin CLI明确exit1“已有账号，禁止重复初始化”，首账号/密码hash/数据不变。不能写成exit0幂等；真正API重启后无seed且原会话可用。
- 后续独立权限阶段正常创建随机员工，users变2是已记录的后续阶段，不冒称初始仅1admin的基线。员工订单空页、管理列表/报表403，错误无私有字段。最终39业务表仍全0、库存/成本/往来/现金SUM均0。子API、随机DB、私有PG与密码目录均cleanup。

角色是users CHECK(admin/employee)，单位从属于商品，不存在必须预填的“瓶/件”字典。静态迁移唯一数据INSERT为空company profile；生产createApp/server不seed。首次基本配置可存，不要求凭空存在模板/仓。

## 为什么还需真浏览器

上面是Node TCP/SQL检查，**不能证明真实React空页可访问**。Root已将此作为新版14.4的必要证据，acceptance作为唯一browser owner另接独立空API；不能以API空列表代替GUI、手机/安卓设备或打印机出纸。

新增显式handoff模式仅当HYP_EMPTY_UI_HANDOFF_DIR指向新建自有0700 `/tmp/huoyoupu-empty-ui-*`目录时启用；此mode使用PUBLIC_ORIGIN=http://localhost:5173。完成真CLI/无seed重启后、创建employee前，以wx写0600的`empty-bootstrap.json`（仅apiOrigin/publicOrigin/本次虚构admin/初始UI状态，无数据库连接串），再等`release-empty-bootstrap` marker。不会输出密码或metadata内容。

协调启动命令：

```bash
env -u TEST_DATABASE_URL \
  HYP_EMPTY_UI_HANDOFF_DIR=/tmp/huoyoupu-empty-ui-f4rnvn4v TMPDIR=/tmp \
  npm run test:db -- apps/api/test/empty-bootstrap.db.test.ts
```

acceptance只在自己的新context中将/api/v1/**通过真实route.fetch转给metadata.apiOrigin，保Cookie/Origin/CSRF/真实DTO；前端资源仍取原Vite，不修改生产proxy、不向dev数据库造数据。查看登录/商品/客户/库存/订单/往来/报表空态并可正常保存company系统配置，禁止创建业务row。关闭context后写`/tmp/huoyoupu-empty-ui-f4rnvn4v/release-empty-bootstrap`，后端恢复运行，严格核39业务仍0，再完成员工权限case与own cleanup，最后删除自己的私有metadata。

最长等待8分钟、整test10分钟，release/timeout/失败均执行own cleanup；工具每次只短poll，不无限保活。UI正常报表可新增report_runs，所以handoff最终只要求快照数>=6，**业务39表0不放宽**。新增模式代码类型检查exit0；协调就绪后已实际运行并完成，最终exit与独立GUI证据见下一节，不把此前非浏览器1/1当新mode的结果。


## 最终显式 UI handoff 整轮结果

收到acceptance ready后才启动私有handoff，未提前消耗8分钟。实际命令为上文指定HYP_EMPTY_UI_HANDOFF_DIR的真实test:db入口；**1/1 pass、fail0/skip0、exit0，case76021.036125ms、总76356.508333ms（含约70秒独立浏览器窗口）**。[最终脱敏TAP](empty-bootstrap-final.tap.txt)及[最终结构结果](empty-bootstrap-final-result.json)已保存。代码新增模式后API typecheck也已实际exit0，没有生产改动或镜像重build。

acceptance是独立且唯一browser owner，使用另一个真实desktop context，所有/api请求临时真实route.fetch到本测试动态API（不是dev数据库），资源仍来自Vite。其 [UI记录](empty-ui-artifacts/results.json)与8张净图记录真实登录后的空开单、商品、客户、库存（0批）、订单、往来（四额0.00）、真实销售汇总POST（0单、金额全0）、公司配置页。它只执行auth及report POST，没有业务创建或company保存；公司配置实际可存/重启持久由上述后端真PATCH覆盖，不能把它误称浏览器保存过。GUI证据由acceptance独立判读，本报告不把Node API访问冒称浏览器动作。

浏览器context/browser关闭后，acceptance才写release marker。后端随后严格核**39业务表仍全部0**，stock数量/成本/accounts/现金SUM仍0，再按独立阶段创建员工并验证管理列表/报表403与公开订单空页，最后成功结束。最初bootstrap只有1有效admin，GUI阶段仍1admin，后续权限case才users2，三个阶段不混称“初始化自动建员工”。六个后端空报告加浏览器真实查询的report_runs是正常系统快照，不当作演示业务seed。

重复migrate[]、重复admin CLI拒绝且全表内容未改、服务重启无seed/原会话有效均在同一真实流程通过。未执行任何SQL清库/日期pin/触发器绕过，不调用dev-api/comparison seed。公司迁移空行、角色CHECK(admin/employee)、无商品则product_units0/print_templates0的合理性仍按前述真实schema解释，不为填字典造业务数据。

finally已优雅关自有TCP子API、DROP自己随机测试库，test:db runner停删自己的Unix-socket PG cluster；私有密码文件目录清理，handoff的600metadata已确认删除，release marker留作协调痕迹（无秘密）。session60690已exit0；未动原dev97364/PG42535/Vite、Mini项目/卷、共享cache或其它库。此新增实测不需要重跑旧全套、备份恢复/容量或构建镜像。

这是用户新“空业务初始化”口径的实际证据，**不声称有真实期初导入/导出能力**。当前spec/task修订与14.4最终勾选交Contracts/Root按完整新原文独立判断；本次没有修改规划checkbox、生产后端或前端。安卓/针式241×93物理设备验收与生产公网发布不因空页通过自动完成。
