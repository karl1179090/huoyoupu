# 工作区运行入口

根npm workspace包括apps/api、apps/web和packages/*；共享契约复用@huoyoupu/contracts，不复制接口类型。apps/web由前端实施者维护，根配置与lock由协调的依赖安装者统一维护。

2026-11-11按现有前端manifest安装：React/React DOM19.3.1、@types/react和@types/react-dom19.3.0、@vitejs/plugin-react4.7.0、Vite6.4.6、TypeScript5.9.3。manifest保留作者的caret范围，package-lock.json精确固定版本、官方registry来源及完整性。官方npm元数据确认插件peer包含Vite6、React DOM peer为React^19.3.1，Vite6.4.6支持Node>=22；本机Node26.13.0符合范围。

实际执行 `npm install --ignore-scripts --cache=/tmp/huoyoupu-web-npm-cache --registry=https://registry.npmjs.org --no-audit --no-fund` 成功（新增63包），`npm ls --workspaces --depth=0` exit0，无peer或engine警告。安装过程中未关闭TLS校验。源码施工期间尚未执行前端typecheck/build；安装成功不能代替页面或构建验收。

| 根命令 | 用途 |
| --- | --- |
| npm run dev:web | 启动前端workspace的Vite，host localhost |
| npm run dev:fixture | 启动仓库外随机临时PG/虚构资料API夹具，详见backend-development.md |
| npm run dev:api | 保留原真实环境变量驱动的API开发入口 |
| npm run typecheck:web | 前端严格类型检查，待前端源码稳定执行 |
| npm run build:web | 前端类型编译与Vite构建，待源码稳定执行 |
| npm run build:backend | contracts→money→database→api，仅后端构建 |
| npm run build | 先build:backend，再build:web |

联调使用http://localhost:5173，前端相对/api由Vite代理到127.0.0.1:3000；后端PUBLIC_ORIGIN对应localhost:5173。不为联调放宽Origin/CSRF/CORS或Cookie安全属性。夹具密码只在仓库外0700目录的0600凭证文件中，勿复制到源码或运行日志。

Dockerfile的后端build阶段仅额外COPY apps/web/package.json供npm ci解析workspace依赖图，不复制前端实现，构建入口使用build:backend。后续新增独立web-build/web目标才复制并构建前端，交由Caddy提供静态资源。此前后端镜像已在Mini隔离验证；新增全栈镜像尚待源码稳定后的实际构建，见 [部署配置准备](verification/build-web-inventory-v1/fullstack-deployment-preparation.md)。

首次npm audit发现既有后端依赖drizzle-orm0.44.7的high通告GHSA-gpj5-g38j-94v9（标识符转义）。已仅将该依赖精确修补至官方首个稳定修复版0.45.2，官方registry完整性匹配；复跑audit为0漏洞。后端构建/四workspace类型检查通过、纯测试37/37、真实PG107/107。现有代码仅发现静态Drizzle schema，业务查询使用pg参数化SQL，未发现将不可信输入传给Drizzle identifier/alias的路径；此次仍主动移除已知受影响版本。详见 [依赖修补报告](verification/build-web-inventory-v1/drizzle-patch.md)。[官方安全通告](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9)
