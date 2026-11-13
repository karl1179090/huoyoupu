# 打印后端与真实设备验收

`registerPrinting(app,deps)` 注册规划公司资料、模板及版本、PrintData、print-job与状态接口。`007_printing.sql`建立单商家资料、模板当前指针、不可变配置版本、请求记录和追加状态事件。公司资料初始化为空，模板由管理员创建；需明确设置默认模板或GET PrintData传templateVersionId，不伪造商家信息。

管理员维护纸型、显示字段与顺序、列宽、最小行高四项配置。A4为210×297mm、A5为148×210mm，方向确定可打印宽高；custom必须明确宽高。双边边距后必须留有效区域，列宽累加使用十进制整数比例比较，不因二进制浮点舍入容许超宽。标准纸型不接受矛盾尺寸；明细字段/header字段按契约白名单校验，成本、进货价、毛利和未知字段拒绝。最小行高是下限，前端必须允许自动换行增高，不能裁掉长内容。

配置更新另建print_template_versions，旧版本不可覆盖/删除；模板名称、active、default选择和配置发布都按expectedVersion检查。所有模板写先锁公司锚点，序列化默认选择；切换默认也递增被移除默认标记的模板version。停用默认模板会清除默认选择。员工仅在模板列表看到active配置，但可按明确版本追溯历史配置。

PrintData读取一次REPEATABLE READ只读视图，返回所选订单商业版本、公司资料和所选模板版本。缺省当前订单及默认模板；同商品多仓仍逐行输出。无论调用者为管理员还是员工，始终投影OrderPublic，拒绝全部成本/毛利/原成本批次分配字段；不重估原分摊金额。公司资料取查询时当前资料，模板及订单内容通过返回的明确版本识别。

打印请求必须指定orderRevisionId和templateVersionId，数据库复合FK防止跨订单串版本。记录发起人、平台、请求时间；预览GET不创建请求，实际点击需POST登记。重复幂等键精确重放，不新增job；重打新键另建job。请求和状态写都不更新sales_orders，不生成商业版本，不扣库存、不登记现金/应收。

createPrintJob/setPrintJobStatus显式允许admin/employee，其他管理写仍仅admin。状态只允许本人或管理员；路由在幂等缓存读取前按当前角色检查job归属，事务内锁job后再次复核。因此管理员改他人job后被降为employee，同旧键重放仍403。每次状态更新写追加事件与审计，保留人工说明。服务器不会根据浏览器afterprint、对话框关闭或网络回调自动标为user_confirmed；该状态是人工报告，并不代表系统已检测物理出纸。

`currentRevisionPrintStatus(sql,orderId,currentRevisionId)`仅查当前商业版最新job，供销售读模型调用；查看历史DTO时该字段仍表示实际当前版。旧版job不标记新版本；未请求或最新人工取消为not_requested，其余requested/user_confirmed/client_error按最新记录输出。它只读，不改变订单version。

## 前端和设备验证要求

本轮实现仅含后端，不声称完成模板编辑器、浏览器排版或物理设备验证。后续由Antigravity使用公司资料、config及PrintData实现真实可交互模板：长商品名/地址完整换行、多页重复必要表头、最终合计只出现一次；desktop/mobile预览都需验证。真实Windows/macOS及手机系统和实际打印机至少验证A4/A5、自定义纸型、边距、横竖版、多页长名称、取消对话框、重打及人工确认。保存打印预览截图和纸张照片，浏览器回调不能替代纸张验收。
