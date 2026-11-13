# 14.3部署交付非作者审查

日期：2026-11-11。结论：**现有交付已满足14.3原文，可验收完成**。本代理未实现infra或执行Mini容器实验，本次独立读取实际执行记录、部署文件与检查脚本，核对其与任务要求的一致性；没有把作者实验冒充本代理重跑，也未重新运行已通过的后端全套。

原任务：建立Mac mini开发与Linux生产的容器、迁移、HTTPS、备份恢复及启动说明；在隔离环境验证实际命令与恢复后的业务核对，不使用真实客户敏感资料作测试夹具。原文要求实际隔离验证，**没有要求本轮立即发布真实公网生产**。

## 对照证据

| 原要求 | 已交付/实际执行证据 | 非作者判断 |
| --- | --- | --- |
| Mac mini开发与Linux生产容器 | Dockerfile多阶段后端构建、非root node运行；Compose的PG/API/migrate/proxy/setup及持久卷；Mini Docker Desktop实际Linux/arm64构建成功，记录Node/PG/Caddy版本和镜像digest | 不只是YAML或CLI版本推断；已有真实Linux容器执行。配置不绑定开发Mac私有路径，可在具备Engine/Compose的Linux按文档构建运行 |
| 迁移与启动说明 | infra/runtime.mjs含migrate/serve/initialize-admin；Compose令API与setup等待迁移成功；空库8迁移成功，故意migrate exit17拒绝API启动后恢复健康 | 实际验证失败闸门及正常启动，非只写操作指南 |
| HTTPS | 生产Caddyfile使用HYP_DOMAIN反向代理，PUBLIC_ORIGIN固定HTTPS；仅代理发布80/443；内部CA覆盖层实际可信HTTPS health/登录/安全Cookie/错误Origin403 | 已隔离证明HTTPS代理、证书链及会话来源边界；生产域名、ACME和端口要求已在说明中列明 |
| 备份恢复命令 | infra/database.sh在容器中实际backup/restore；归档0600、同名拒绝；恢复至另建新库、已有目标拒绝；备份脚本不clean/drop覆盖现有库 | 命令真实执行且恢复边界明确，不是只生成空归档 |
| 恢复后的业务核对 | HTTPS夹具真实创建客户/地址/商品/仓库、10瓶成本20、销售2瓶金额10、实收12与核销/月结；恢复前后public全部47表稳定JSON摘要相同、库存8瓶/成本16、客户净余额−2；迁移重放applied=[]，临时切库后摘要仍一致 | 有实际业务和全表核对，满足“恢复后的业务核对”；未只用health代替恢复验证 |
| 隔离与非敏感资料 | 唯一临时目录/Compose项目/测试标签，仅上传源码白名单；秘密临时生成不回传；虚构业务脚本；项目容器/网/卷及临时秘密/归档清理，未访问真实库 | 满足隔离夹具限制；未要求提供真实客户资料才可完成此任务 |

读取来源：`deployment-container.md`、`docs/deployment.md`、`docs/remote-docker-mac-mini.md`、Dockerfile/.dockerignore、infra/compose.yaml、Caddyfile、runtime.mjs、001-create-app-role.sql、database.sh、两个env示例、scripts/database-backup.mjs、保留的HTTPS业务/逐表摘要脚本及backup.test.ts。没有读取真实env或secret文件。

本代理另实际执行`node --check infra/runtime.mjs`、`node --check scripts/database-backup.mjs`、`sh -n infra/database.sh`，均exit0；没有新增部署或数据库写操作。以上语法检查只是补充，主要实际容器/HTTPS/恢复证据来自已落盘的Mini执行记录。

## 仍必须如实保留的发布局限

- 未部署独立真实Linux生产宿主，未验证该宿主服务管理、存储性能和容量；没有完成真实公网DNS、80/443可达性、外部ACME签发或生产端到端检查。
- 当前HTTPS容器入口是后端API，不包含尚在施工的React页面。14.3为后端交付，不把未验前端当作本任务缺失；完整产品部署还需后续集成。
- 示例镜像major tag用于准备；真实发布前固定审查后的digest、域名和生产配置，执行文档已有的发布检查。隔离实验实际摘要已记录，不宣称已固定真实生产发布物。
- 应用角色兼任自身数据库迁移者，有schema DDL；没有superuser/createdb/createrole，不能误写“运行账号完全无DDL”。真实运营还需明确备份保留/加密异机副本等配置，不能把一次恢复实验写为完整生产灾备。
- 真实规模/期初导入与设备/前端验收仍属于其它待执行任务；本结论不更改14.2、14.4、14.5等状态。

这些是已明确披露的后续真实发布与环境验收事项，不是14.3原文新增的完成门槛。Linux生产配置/启动说明未发现实质缺失；因此按当前任务边界接受隔离交付，勾选仅代表本任务完成，绝不代表生产已经上线。

任务更新时须刷新`openspec instructions apply`给出的14.3 sourcePath/line，只将该项从[ ]改[x]，并核对其余55项勾选不变、进度由40/56变41/56。

实际任务更新结果：刷新apply元数据后确认唯一14.3位于`openspec/changes/build-web-inventory-v1/tasks.md:103`，原行与返回description完全一致；仅该checkbox改为[x]。再次apply返回done=true、41/56（剩15），并逐项核对其余55项状态与审查前一致。`openspec validate build-web-inventory-v1 --strict`返回valid。
