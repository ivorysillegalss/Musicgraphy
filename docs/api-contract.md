# API Contract

## 1) POST /api/manual-entry

### 描述
手动录入一条音乐记录，并由服务端调用 MusicBrainz 自动补全地理信息。

### Request Body

```json
{
  "artistName": "Utada Hikaru",
  "releaseTitle": "First Love",
  "listenAt": "2026-02-19T08:00:00.000Z",
  "score": 9,
  "personalTags": ["city-pop", "nostalgia"]
}
```

### Validation
- `artistName`: required, non-empty string
- `releaseTitle`: required, non-empty string
- `listenAt`: required, valid ISO datetime
- `score`: required, number in [1, 10]

### Success 200

```json
{
  "id": "uuid",
  "albumMbid": "release-mbid",
  "albumTitle": "First Love",
  "releaseDate": "1999-03-10",
  "releaseYear": 1999,
  "listenAt": "2026-02-19T08:00:00.000Z",
  "score": 9,
  "personalTags": ["city-pop", "nostalgia"],
  "artistGeo": {
    "artistId": "artist-mbid",
    "artistName": "Utada Hikaru",
    "countryCode": "JP",
    "countryName": "Japan",
    "cityName": "Tokyo",
    "coordinates": {
      "lat": 36,
      "lng": 138
    }
  }
}
```

### Error 400

```json
{
  "error": "score must be a number between 1 and 10."
}
```

---

## 2) Phase 2 预留接口（建议）

### GET /api/records?startYear=1990&endYear=2000
- 返回当前用户在年份区间内的记录。

### POST /api/records/import/lastfm
- 触发 Last.fm 增量导入（当前为同步处理模式）。

Request Body（可选）：

```json
{
  "username": "your-lastfm-name",
  "limit": 30,
  "score": 7,
  "fromUnix": 1739900000
}
```

说明：
- `username` 省略时回退到环境变量 `LASTFM_USERNAME`
- `limit` 范围 1~100，默认 30
- `score` 范围 1~10，默认 7
- `fromUnix` 省略时，服务端自动读取该用户已导入 Last.fm 记录的最新时间做增量

Success 200：

```json
{
  "summary": {
    "username": "your-lastfm-name",
    "fetched": 30,
    "imported": 18,
    "skipped": 10,
    "failed": 2
  },
  "failures": [
    {
      "artistName": "Some Artist",
      "releaseTitle": "Some Album",
      "reason": "No matching release found in MusicBrainz."
    }
  ]
}
```

### PATCH /api/records/:id
- 更新 `score`、`personalTags` 等用户自有字段。

---

## 2.1) POST /api/records/mark-heard

### 描述
在首页地图上直接将一个代表专辑标记为“我听过”。

### Request Body

```json
{
  "albumTitle": "First Love",
  "artistName": "Utada Hikaru",
  "releaseYear": 1999,
  "countryCode": "JP",
  "countryName": "Japan",
  "cityName": "Tokyo",
  "coordinates": {
    "lng": 139.6917,
    "lat": 35.6895
  }
}
```

### Success 200
- 返回标准 `UserRecord`。

说明：当前地理维度优先，首页已不以内嵌 Last.fm 导入为主要入口。

---

## 2.2) GET /api/discovery

### 描述
按地图视野 + 时间范围从发现池中随机筛选代表专辑。

### Query
- `west,south,east,north`：当前地图 bbox
- `zoom`：当前缩放级别
- `minYear,maxYear`：发行年代范围（时间滚动条）
- `countries`：可选，逗号分隔国家偏好
- `seed`：可选，随机种子（刷新随机专辑）

### Success 200

```json
{
  "albums": []
}
```

---

## 2.3) /api/discovery/manage（管理员）

### 描述
维护 `discovery_pool` 数据池。

- `GET`：列表查询
- `POST`：新增或覆盖
- `PATCH`：更新 `enabled/weight/releaseYear`
- `DELETE?id=...`：删除

## 3) 通用错误结构（建议）

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "score must be in range",
    "details": []
  }
}
```

说明：当前代码仍使用简化错误结构（字符串），在 Phase 2 可升级至统一结构。

更新：当前 API 已支持统一错误结构（`error.code/message/details`），并兼容前端显示。