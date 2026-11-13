# 1.2 独立验收结果

日期：2026-11-10。结论：**通过任务 1.2 的共享契约验收**。没有验证尚未实现的 HTTP 业务路由，不将结构契约视作业务鉴权或库存事务完成。

## 实际执行

| 命令 | 结果 |
| --- | --- |
| `npm run check:generated -w @huoyoupu/contracts` | exit 0，生成物与当前生成器一致 |
| `npm run typecheck -w @huoyoupu/contracts` | exit 0 |
| `npm run test -w @huoyoupu/contracts` | exit 0，14/14，无跳过 |
| `npm run build -w @huoyoupu/contracts` | exit 0 |
| `node --conditions=development --import tsx --test docs/verification/build-web-inventory-v1/contracts-acceptance.test.ts` | exit 0，额外独立检查 2/2 |
| Node ESM 导入构建后的 `@huoyoupu/contracts` | exit 0，153 schemas、79 operations；金额最大值接受，超界拒绝 |

既有测试实际覆盖了 153 schema 的结构样本、额外字段、全部机器示例与说明中的四个 JSON 请求示例、全部 operation 请求和响应状态、union 分支、格式、静态类型及精度边界；管理员订单详情/列表/历史响应不能通过员工独立 schema，嵌套成本毛利、打印数据及错误字段有负向断言。

独立补充检查完整基线与生成 JSON 语义相等（包含请求、响应、角色元数据），并向管理员详情每个嵌套对象注入成本、毛利、输入成本、密码哈希字段后投影为员工响应，递归确认全部移除、合法商品标识及行数保留、源对象未被修改。

数值边界：金额最大 `999999999999999999.99`，单价最大 `99999999999999.999999`，安全整数最大 `9007199254740991`；测试拒绝超界、小数数量、非有限数、字符串数量、指数、负非负字段和多余小数位。共享包使用 Ajv 严格校验，无类型强转、默认值填充或额外字段静默删除。

## 验收过程说明

独立测试首稿曾错误要求基线文件与格式化生成文件字节相同，因 JSON 空白差异失败；本任务要求语义一致，已将验收断言修正为完整 JSON 深度相等并重跑通过。这是验收脚本条件修正，不是实现缺陷。未修改实现文件。

此轮未运行 `npm install`/`npm ci`，避免与工程实现者安装并发。实现者已报告本机默认 npm 缓存存在所有权异常，独立验收后续安装检查应使用自有 `/tmp` 缓存；不调整用户目录权限。

## 可选默认字段类型微修复核

后续生成器显式使用`openapiTS(document,{defaultNonNullable:false})`，避免把schema中仅有default但未required的`ReportQuery.quantityBasis`错误生成必填。独立核对生成脚本和静态证明`SchemaValue<'ReportQuery'> = {kind:'cash_flow'}`；运行schema与规划OpenAPI未发生此项业务变更。

实际重跑`npm run check:generated -w @huoyoupu/contracts`、`npm run typecheck -w @huoyoupu/contracts`、`npm run test -w @huoyoupu/contracts`均exit0，14/14测试通过。此微修通过独立复核。
