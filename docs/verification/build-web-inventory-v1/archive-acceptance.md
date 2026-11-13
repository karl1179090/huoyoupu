# 归档后独立验收

验收日期：2026-11-13。结论：通过。本报告的检查均在原活动目录已不存在后执行，未复用归档前测试结果。

## 归档与规范

- 归档位置：`openspec/changes/archive/2026-11-13-build-web-inventory-v1/`。
- 对照归档前清单逐文件计算 SHA-256，17 个文件全部一致，包含 `.openspec.yaml`、原契约文档、数据库设计和 10 个 delta spec；无缺失或新增文件。
- 原活动目录不存在；`openspec list --json` 退出码 0，`changes=[]`，解析根为本仓库，来源 `nearest`。
- 复用归档协调方保存的 specs instructions 快照，确认 `planningHome.root` 为本仓库，10 个输出分别对应归档 delta 与主规范。
- 10 个主规范均有规范化 `Purpose`、`Requirements`，Purpose 与对应 delta 逐字相同；53 个 Requirement、94 个 Scenario 的完整正文逐能力相同，无 ADDED/MODIFIED/REMOVED/RENAMED delta 标题。
- `openspec validate --specs --strict --no-interactive`：退出码 0，10 通过、0 失败。

## 归档后实际执行

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run check:generated -w @huoyoupu/contracts` | 0 | 生成物与稳定活源一致 |
| `npm run typecheck -w @huoyoupu/contracts` | 0 | 类型检查通过 |
| `npm run test -w @huoyoupu/contracts` | 0 | 14/14 通过，0 失败、跳过或取消 |
| `node --conditions=development --import tsx --test docs/verification/build-web-inventory-v1/contracts-acceptance.test.ts` | 0 | 2/2 通过，0 失败、跳过或取消 |

契约检查覆盖 153 个 schema、79 个 operation。检查后 SHA-256 与既定基线一致：

| 文件 | SHA-256 |
| --- | --- |
| 稳定及归档原始 `api-contract.openapi.json` | `5cc2f92449cf2772ddfba7319f1641844b6b0ff647cf7d0d3d8063cc6199782e` |
| `packages/contracts/src/generated/openapi.json` | `d3fb3096bcfa7390b0611288171e9aa5c5fe7a42ca40e101a532540847f1f1ef` |
| `packages/contracts/src/generated/types.ts` | `342fedac3686ab97574a16e07008ee2312414560cdee851aa4291e08921482ac` |

## 路径与范围

已通过 CodeGraph 读取生成器及两份契约测试，确认读取稳定契约路径。对 `packages`、`apps`、`scripts`、`tests` 及独立契约验收测试精确扫描旧活动路径，0 匹配（rg 退出码 1）。全仓扫描另有 4 处交付、设计交接及验收历史文档引用旧路径，未作为可执行依赖或批量改写。

本轮仅新增本报告，未修改实现、测试或规范；未运行数据库、容器、GUI、前端或全套测试，结论限于归档完整性、规范同步和契约路径兼容性。
