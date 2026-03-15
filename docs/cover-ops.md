# 封面抓取与回填操作说明

## 1. 封面来源优先级

系统当前封面查找顺序：
1. iTunes
2. MusicBrainz + Cover Art Archive
3. Deezer

说明：
- 系统会对候选封面做质量评分（分辨率/来源/占位图惩罚）并选择最佳结果。
- 前端加载失败时会自动尝试候选列表中的下一个 URL。
- 全部失败才回退到本地生成占位封面。

## 2. 持久化缓存

封面结果会写入本地 SQLite 表 `album_cover_cache`。

缓存策略：
- 命中封面（found=1）：30 天 TTL
- 未命中（found=0）：3 天 TTL

接口支持 `refresh=1` 强制刷新。

## 3. 手动调试单张封面

示例：

```bash
curl "http://localhost:3000/api/itunes-proxy?artist=Radiohead&album=OK%20Computer"
```

强制刷新：

```bash
curl "http://localhost:3000/api/itunes-proxy?artist=Radiohead&album=OK%20Computer&refresh=1"
```

## 4. 批量回填 discovery_pool 封面

### 方式 A：npm 脚本（推荐）

```bash
npm run backfill:covers
```

可选环境变量：
- `DREAM_BASE_URL`：默认 `http://localhost:3000`
- `BACKFILL_COVER_LIMIT`：默认 `300`，范围 `1~1000`
- `BACKFILL_COVER_FORCE_REFRESH=1`：强制忽略缓存重新抓
- `BACKFILL_USER_ID` / `BACKFILL_USER_EMAIL`：覆盖默认请求身份

示例：

```bash
BACKFILL_COVER_LIMIT=500 BACKFILL_COVER_FORCE_REFRESH=1 npm run backfill:covers
```

### 方式 B：直接调用管理接口

```bash
curl -X POST "http://localhost:3000/api/discovery/manage/backfill-covers" \
  -H "content-type: application/json" \
  -H "x-user-id: local-user" \
  -H "x-user-email: local@localhost" \
  -d '{"limit":300,"forceRefresh":false}'
```

返回值包含：
- `processed`
- `found`
- `missing`
- `cacheHits`
- `refreshed`
- 失败样本 `failures`
