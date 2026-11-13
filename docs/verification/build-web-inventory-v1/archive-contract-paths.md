# 归档前契约路径兼容验证

目的：解除生成器与可执行契约测试对活动 change 路径的依赖，确保 change 归档后仍可生成和校验契约。

`docs/contracts/api-contract.openapi.json` 是唯一机器契约活源，`docs/contracts/api-contract.md` 是配套说明。OpenSpec 归档保留原始文档作为不可变历史快照，不作为第二个活源；后续契约变更先经 OpenSpec 确认，再更新稳定活源。

本次只复制两个契约文档、修改生成器及两份契约测试的读取路径，并更新共享契约说明。说明副本仅修复两处相对链接；change 内原始文档未修改。未复制数据库设计，未修改生成物或业务 schema。

## SHA-256 校验

| 文件 | 修改前 | 修改后 |
| --- | --- | --- |
| change 原始 OpenAPI JSON | `5cc2f92449cf2772ddfba7319f1641844b6b0ff647cf7d0d3d8063cc6199782e` | 相同 |
| 稳定 OpenAPI JSON | 尚不存在 | `5cc2f92449cf2772ddfba7319f1641844b6b0ff647cf7d0d3d8063cc6199782e` |
| change 原始接口说明 | `5499406d618b75b458a05f2bfe71ae8c1f8b969c5096b3476930f7728bbee295` | 相同 |
| 稳定接口说明 | 尚不存在 | `e638c72fa44181b0f0683afbfbb131f7dd6890a4515d7fa3c9a1dd2e26ec6db6` |
| 生成 OpenAPI JSON | `d3fb3096bcfa7390b0611288171e9aa5c5fe7a42ca40e101a532540847f1f1ef` | 相同 |
| 生成 TypeScript | `342fedac3686ab97574a16e07008ee2312414560cdee851aa4291e08921482ac` | 相同 |

## 实际预验结果

以下检查在 change 尚未归档时执行，退出码均为 0：

- `npm run check:generated -w @huoyoupu/contracts`
- `npm run typecheck -w @huoyoupu/contracts`
- `npm run test -w @huoyoupu/contracts`：14 项通过。
- `node --conditions=development --import tsx --test docs/verification/build-web-inventory-v1/contracts-acceptance.test.ts`：2 项通过。

测试确认保留 153 个 schema 和 79 个 operation。对 `packages`、`apps`、`scripts`、`tests` 精确扫描旧 change 路径无匹配（rg 退出码 1）。归档后的独立验收另行记录，本报告不宣称其已执行。

## 归档位置核对

变更已移至[归档目录](../../../openspec/changes/archive/2026-11-13-build-web-inventory-v1/)。本次只读重核归档内 OpenAPI JSON 与接口说明的 SHA-256，分别仍为上表的 `5cc2f924…19782e` 与 `5499406d…bee295`，与归档前原文逐字一致。归档后独立命令验证由独立验收报告记录，此处不提前宣称结果。
