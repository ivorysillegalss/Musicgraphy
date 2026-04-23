export const translations = {
  en: {
    navbar: {
      title: "Music Geography",
      subtitle: "Personal Discovery Timeline",
      guide: "Guide & Info",
      manageGeo: "Manage Geo",
      signOut: "Sign Out",
      localMode: "Local Mode",
      signIn: "Sign In"
    },
    library: {
      title: "Selfiie",
      favorites: "Favorites",
      history: "Listening History",
      emptyFavorites: "No favorites yet.",
      emptyHistory: "No records yet."
    },
    search: {
      artistOrBand: "Artist or Band",
      albumName: "Album Name",
      tags: "Tags:",
      decade: "Decade:",
      region: "Region:",
      externalSearch: "External Search (Deezer)",
      externalHelp: "Try Deezer if not in local library",
      cooldown: "External search is on cooldown. Please try again later.",
      notFound: "No results found",
      searching: "Searching...",
      escToClose: "ESC to close"
    },
    controls: {
      records: "records",
      albums: "albums",
      timeline: "Timeline Overview",
      allYears: "All Years"
    },
    guide: {
      welcome: "Welcome to Music Geography",
      explorerTitle: "Explorer Map",
      explorerDesc: "Zoom into any region to discover random representative albums. Click markers to listen or collect.",
      personalTitle: "Personal Tracks",
      personalDesc: 'Mark albums as "Heard" (Green dots). Your history is visualized directly on the same map layer.',
      timeTitle: "Time Travel",
      timeDesc: "Filter both discovery and personal layers by release year (1960-2026).",
      searchTitle: "Quick Search",
      searchDesc: "Use the right-side Search button to instantly find artists or albums and jump the map to that location.",
      localTitle: "Highly Customizable",
      localDesc: "Currently in development, aiming for a Wikipedia-style community maintenance model.",
      status: "Backend Status",
      ready: "Local SQLite Ready",
      notConfigured: "Not Configured"
    }
  },
  zh: {
    navbar: {
      title: "Musicgraphy",
      subtitle: "构造你的音乐地图",
      guide: "指南 & 信息",
      manageGeo: "Managing Geo",
      signOut: "退出登录",
      localMode: "本地模式",
      signIn: "登录"
    },
    library: {
      title: "画像",
      favorites: "留意",
      history: "听过",
      emptyFavorites: "无",
      emptyHistory: "无"
    },
    search: {
      artistOrBand: "艺人or乐队",
      albumName: "专辑名称",
      tags: "标签:",
      decade: "年代:",
      region: "地区:",
      externalSearch: "外部搜索 (Deezer)",
      externalHelp: "本地无结果时可尝试外部搜索",
      cooldown: "第三方搜索冷却中，请稍后再试。",
      notFound: "未找到相关结果",
      searching: "搜索中...",
      escToClose: "ESC 关闭"
    },
    controls: {
      records: "条记录",
      albums: "张随机专辑",
      timeline: "时间轴速览",
      allYears: "全部年份"
    },
    guide: {
      welcome: "欢迎来到Musicgraphy",
      explorerTitle: "探索地图",
      explorerDesc: "缩放任意区域，即可发现随机掉落的代表性专辑。点击坐标以聆听或收藏。",
      personalTitle: "属于你的轨迹",
      personalDesc: "将专辑标记为“已听过”（绿色标记）。你的全部收听历史将永远在地图上与探索内容交织。",
      timeTitle: "穿梭时间",
      timeDesc: "通过底部滑块，自由筛选特定年代 (1960-2026) 的发现推荐与个人历史。",
      searchTitle: "快速搜索",
      searchDesc: "点击右侧 Search 按钮即可搜索艺人或专辑，并让地图快速定位到目标位置。",
      localTitle: "高度定制化",
      localDesc: "开发中，意在采用wikipeida式的维护",
      status: "后端状态",
      ready: "已连接SQLite",
      notConfigured: "未配置"
    }
  }
};

export type Language = 'en' | 'zh';
export type TranslationKey = keyof typeof translations.en;
