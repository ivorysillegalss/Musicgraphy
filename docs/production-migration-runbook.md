# 生产环境高稳定性迁移与部署 Runbook（SQLite + Docker）

> 适用场景：当前项目使用本地 SQLite（`data/dream.db`）作为唯一持久化，目标是在新服务器稳定上线，并尽量降低数据丢失与不可用风险。

## 1. 目标与原则

- 目标：将应用与现有 SQLite 数据稳定迁移到新服务器，并完成可回滚上线。
- 核心原则：
  - 先预演再正式切换。
  - 正式迁移必须有可验证备份。
  - 切换窗口内冻结写入，避免增量遗漏。
  - 每一步都有验收点和回滚动作。

## 2. 目录与约定

- 旧服务器项目路径：`/srv/dream`
- 新服务器项目路径：`/srv/dream`
- SQLite 文件：`/srv/dream/data/dream.db`
- 容器服务名：`app`（与 `docker-compose.yml` 一致）
- 对外访问端口：`3000`
- 备份目录：`/srv/backups/dream`

如你的路径不同，替换为实际路径。

## 3. 前置检查（T-1 天）

1. 在新服务器安装并验证：
   - `docker`、`docker compose`、`rsync`、`sha256sum`
2. 打开防火墙端口（如需要）：
   - `3000`（或你反向代理后的端口）
3. 准备 `.env.local`（生产值，不提交 Git）：
   - `LOCAL_DB_PATH=/app/data/dream.db`
   - `DISCOVERY_ADMIN_EMAILS=...`
   - `MUSIC_APP_CONTACT=...`
   - `LASTFM_API_KEY` / `LASTFM_USERNAME`（如使用）
4. 在旧服务器确认当前数据文件存在：
   - `ls -lh /srv/dream/data/dream.db`
5. 在旧服务器执行一次构建自检：
   - `cd /srv/dream && npm run build`

验收标准：依赖、端口、环境变量、构建全部通过。

## 4. 迁移策略（推荐）

推荐采用“两阶段迁移”：

1. 预拷贝（业务不停机）
   - 先拷贝代码和数据库到新服务器，做演练启动。
2. 正式切换（短暂停机）
   - 旧服务短暂停写，执行最终数据库拷贝，启动新服务并验证。

这样可以把停机时间压缩到分钟级。

## 5. 预演流程（不对外切流）

### 5.1 新服务器拉取代码

```bash
cd /srv
git clone <your-repo-url> dream
cd /srv/dream
git checkout <target-commit-or-tag>
```

如果代码已存在：

```bash
cd /srv/dream
git fetch --all --tags
git checkout <target-commit-or-tag>
```

### 5.2 预创建目录与环境文件

```bash
mkdir -p /srv/dream/data
cp /path/to/secure/.env.local /srv/dream/.env.local
chmod 600 /srv/dream/.env.local
```

### 5.3 从旧服务器预拷贝 SQLite（不停机快照）

在新服务器执行（从旧服务器拉）：

```bash
mkdir -p /srv/backups/dream
rsync -avz --progress <old-host>:/srv/dream/data/dream.db /srv/backups/dream/dream-precutover.db
```

### 5.4 启动预演容器

```bash
cd /srv/dream
cp /srv/backups/dream/dream-precutover.db /srv/dream/data/dream.db
docker compose up -d --build
```

### 5.5 预演验证

```bash
docker compose ps
docker compose logs app --tail=200
curl -fsS http://127.0.0.1:3000/api/discovery | head
```

如果有管理员账号，再验证：

- 登录后查看首页地图是否正常。
- 检查历史记录数量是否符合预期。

验收标准：容器健康、API 可返回、页面可访问。

## 6. 正式切换流程（建议维护窗口）

## 6.1 进入维护模式（冻结写入）

在旧服务器执行：

```bash
cd /srv/dream
docker compose stop app
```

说明：当前项目写入来自 API，停 `app` 可确保数据库不再变化。

## 6.2 制作旧库备份（冷备）

```bash
mkdir -p /srv/backups/dream
cp /srv/dream/data/dream.db /srv/backups/dream/dream-cutover-$(date +%F-%H%M%S).db
```

## 6.3 传输最终数据库到新服务器

在新服务器执行：

```bash
rsync -avz --progress <old-host>:/srv/dream/data/dream.db /srv/dream/data/dream.db
```

## 6.4 校验文件一致性（强烈建议）

在旧服务器执行：

```bash
sha256sum /srv/dream/data/dream.db
```

在新服务器执行：

```bash
sha256sum /srv/dream/data/dream.db
```

对比哈希一致后再继续。

## 6.5 启动新服务器服务

```bash
cd /srv/dream
docker compose up -d --build
docker compose ps
docker compose logs app --tail=200
```

