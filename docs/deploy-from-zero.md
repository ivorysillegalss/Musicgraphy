# 从 0 部署与试运行清单

> 当前默认部署模式：本地后端 + SQLite（不再依赖 Supabase）。
> Supabase 相关内容保留为历史参考。

## 1. 必备账号与服务

### 1.1 地图渲染（内置，无需账号）
- 用途：
  - 首页世界地图底图渲染
  - 地图缩放/平移与点位交互
- 说明：
  - 当前使用本地 `d3-geo + topojson` + 仓库内 `public/world-110m.json`，无需第三方地图 API Key。

### 1.2 本地数据库（必需）
- 用途：
  - 用户记录持久化（SQLite）
  - 艺人地理缓存
  - 发现池数据管理
- 对应环境变量：
  - `LOCAL_DB_PATH`（默认 `./data/dream.db`）
  - `COVER_CACHE_DIR`（默认 `./data/covers`）
  - `NEXT_PUBLIC_LOCAL_DEFAULT_USER_ID`
  - `NEXT_PUBLIC_LOCAL_DEFAULT_USER_EMAIL`
  - `LOCAL_DEFAULT_USER_ID`
  - `LOCAL_DEFAULT_USER_EMAIL`
  - `DISCOVERY_ADMIN_EMAILS`

### 1.3 MusicBrainz（必需，但无需 API Key）
- 用途：
  - 专辑/艺术家元数据与地理信息解析
- 你需要准备：
  - 联系信息（邮箱或项目 URL），用于 `User-Agent`
- 对应环境变量：
  - `MUSIC_APP_CONTACT`
  - `MUSIC_APP_NAME`（可用默认）
  - `MUSIC_APP_VERSION`（可用默认）

### 1.4 Last.fm（可选）
- 用途：
  - 自动导入近期收听历史
- 你需要准备：
  - Last.fm API Key
  - Last.fm 用户名（默认值，可在页面覆盖）
- 对应环境变量：
  - `LASTFM_API_KEY`
  - `LASTFM_USERNAME`

## 2. 本地环境准备

1) 安装依赖

```bash
npm install
```

2) 创建本地环境文件

```bash
cp .env.example .env.local
```

3) 填写 `.env.local` 中所有变量

## 3. 数据库初始化（本地 SQLite）

无需手动执行 SQL，服务首次启动会自动创建：
- `users`
- `user_records`
- `artist_geo_cache`
- `discovery_pool`

## 4. 启动项目

```bash
npm run dev
```

打开：
- `http://127.0.0.1:3000`

### Docker（推荐）

```bash
docker compose up --build
```

说明：
- 持久化数据位于宿主机 `./data`
- 容器内数据库路径默认为 `/app/data/dream.db`
- 专辑封面缓存目录挂载为 `./data/covers -> /app/public/covers`

#### 通过复制 `dream.db` 迁移

1) 停止容器：`docker compose down`
2) 覆盖宿主机数据库文件：`cp /path/to/old/dream.db ./data/dream.db`
3) 重启：`docker compose up -d`

如果源库使用了 SQLite WAL，建议同时复制 `dream.db-wal` 与 `dream.db-shm`。
如果希望迁移封面缓存，也请同步复制 `./data/covers`。

## 5. 首次联调顺序（建议）

1. 先看页面顶部“部署引导”状态是否都为已配置。
2. 默认会自动使用本地用户（可通过环境变量自定义）。
3. 手动添加一条专辑记录（验证 MusicBrainz 解析 + DB 写入）。
4. 地图点击点位，验证缩放/平移和标记交互。
5. 配置 Last.fm 后执行导入，验证自动同步。

## 6. 数据清理与重置（可选）

适用于你希望“清空重跑”验证部署流程：

### 6.1 清理本地缓存（浏览器）
- 退出登录。
- 在浏览器开发者工具中清理站点 `localStorage`（主要是收藏缓存）。

### 6.2 清理本地业务数据（保留代码）

```bash
rm -f ./data/dream.db
```

下次启动会自动重建空库。

## 7. 发现池管理 API（管理员）

前提：
- 登录邮箱包含在 `DISCOVERY_ADMIN_EMAILS`（为空时默认允许本地管理）

接口：
- `GET /api/discovery/manage`：查询池
- `POST /api/discovery/manage`：新增或覆盖
- `PATCH /api/discovery/manage`：更新 `enabled/weight/releaseYear`
- `DELETE /api/discovery/manage?id=...`：删除

示例 POST body：

```json
{
  "id": "jp-first-love",
  "albumTitle": "First Love",
  "artistName": "Utada Hikaru",
  "releaseYear": 1999,
  "countryCode": "JP",
  "countryName": "Japan",
  "cityName": "Tokyo",
  "lng": 139.6917,
  "lat": 35.6895,
  "enabled": true,
  "weight": 3
}
```

## 8. 常见问题

### Q1: 地图能显示，但国家钻取城市为空
- 原因：该国家城市名较少/无城市名，或 Geocoding 未返回结果。
- 处理：先新增更多带 `city_name` 的记录，再试。

### Q2: 登录成功但记录保存失败
- 原因：`LOCAL_DB_PATH` 不可写，或容器未挂载 `./data`。
- 处理：检查目录权限与 compose 的 `volumes` 配置，确认 `./data` 可写。

### Q3: MusicBrainz 请求失败
- 原因：网络波动，或未设置合理 `MUSIC_APP_CONTACT`。
- 处理：补全 `MUSIC_APP_CONTACT` 并重试。

### Q4: Last.fm 导入返回失败
- 原因：`LASTFM_API_KEY` / `LASTFM_USERNAME` 未配置，或 API 限流。
- 处理：检查环境变量和 Last.fm 账号配置。
