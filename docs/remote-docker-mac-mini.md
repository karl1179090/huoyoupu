# 使用局域网Mac mini的Docker

当前开发Mac无需安装Docker Desktop。可通过现有Remote Desktop Commander在Mini上运行Docker命令；若未来需要在当前Mac终端直接使用docker命令，则另选仅CLI的SSH方案。初始连接检查没有创建容器或卷；后续按授权在唯一临时项目完成虚构资料容器验收并清理，见 [实际记录](verification/build-web-inventory-v1/deployment-container.md)。没有生产部署或真实库操作。

## 已实际只读检查（2026-11-11）

目标设备为Remote Desktop Commander的remote-mac.local（deviceId 00000000-0000-0000-0000-000000000000），实际主机mac-mini.local，用户dev，Apple Silicon Mac mini（Mac16,10）。CLI为Docker29.4.0 build9d7ad9f；Compose为v5.1.2。

执行命令：

```sh
docker info --format 'ServerVersion={{.ServerVersion}} OSType={{.OSType}} Architecture={{.Architecture}} Name={{.Name}}'
docker compose version
docker context show
docker context inspect --format '{{.Name}} {{.Endpoints.docker.Host}}'
ipconfig getifaddr en0
ipconfig getifaddr en1
nc -z -G 2 127.0.0.1 22
```

初次检查context为desktop-linux，endpoint为unix:///Users/dev/.docker/run/docker.sock；docker info无法连接该socket，四项Server字段为空，不能由CLI版本推断Engine已启动。Mini的en0为192.0.2.10，en1为192.0.2.11。Mini本机127.0.0.1:22及当前开发Mac到上述两个IP:22的有限TCP探测均成功；尚未验证SSH登录、SSH会话PATH或远程Docker socket权限。IP可能随局域网配置变化。

追加启动检查：按远程接入授权在同一Mini执行 `open -a Docker`，命令正常完成；随后只读 `docker info` 成功返回 `ServerVersion=29.4.0 OSType=linux Architecture=aarch64 Name=docker-desktop`。已确认该Mini的Docker Desktop Linux引擎可用。启动过程没有遇到要求用户介入的许可、权限或账户提示；没有创建业务容器/卷、同步项目或执行部署。

## 方案A：远程工具直接在Mini运行

使用现有Remote Desktop Commander，显式选择上述Mini设备后执行Docker命令。当前Mac无需Docker CLI、Compose插件或本地daemon。本轮已经验证远程命令通道及Mini上的Linux/aarch64 Engine可用（Server29.4.0）。

执行本项目容器验证时，先将审查过的项目代码同步到Mini上的独立目录，再通过远程工具在该目录运行构建、Compose和验收命令。秘密文件在Mini本地单独准备，不随源码提交或输出。初始只读轮次没有同步或启动业务；后续隔离验收仅上传源码白名单，在Mini生成临时secret、运行虚构夹具并清理，未上传真实env或credentials。

## 方案B：未来在当前Mac使用CLI经SSH连接

该方案需要当前Mac安装Docker CLI和Compose插件，无需安装本地Docker Desktop/Engine；目前尚未安装或配置。Mini必须允许SSH登录，SSH用户必须能访问其Docker socket，且非交互SSH环境能找到docker。端口22可达仅是其中一个前提。Docker官方支持通过SSH context连接远程Engine，并明确要求远程用户具备socket权限。[官方SSH连接说明](https://docs.docker.com/engine/security/protect-access/)

后续确认SSH认证、主机指纹和socket权限后，可用以下示例创建独立context；示例尚未执行，不表示SSH已配置：

```sh
docker context create huoyoupu-mini --docker host=ssh://dev@192.0.2.10
docker --context huoyoupu-mini info
docker --context huoyoupu-mini compose version
```

若默认socket发现与Mini的Docker Desktop socket不匹配，应先核对远程SSH会话的Docker context和socket发现机制；本轮未改socket软链接或权限。无需开放未加密的Docker TCP端口。

## 远程文件路径必须明确

bind mount的源位于Docker daemon所在主机，不能靠远程daemon直接读取当前开发Mac的文件。Docker Desktop会将其所在Mac的共享路径映射到Linux VM；这里的Mac指Mini。[官方bind mount约束](https://docs.docker.com/engine/storage/bind-mounts/)

本项目infra/compose.yaml挂载的001-create-app-role.sql、Caddyfile和file-backed secrets都必须在Mini存在，并由Mini的Compose执行目录正确解析。建议采用方案A，代码同步至Mini后在远端运行Compose，使相对路径和secret都来自同一台主机。不要将当前开发Mac的绝对路径直接交给Mini的daemon当作挂载源。

本地构建context可把允许的构建文件传给远端builder，COPY/ADD可访问该context；这不等于任意本地文件自动变成运行时挂载，也不自动同步Compose秘密文件。[官方构建context说明](https://docs.docker.com/build/concepts/context/)

## 验证边界

后续隔离验收已实际完成镜像构建、Compose初始化/权限、HTTPS业务HTTP及容器备份恢复/切库，见 [验收记录](verification/build-web-inventory-v1/deployment-container.md)。真实Linux生产宿主及公网HTTPS仍需按 [部署说明](deployment.md) 执行，不能仅凭远程连接声称上线。当前Mac没有安装任何Docker组件。
