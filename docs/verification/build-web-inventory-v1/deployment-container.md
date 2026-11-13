# Mac mini隔离容器、HTTPS与恢复验收

2026-11-11实际执行，目标是Mac mini的Docker Desktop Linux/arm64引擎。镜像构建、Compose迁移/初始化、内部CA HTTPS、虚构业务及容器备份恢复/切库均已通过。没有部署真实生产，没有访问真实客户库，没有在开发Mac安装Docker。任务勾选由协调者依据规格和本文边界处理。

## 隔离与版本

仅通过既有Remote Desktop Commander操作remote-mac.local（00000000-0000-0000-0000-000000000000）。Mini Docker Engine29.4.0、Compose5.1.2；应用容器实际Node24.22.2/linux/arm64，USER=node；PG18.6（Debian），Caddy2.11.9。初次docker ps没有运行容器；既有共享镜像与全局缓存没有清理。

临时目录/tmp/huoyoupu-test-AZ4JPkZL，唯一项目huoyoupu-test-az4j，应用测试标签huoyoupu-test:az4j。只上传95个白名单文件（160402字节gzip）：根manifest/lock/TS配置/Dockerfile/.dockerignore、API源码和配置、packages源码/迁移/配置、web仅package.json、infra部署文件。没有上传env、credentials、node_modules、.git、真实资料或前端实现。秘密在Mini临时目录随机生成，不回传值。

本轮实际解析的镜像摘要：

- Node24-bookworm-slim：sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9。
- postgres18-bookworm：sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5。
- caddy2-alpine：sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9。
- 构建应用：sha256:0765bdce590c3afd3ae0993684f23336e6fbbeb83e51a5a5a2a871f99706069a（验后已删除测试标签/镜像）。

## 发现并修复

1. 初始迁移认证失败：初始化SQL的btrim(secret)只去空格，openssl文件尾LF被当成密码的一部分，而Node运行时trim移除了LF。infra/001-create-app-role.sql现显式去空格、Tab、LF、CR。只清空本测试项目卷后，从空库重跑成功；随后实际去掉同一虚构secret的LF，应用相同SQL表达式与迁移重放也认证成功。没有打印秘密值。
2. initialize-admin仅等待PG健康，存在迁移未完成就初始化的竞争。infra/compose.yaml现额外等待migrate成功；API原本已有该条件。实际故意让测试migrate退出17，Compose拒绝启动API；恢复正常migrate命令后服务重新健康。
3. 隔离测试脚本初次规范化Compose未启用setup profile，导致生成配置不含initialize-admin，命令明确失败；规范化时增加--profile setup解决。另一个辅助镜像检查曾因BuildKit未保留node本地tag而非零，改从实际build日志读取FROM摘要；这不是应用构建或权限检查失败。上述初始失败未计为通过。

## 实际验证结果

| 实际步骤 | 结果 |
| --- | --- |
| docker build -t huoyoupu-test:az4j . | exit0；npm ci、四workspace build:backend、prune成功，镜像内audit0 |
| docker compose config --quiet | exit0；测试覆盖层只改本地HTTPS/端口，保留实际服务、secret和迁移命令 |
| up -d db migrate；--profile setup run --rm initialize-admin；up -d --wait api proxy | 修复后exit0；8个迁移，管理员初始化成功，API/PG健康 |
| 内部CA可信HTTPS /health、匿名管理接口、CSRF登录和Cookie | health200、匿名401；登录200，Set-Cookie具Secure/HttpOnly/SameSite=Strict；错误Origin写403 |
| 虚构业务HTTP | 客户/地址/商品/仓库、入库10瓶成本20、确认销售2瓶金额10、实收12并核销、月结均成功 |
| sh infra/database.sh backup backups/fictional.dump | exit0；archive0600；重复同名备份拒绝 |
| sh infra/database.sh restore backups/fictional.dump hyp_restore_container_test | exit0；恢复至独立新库；重复目标拒绝，原数据不变 |
| 全表业务核对 | public全部47表逐行JSON稳定md5一致；库存8瓶/16.00，客户净余额-2.00 |
| 恢复库再次migrate | applied=[]，checksum与schema保持一致 |
| 将临时HYP_DB_NAME切至恢复库并up -d --wait api | exit0；HTTPS health200，切库后47表摘要仍等于恢复前，原库保留直至测试清理 |
| 带LF与无LF secret | 两类均实际PG认证成功；无秘密回显 |
| 数据库角色权限 | rolsuper/rolcreatedb/rolcreaterole均false；CREATE DATABASE、CREATE ROLE明确permission denied；自身schema CREATE TABLE仍可执行并ROLLBACK |
| 迁移失败启动闸门 | 测试migrate exit17时API保持停止；正常迁移后重新健康 |
| 清理 | compose -p huoyoupu-test-az4j down --volumes --remove-orphans成功；仅删除测试应用标签；项目容器/网络/卷按标签查询全空，临时源码/秘密/归档目录已删除 |

应用角色同时承担迁移，拥有自身数据库和schema的DDL权限，不能描述为“运行账号绝对无DDL”。它没有集群建库/建角色/超级用户权限；迁移和运行角色分离属于后续独立权限设计。

## HTTPS和重现边界

测试覆盖层将代理发布端口替换为127.0.0.1:49443:443，API/PG不发布端口，PUBLIC_ORIGIN=https://localhost:49443。Caddy测试配置如下；没有公网ACME、没有向宿主系统信任库安装CA，客户端仅通过--cacert/专用SSL context显式信任测试根证书：

```caddyfile
{
  auto_https disable_redirects
}
localhost {
  tls internal
  encode zstd gzip
  reverse_proxy api:3000
}
```

[官方Caddy说明](https://caddyserver.com/docs/automatic-https/)明确本地HTTPS使用内部CA，不执行公网ACME或DNS验证。此证据证明Linux容器内HTTPS反代、证书链与后端Cookie/Origin行为；没有证明公网DNS、80/443路由、外部ACME签发或独立Linux生产宿主的服务管理/存储性能。

生产操作步骤见 [部署说明](../../deployment.md)。隔离复核使用的 [HTTPS业务检查脚本](deployment-http-check.py) 和 [逐表摘要脚本](deployment-manifest.mjs)已保留：前者仅供具有虚构测试secret及测试CA的隔离目录运行，后者通过`compose exec -T api node --input-type=module < manifest.mjs`在应用容器执行。没有将临时secret或dump提交仓库。真实发布前仍需固定审查后的镜像digest、真实域名与生产环境配置，并执行生产端到端检查。
