# 共享契约实施说明

`@huoyoupu/contracts` 的唯一生成源是 `docs/contracts/api-contract.openapi.json`。包中的 `src/generated/openapi.json` 是完整副本，`src/generated/types.ts` 由 openapi-typescript 生成，禁止手工改生成物。规划基线的 153 个组件和 79 个 operation 均保留；本次没有改变业务字段、required、枚举、角色或响应状态。

`docs/contracts/api-contract.md` 是配套接口说明。后续契约变更经 OpenSpec 确认后，仅维护 `docs/contracts/` 中的活源；OpenSpec 归档内的契约文档保留为不可变历史快照，不作为生成输入或第二个活源。

修改经 OpenSpec 确认的活源后，在仓库根运行：

```sh
npm run generate -w @huoyoupu/contracts
npm run check:generated -w @huoyoupu/contracts
npm run typecheck -w @huoyoupu/contracts
npm run test -w @huoyoupu/contracts
npm run build -w @huoyoupu/contracts
```

`check:generated` 重新生成并逐字检查两个生成物；运行测试还会对完整 OpenAPI 做深度语义相等比较，包括 operation、请求参数、角色扩展和错误响应。HTTP 路由实现与验收状态见 [后端交付索引](backend-delivery.md)；上述生成检查仅证明契约与规划一致，HTTP 行为另由实际集成测试验证。

## 对外接口

- `components / operations / paths`：完整 OpenAPI TypeScript 类型；`SchemaValue<'Product'>` 或 `components['schemas']['Product']` 取得 DTO 类型。
- `validateSchema(name, unknown)`：类型守卫；`parseSchema(name, unknown)`：成功返回对应类型，失败抛 `ContractValidationError`；`getSchemaValidator`：取 Ajv validator（含最近一次 `.errors`）。
- `parseOperationRequest(operationId, value)`：验证 `{ path?, query?, headers?, body? }`，覆盖所有 operation。path/query/header 参数采用解析后的 JSON 值；例如 limit 必须是数字 50，不能是字符串 `"50"`。HTTP 适配层须显式解码、拒绝重复/非法参数，且不能把金额字符串转换成浮点。
- 请求 `headers` 只传契约定义的业务头，名称按 OpenAPI 大小写；Cookie、Origin、Content-Type 等传输头由 HTTP 层验证，不放入该对象。额外业务头、query/path/body 字段均拒绝。
- `parseOperationResponse(operationId, status, role, unknown)`：验证指定响应，返回生成的静态类型；支持 public/admin/employee。成功响应检查声明角色；共享公开身份接口允许三种身份。错误响应使用 ApiError；204 只接受 undefined。它不验证会话或执行鉴权，HTTP 层必须先完成认证和授权。
- `parseOrderResponse(role, kind, unknown)`：对 detail/page/revision/revisions 直接选择独立角色 schema；`orderResponseSchema` 返回所选组件名。前三类读取 OpenAPI 的角色映射；版本索引共用不含成本的 OrderRevisionPage。
- `projectOrderResponse(role, kind, source)`：按目标 schema 白名单递归复制，再严格校验，返回相应角色类型，不修改来源。员工不接收成本、毛利、批次成本或 accountChanges，嵌套明细同样移除。投影和拒绝校验分离，不能用 OrderRead/OrderPage 的 union 当作字段授权。
- `openapiDocument / schemaNames / operationIds`：冻结的完整基线和索引。

运行校验使用 JSON Schema 2020-12 的 Ajv，开启严格 schema/格式校验、拒绝非有限数。不会 coercion、填默认值或悄悄删除额外字段。OpenAPI `components` 和 `x-allowed-groupings` 注册为注解容器；后者的业务组合约束由报表模块执行，结构 schema 本身不扩增这项断言。`components` 包含 schema，本身不改变 schema 断言。operation 组合校验仅将本地引用补成固定根 URI，保留原始约束。

## 数值和错误边界

金额使用固定两位十进制字符串，最大 `999999999999999999.99`；SignedMoney 可为负，PositiveMoney 拒绝 `0.00`。单价及输入成本最多 14 位整数、6 位小数，最大 `99999999999999.999999`，接受 `"0"`。不接受指数、前导零、超精度、数字类型或负非负字段。精确加减及分摊由后端金额工具负责，契约不进行记账计算。

数量、倍率与版本按基线限制在 JavaScript 安全整数范围：非负数量最小 0，正数量/版本最小 1，有符号数量可到 `-9007199254740991`。不接受小数、字符串数量或溢出。`ErrorDetails.retryAfterMs` 只按规划的非负整数约束验证，未擅加新的业务上限。毫米字段保留基线允许的小数。

`ContractValidationError` 只含 schema 名及结构校验 issues，不含收到的原始值。HTTP 层应将其映射为 ApiError 白名单字段；不能直接序列化异常、栈、SQL、凭据或将任意敏感值拼进 message。字符串自由文本的内容脱敏和业务权限仍由服务端处理。

结构校验不替代跨表归属、引用单位不可变、实盘快照、库存与资金并发、优惠总额、查询组合等业务规则；这些必须在各业务模块及真实数据库测试中落实。

## 覆盖与依据

契约测试覆盖所有组件的有效结构、额外字段和 undefined 拒绝，机器示例与 API 说明中的四个 JSON 示例、全部 operation 输入和各响应状态、union 分支、格式、数值边界、管理员 DTO 的员工负向验证、列表/历史/明细嵌套字段泄漏和打印/错误字段。静态类型用编译断言验证金额字符串与角色字段隔离。

选型依据：[openapi-typescript Node API](https://openapi-ts.dev/node)、[Ajv JSON Schema 2020-12](https://ajv.js.org/json-schema.html)、[Ajv strict mode](https://ajv.js.org/strict-mode.html)、[Ajv 不修改校验数据的默认行为](https://ajv.js.org/guide/modifying-data.html)。依赖版本由工作区统一锁定于 package-lock.json。

生成器使用 `defaultNonNullable:false`，使仅含 `default` 注解但不在 `required` 中的属性保持可省略；Ajv仍不填默认值。规划全量扫描此类属性仅有 `ReportQuery.quantityBasis`（默认 ordered）。编译期用 `{kind:'cash_flow'}` 验证省略合法，比较模块按业务明确采用 ordered。该选项通过 [openapi-typescript官方Node API](https://openapi-ts.dev/node) 的camelCase选项及已安装7.13.0转换器核查；没有修改规划或运行时schema。
