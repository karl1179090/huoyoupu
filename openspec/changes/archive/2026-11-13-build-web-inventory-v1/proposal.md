# Proposal

## Why

建立单商家、多仓库、电脑与手机共用的网页进销存系统，以确认销售订单为首次销售记账入口，让库存、实际批次成本、销售毛利和客户往来能够核对。初始规划将共识固化为可测试规范、数据库设计和接口契约；当前实施进度见任务清单。2026-11-11 在原变更内细化多商品选品与订单页编辑，并将现有 v3 图降为供 Gemini 重新设计的业务草图。

## What Changes

- 建立管理员与员工账号权限；员工仅查看全部订单和打印，服务端隐藏进货价、成本、毛利。
- 建立商品、单位、客户多地址和价格体系；价格依次参考同客户同商品同单位最近有效成交价、客户专属价、商品默认价；保存包含数字字母的拼音首字母助记码，例如 `500ml酱油 → 500mljy`。
- 记录分仓、分批次库存与实际成本，按实际入库时间优先消耗，支持跨批、手选补选、同商品拆行分仓、补录入库与独立盘点损益。
- 实现订单确认、保留版本的修改、未配送作废及整单优惠/抹零；缺货整单拒绝，关键写操作具备事务、幂等及并发校验。
- 电脑在同一选品弹窗、手机在同一全屏会话内选择多个商品并逐行配置仓库、单位、正整数数量、单价与批次方式；搜索和切换商品保留已选配置，统一确认加入订单，加入后仍能在订单页行内修改或展开必要配置。同商品不同仓、单位或价格保留独立行，取消会话不改变原单；复用现有多行入参与报价，不新增批量写 API。
- 分别记录部分退货、实际返库和实际退款；按原仓原批与原成本返库，减量或退货默认后扣先退。
- 支持客户欠款、分次收款、多单结款、客户余额抵扣/退款和月结对账。
- 提供纸型、字段、列宽、行高配置与版本化配送单打印；打印不重复记账，完整拖拽编辑器留到后续。
- 建立固定报表与 AI 共用的统计接口，明确同期、跨期修改、退货、资金和零购买组合口径；AI 只生成受控查询意图，结果可追溯。
- 本轮按全新空业务数据初始化，安全建立首个管理员并完成必要基础配置，不预置演示库存、订单或往来，不以真实期初资料为上线验收前置；导入导出留后续需求。电脑与真实安卓验证页面和基本预览，打印验收到真实设备调起系统打印服务并显示实际预览，不要求物理打印机或实纸输出。

## Capabilities

### New Capabilities

- `access-control`: 账号、会话、管理员/员工操作与字段权限、审计。（[规格](specs/access-control/spec.md)）
- `product-catalog`: 商品、整数单位换算、条码、助记码及商品检索。（[规格](specs/product-catalog/spec.md)）
- `customers-pricing`: 客户多地址、价格规则与历史成交价回填。（[规格](specs/customers-pricing/spec.md)）
- `inventory-batches`: 仓库、期初/采购入库、批次成本、库存流水与盘点。（[规格](specs/inventory-batches/spec.md)）
- `sales-orders`: 草稿、销售确认、局部修改、作废、优惠和版本追溯。（[规格](specs/sales-orders/spec.md)）
- `sales-returns`: 部分退货确认、批次回补来源及独立实际返库。（[规格](specs/sales-returns/spec.md)）
- `customer-settlements`: 应收、实收实退、核销、余额与月结对账。（[规格](specs/customer-settlements/spec.md)）
- `delivery-printing`: 可配置模板、打印数据、版本关联与重打记录。（[规格](specs/delivery-printing/spec.md)）
- `business-reporting`: 统一销售、库存、资金指标及期间比较。（[规格](specs/business-reporting/spec.md)）
- `ai-reporting`: 自然语言只读统计、歧义处理、权限和明细来源。（[规格](specs/ai-reporting/spec.md)）

### Modified Capabilities

无。当前 `openspec/specs/` 尚无业务规格，本变更全部采用新增要求。

## Impact

- 后续采用 React/TypeScript 网页、Fastify/TypeScript API、Drizzle/PostgreSQL 的模块化单体；共享契约先行，Mac mini 开发、Linux 部署。
- 初始规划形成十项 delta specs；本次文档调整同步已有规划与 UI 交接材料，不修改应用代码、数据库迁移、主规格或进行归档。
- 数据库表、约束、锁定顺序与金额算法在 [design.md](design.md) 和[数据库设计](docs/database-design.md)明确；前端字段与调用以 [API 契约](docs/api-contract.md)及 OpenAPI 为准。
- Codex 只实现后端和契约；用户已授权 Gemini 将现有图当业务草图重新设计，不要求复制旧图的配色、控件或像素布局。原图、提示词和用户参考保留，用户本次已授权Gemini从草图重新设计并实现，新的视觉效果仍待最终验收；不以补齐所有新生图或另等一次视觉确认作为本次已授权实施的前置。前端实现继续通过 Computer Use 操作 Antigravity，前后端不得同时修改同一文件。主代理已通过Computer Use将[Gemini交接](../../../docs/ui/build-web-inventory-v1/gemini-handoff.md)实际投递至Antigravity，使用Gemini3.8FlashHigh，当前实现中、尚待验收；不声称已完成前端。
- 原始依据为[已完成决策地图](../../../.scratch/web-inventory-wayfinding/map.md)与[首版路线](../../../.scratch/web-inventory-wayfinding/delivery-plan.md)。依赖版本、真实安卓页面及系统打印服务的实际验收、模型与部署凭证在实施时核实，不作为已经存在的事实；真实期初资料和实纸输出不再是本轮验收前置。
