# 地图来源

账号与同步使用 Supabase 官方 `@supabase/supabase-js` 2.119.2（MIT），浏览器分发文件保存在 `assets/vendor/supabase.js`，许可证为同目录 `supabase-LICENSE`。来源：https://github.com/supabase/supabase-js 。运行 `npm ci` 后可通过 `npm run vendor:supabase` 更新本地分发文件，版本记录在 `assets/vendor/supabase-version.json`。

页面氛围素材 `assets/japan-atmosphere.webp`（樱花、富士山、青海波）与 `assets/pilgrimage-characters.webp`（《孤独摇滚！》后藤一里、《吹响吧！上低音号》黄前久美子）由本次 imagegen 生成，非官方立绘或动画截图。角色及作品相关权利归各自权利人；图片仅作个人旅行页面的低透明度背景装饰。

- 地点名称与地址搜索：[Photon](https://photon.komoot.io/)，[接口文档](https://github.com/komoot/photon/blob/master/docs/api-v1.md)，地点数据来自 [© OpenStreetMap contributors / ODbL](https://www.openstreetmap.org/copyright)。仅调用公开 `/api/`，限定日本境内，使用 `lang=default` 保留本地名称。界面保留 Photon 和 OpenStreetMap 署名，门牌号缺失时标注不完整，不把区域地址伪装成完整门牌地址。公共演示服务仅适用于合理低频请求，不保证可用性，见 [使用说明](https://github.com/komoot/photon#demo-server)。未调用 Google Places 或 Google Geocoding API。

- 天气：[Open-Meteo](https://open-meteo.com/)，[Forecast API 文档](https://open-meteo.com/en/docs)，数据依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供。页面保留来源链接及读取时间。富士见参考分由本项目依据预报云量、地面能见度与降水自行计算，不是 Open-Meteo 官方见山概率；面板内说明估算方式与限制。免费接口用于当前非商业旅行原型。

- 渲染：MapLibre GL JS 5.6.1，BSD-3-Clause，https://github.com/maplibre/maplibre-gl-js 。JS 与 CSS 从 unpkg 加载。
- 矢量地图与 Bright / Positron 样式来自 OpenFreeMap：https://openfreemap.org/ ，https://github.com/hyperknot/openfreemap-styles 。默认 `map-color-style.js` 基于 https://tiles.openfreemap.org/styles/bright ，调整水面、公园、道路、建筑、地点和轨道配色，保留缩放相关的标签。可选 `map-style.js` 在 Positron 基础上删除建筑和部分道路标注，强调轨道与车站；提供方名称与地图数据署名保留在地图中。当前底图未使用 Microsoft / Zenrin 数据，不显示其署名。
- 底图数据：© OpenStreetMap contributors、© OpenMapTiles。数据按 ODbL 等各自条款提供，参见 https://www.openstreetmap.org/copyright 、https://openmaptiles.org/ 。
- 备用栅格地图：国土地理院淡色地图，https://maps.gsi.go.jp/development/ichiran.html 。
- Google Maps 仅通过官方 Maps URLs 跳转，不加载 Google 地图 API：https://developers.google.com/maps/documentation/urls/get-started 。
- 按钮应用图标来自各自官方网站，分别为 https://www.gstatic.com/images/branding/product/2x/maps_96in128dp.png 、https://www.airbnb.com/favicon.ico 、https://www.ctrip.com/favicon.ico 。图标及商标归对应权利人所有，仅用于标识跳转目标。
- 新增平台按钮图标：Agoda https://www.agoda.com/favicon.ico （原始数据为 PNG，保存为 `assets/agoda.png`），Klook https://cdn.klook.com/s/dist_web/assert/desktop/imgs/favicon-6f375b9820.png ，Tabelog https://tblg.k-img.com/images/smartphone/favicon.ico?20230727 ，HopeGoo 使用其官方 App Store 应用 https://apps.apple.com/app/id6479733264 的公开 `artworkUrl100` 图标（通过 Apple `https://itunes.apple.com/lookup?id=6479733264` 查询，原始数据为 JPEG，保存为 `assets/hopegoo.jpg`）。图标及商标归对应权利人所有，仅用于标识跳转目标；餐具图标 `assets/dining.svg` 为本项目绘制的简单线条图形。

此项目参考 nearcade 的 MapLibre 渲染思路，未复制 nearcade 的源码或调用其私人地理服务。

maimai 按钮及机厅标记图标由用户提供（`maimai.sega.jp-icon.ico`），按原文件复制至 `assets/maimai.ico`，用于标识 maimai 相关功能。图标及 maimai 商标归 SEGA 等相应权利人所有。

巡礼信息来自 Anitabi 及其贡献者，接口文档：https://github.com/anitabi/anitabi.cn-document/blob/main/api.md 。本项目仅调用文档中的作品轻量资料及点位详情接口，未复制主站静态数据。默认作品 ID 分别对应 https://bgm.tv/subject/115908 、https://bgm.tv/subject/1424 、https://bgm.tv/subject/428735 、https://bgm.tv/subject/328609 。

Anitabi 点位及相关截图信息依其文档按 CC BY-NC-SA 4.0 共享：https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans 。页面保留 Anitabi 署名、协议链接及接口返回的 origin/originURL；截图使用 image.anitabi.cn 的 h160 缩略图，原作品与截图权利归相应权利人。加入行程保留来源及作品信息；如后续公开发布或商用，应按来源许可另行核实使用范围。
