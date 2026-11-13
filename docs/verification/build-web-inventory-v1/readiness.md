# 首批验收准备

检查日期：2026-11-10。此记录是实施前只读核查，不代表业务实现已通过验收。适用变更：`build-web-inventory-v1`，初始进度 0/56。

## 规划一致性

已核对 proposal、design、tasks、十项 delta specs、数据库设计、API 说明及机器契约的结构和关键类型。未发现阻挡 1.1–1.4 实施的业务矛盾。规划文档中“本轮不写代码”描述的是规划产物阶段，当前 apply 授权按实施任务推进。

规划 OpenAPI 3.1.1 有 153 个组件 schema、59 个路径；Python 本地探测未发现悬空内部 `$ref`，顶层整数 schema 均有 JavaScript 安全整数上限。这只证明被检查的结构，不证明示例、角色投影或 HTTP 实现正确。

## 环境实测

| 项目 | 只读结果 | 影响 |
| --- | --- | --- |
| Node / npm / pnpm | v26.13.0 / 11.20.0 / 11.25.0 | 版本与后续依赖兼容性由工程安装及实际命令验证 |
| PostgreSQL 命令 | PATH 未找到 psql、postgres、pg_isready | foundation 负责准备，不争抢安装 |
| PostgreSQL 服务 | lsof 未发现 TCP 5432 监听 | 尚无真实数据库测试证据 |
| Homebrew opt | 初探未见 PostgreSQL、Docker 项 | 不推断不存在其他安装方式 |
| Docker | PATH 未找到 docker | 不能将容器运行写成通过 |
| Antigravity | `/Applications/Antigravity.app` 存在 | 仅证明应用文件存在，未验证启动或 GUI 控制 |
| Computer Use | `~/.codex/computer-use/Codex Computer Use.app` 存在 | 当前会话无对应技能或 GUI 工具；不改配置、不启动前端编码 |
| Computer Use 文档 | 用户级 skills 搜索无对应 SKILL.md，应用资源只有若干内置 AppInstructions | 不能据此认定具备受支持的 Antigravity 操作流程 |
| 当前根 scripts | 初探为空 | 等待 foundation 建立实际检查命令 |

## 1.* 验收矩阵

| 任务 | 需执行与核对 | 当前状态 |
| --- | --- | --- |
| 1.1 | 锁文件可重复安装；API/contracts/database 均启用 strict；实际类型检查、测试、构建成功；无 web 实现 | 尚未执行 |
| 1.2 | 全部组件可编译、基线示例可校验；额外字段拒绝；十进制串精度和位数；整数最大值与越界；语义差异记录 | 尚未执行 |
| 1.2 角色 | employee 独立响应 schema 排除嵌套成本/毛利；Admin 响应不能通过 Public；PrintData 两角色都不含敏感字段；不能用 union 代替 | 尚未执行 |
| 1.3 | 真实 PostgreSQL 创建隔离夹具并从空库执行迁移；重建可重复；事务回滚、唯一/CHECK/FK 拒绝、并发锁有实际数据库证据 | 尚未执行 |
| 1.4 金额 | 10 元/24 瓶逐瓶分摊最终恰为 1000 分；逐瓶全部退回累计恰为原金额；任意分组顺序不越来源上限 | 尚未执行 |
| 1.4 优惠 | 最大余数分摊总额守恒、并列按稳定行顺序；60/40 减免10；多行1分尾差；零金额、超额优惠拒绝 | 尚未执行 |
| 1.4 边界 | numeric(20,2)/(20,6) 输入上限、half-up 边界、安全整数乘法溢出拒绝、负金额及零/负倍率拒绝 | 尚未执行 |

业务闭环、角色 HTTP 响应、备份恢复等后续验收以实际模块完成后另记。真实手机、打印机、纸型、期初资料和真实规模均待取得；不得以模拟或文档替代实际验收。
