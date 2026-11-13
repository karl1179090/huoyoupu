# Drizzle依赖安全修补验证

2026-11-11，前端workspace安装后的审计发现既有drizzle-orm0.44.7受GHSA-gpj5-g38j-94v9影响。已仅将packages/database/package.json及根package-lock.json中的该依赖精确修补至0.45.2；安装输出changed 1 package，没有顺带升级其他后端依赖，没有改业务规则、API实现或迁移。

## 依据与范围

[维护者官方通告](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9)明确0.45.2修复SQL标识符内嵌分隔符转义。受影响路径是不可信运行时输入进入identifier/alias构造；现有源码检索仅发现静态schema和数据库工厂，未发现该输入路径。此审查不代替依赖修补。

官方registry的0.45.2元数据peer要求pg>=8，现有pg8.23.1满足；相关@types/pg为可选peer。lock resolved为https://registry.npmjs.org/drizzle-orm/-/drizzle-orm-0.45.2.tgz，sha512完整性与官方精确版本元数据逐字一致。TLS保持校验，使用独立/tmp缓存。

## 实际执行

| 命令/验证 | 结果 |
| --- | --- |
| npm view drizzle-orm@0.45.2 version peerDependencies engines dist.integrity --json（官方registry） | exit0，核对修复版本、peer和integrity |
| npm install drizzle-orm@0.45.2 --save-exact -w @huoyoupu/database --ignore-scripts --cache=/tmp/huoyoupu-web-npm-cache --registry=https://registry.npmjs.org --no-audit --no-fund | exit0，changed 1 package |
| npm ls --workspaces --depth=0 | exit0，无peer/engine错误 |
| npm audit --json --cache=/tmp/huoyoupu-web-npm-cache --registry=https://registry.npmjs.org | exit0；info/low/moderate/high/critical均0 |
| npm run build:backend | exit0，contracts→money→database→api |
| npm run typecheck -w @huoyoupu/contracts -w @huoyoupu/money -w @huoyoupu/database -w @huoyoupu/api | exit0，四workspace严格检查 |
| npm run test:unit | exit0，37/37，0失败/取消/跳过 |
| npm run test:db | exit0，真实PG107/107，0失败/取消/跳过，包含docs/verification独立验收与79路由 |
| PgDialect.escapeName含内嵌双引号的直接断言 | exit0，a"b转为SQL标识符"a""b"，确认转义行为 |

本轮使用Node26.13.0/PostgreSQL18.6和原有隔离临时PG运行器，不触碰开发/真实业务库。没有改前端文件或在施工时跑前端编译；根全栈build待前端稳定后执行。既有开发API进程没有被终止或重启，运行进程重新加载补丁由协调者安排。没有进行Docker部署，14.3边界不变。
