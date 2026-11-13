# Project Rules

本项目是在线进销存系统：使用 TypeScript全栈开发，前端使用React。

## Architecture

- `openspec/specs/` 是业务规则的唯一来源；`openspec/changes/` 管理正在进行的需求变更。
- 后端负责 API、数据库、业务逻辑、鉴权、订单与库存事务、打印数据及服务端测试。
- 前端负责页面、组件、交互、打印模板编辑器及 API 接入；通过约定的 API 契约与后端协作。


## Agent Responsibilities

| 工具 / Agent | 职责 |
| --- | --- |
| Wayfinder | 大型项目或跨模块的未决问题与技术路线规划 |
| Grill-with-docs | 澄清现有项目中的具体需求；纯对话可用 Grill-me |
| OpenSpec | 维护 proposal、specs、design、tasks 与变更归档 |
| CodeGraph | 分析已有代码的依赖、调用链及修改影响 |
| ai-memory | 恢复历史决策、进度与跨会话交接 |
| Codex | **只实现后端**：API、数据库、业务逻辑、后端测试及接口契约 |
| Antigravity | **只实现前端**：页面、组件、样式、交互和前端测试 |

- Codex 可以阅读前端代码并提供接口说明，但不得编写或修改前端实现。
- 前端实现必须由协调 Agent 通过 **Computer Use Skill 操作 Antigravity** 完成；Antigravity 不直接改后端。
- 前后端共同依赖的接口先确定契约，再分别实施。不得让两个 Agent 同时修改同一文件。

## Workflow

1. **读取上下文**：阅读本文件及相关 OpenSpec；用 ai-memory 恢复历史；修改现有代码前按需查询 CodeGraph。
2. **澄清需求**：复杂跨模块决策使用 Wayfinder；具体业务歧义使用 Grill-with-docs。已确认的事项不重复追问。
3. **制定规范**：新功能或业务行为变更先经 OpenSpec proposal，形成可测试的 specs、design 和 tasks；任务标明后端、前端或联调。
4. **后端开发**：Codex 按后端任务实现 API、数据库和测试，及时更新接口契约。
5. **前端开发**：**先使用生图 Skill 生成页面视觉参考图**，保存至 `docs/ui/<change-id>/`；确认设计后，由 Computer Use 操作 Antigravity 实现页面。不得直接跳过生图或改由 Codex 写前端。
6. **验证交付**：运行实际存在的类型检查、测试、构建与联调；前端对照设计图检查页面和交互；核对 OpenSpec 后归档，使用 ai-memory 记录交接。

## Frontend Rules

- 新页面和页面改版必须先生成视觉图，再编码；小型功能修复可复用该页面已确认的设计图。
- 图片是设计参考，页面必须实现为真实、可交互的组件；保留设计稿与实现截图供检查。
- Antigravity 根据 OpenSpec 和 API 契约开发，不自行猜测后端返回字段。
- Computer Use 或 Antigravity 不可用时，记录前端任务为待执行；不得由 Codex 代写前端或声称已完成。

## Code Style & Quality

- TypeScript 使用严格类型；遵循仓库已有格式化、Lint、测试与目录约定。
- 金额、数量、单位换算须明确精度；订单与库存关键写操作要考虑事务、并发和幂等。
- 新增或修改 API 应更新契约及必要测试；数据库结构变更必须有迁移文件。
- 不提交密钥、生产凭证和敏感客户数据；不擅自覆盖他人的未提交改动。
- 以实际运行结果报告测试状态；未执行的检查不得写成通过。

## Conventions

- `AGENTS.md` 仅记录长期有效的协作规则，不复制完整业务需求。
- 当前需求看 OpenSpec；代码事实看源码与测试；历史讨论看 ai-memory；代码关系由 CodeGraph 辅助定位。
- 优先使用已安装的 Skill 和仓库现有命令，不假定不存在的脚本、框架或自动化能力。
- 简单修复走轻量流程；涉及新业务行为时补充 OpenSpec，不为走流程重复生成文档。