如果你使用镜像仓库而不是本地 build，可改为：

```bash
docker compose pull
docker compose up -d
```

## 6.6 切换流量

按你的流量入口执行其一：

- DNS 切换到新服务器。
- 反向代理 upstream 改到新服务器。
- LB 后端权重切换到新服务器。

建议先灰度（10% -> 50% -> 100%），每阶段观察 5-15 分钟。

## 7. 上线后验证清单（T+0）

1. 健康检查：
   - `curl -fsS http://127.0.0.1:3000/api/discovery`
2. 读写验证：
   - 页面手动新增 1 条记录。
   - 刷新后仍存在。
3. 数据数量快照校验（可选）：
   - 进入容器查询关键表数量（`user_records`、`discovery_pool`、`users`）。
4. 错误日志巡检：
   - `docker compose logs app --since=10m`
5. 外部依赖巡检：
   - 手动触发一次搜索或导入，确认 MusicBrainz/Last.fm 无明显报错。

## 8. 回滚方案（必须预先准备）

回滚触发条件示例：

- 5xx 明显上升且 10 分钟内无法恢复。
- 关键写入失败率持续高。
- 数据校验发现明显缺失。

回滚步骤：

1. 新服务器下线：

```bash
cd /srv/dream
docker compose down
```

2. 流量切回旧服务器（DNS/LB/代理恢复）。
3. 旧服务器拉起服务：

```bash
cd /srv/dream
docker compose up -d
```

4. 核查旧服务器读写是否恢复。

注意：若新服务器切换后产生了新写入，回滚前先评估是否需要把新写入回灌旧库。

## 9. 数据迁移注意事项（针对你当前项目）

1. SQLite 可以一并迁移
- 是的，直接迁移 `dream.db` 文件即可，这是当前最稳方案。

2. 不建议在运行中直接拷贝作为最终切换数据
- 运行中拷贝可用于预演。
- 正式切换必须停写后再拷贝最终库。

3. Supabase 历史迁移脚本仅用于 `supabase -> sqlite`
- 当前仓库内没有 `sqlite -> 其他数据库` 的官方脚本。

4. 若要做跨架构长期演进
- 后续可增加定期导出（SQL/CSV）与异地备份策略。

## 10. 建议的运维增强（提升稳定性）

1. 增加定时备份（每天）
- 备份 `dream.db` 到本机 `backup` 目录并保留 7-30 天。

2. 增加容器健康探针
- 通过反向代理或编排层做 HTTP 健康检查。

3. 增加日志轮转
- 防止单机磁盘被日志占满。

4. 增加变更发布规范
- 每次上线固定使用 tag 或 commit SHA，确保可追溯。

## 11. 最小执行命令速查

### 11.1 切换当天（旧服务器）

```bash
cd /srv/dream
docker compose stop app
cp /srv/dream/data/dream.db /srv/backups/dream/dream-cutover-$(date +%F-%H%M%S).db
sha256sum /srv/dream/data/dream.db
```

### 11.2 切换当天（新服务器）

```bash
cd /srv/dream
rsync -avz --progress <old-host>:/srv/dream/data/dream.db /srv/dream/data/dream.db
sha256sum /srv/dream/data/dream.db
docker compose up -d --build
curl -fsS http://127.0.0.1:3000/api/discovery | head
```

## 12. 常见故障：Docker 构建阶段 `next build` 被 `SIGKILL`

现象：

- 日志出现 `npm error signal SIGKILL`，通常发生在 `RUN npm run build`。

根因：

- 服务器内存不足，构建进程被 OOM Killer 杀掉。

处理顺序（按优先级）：

1. 直接使用已调整的 Dockerfile 重新构建
- 已启用：`NEXT_TELEMETRY_DISABLED=1`、`NODE_OPTIONS=--max-old-space-size=1536`、`next build --webpack`。

2. 构建前关闭其他大内存进程

```bash
docker ps
docker stop <不相关容器ID>
```

3. 增加 2G swap（小内存机强烈建议）

```bash
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h
```

4. 重新构建并观察日志

```bash
cd /srv/dream
docker compose build --no-cache app
docker compose up -d
docker compose logs app --tail=200
```

5. 如仍失败，进一步降低并发与峰值内存
- 在宿主机先构建一次：`npm ci && npm run build -- --webpack`，确认机器本身可构建。
- 或升级服务器规格（推荐 >= 2 vCPU / 4GB RAM）。

辅助诊断命令：

```bash
free -h
dmesg -T | grep -Ei 'killed process|out of memory|oom'
```

---

如需零停机级别迁移，SQLite 本身不适合复杂双写/双活方案；届时建议评估迁移到网络型数据库（如 Postgres）并配套在线变更流程。
