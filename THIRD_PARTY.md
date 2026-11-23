# 地图来源

- 天气：[Open-Meteo](https://open-meteo.com/)，[Forecast API 文档](https://open-meteo.com/en/docs)，数据依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供。页面保留来源链接及读取时间。富士见参考分由本项目依据预报云量、地面能见度与降水自行计算，不是 Open-Meteo 官方见山概率；面板内说明估算方式与限制。免费接口用于当前非商业旅行原型。

- 渲染：MapLibre GL JS 5.6.1，BSD-3-Clause，https://github.com/maplibre/maplibre-gl-js 。JS 与 CSS 从 unpkg 加载。
- 矢量地图与 Bright / Positron 样式来自 OpenFreeMap：https://openfreemap.org/ ，https://github.com/hyperknot/openfreemap-styles 。默认 `map-color-style.js` 基于 https://tiles.openfreemap.org/styles/bright ，调整水面、公园、道路、建筑、地点和轨道配色，保留缩放相关的标签。可选 `map-style.js` 在 Positron 基础上删除建筑和部分道路标注，强调轨道与车站；提供方名称与地图数据署名保留在地图中。当前底图未使用 Microsoft / Zenrin 数据，不显示其署名。
- 底图数据：© OpenStreetMap contributors、© OpenMapTiles。数据按 ODbL 等各自条款提供，参见 https://www.openstreetmap.org/copyright 、https://openmaptiles.org/ 。
- 备用栅格地图：国土地理院淡色地图，https://maps.gsi.go.jp/development/ichiran.html 。
- Google Maps 仅通过官方 Maps URLs 跳转，不加载 Google 地图 API：https://developers.google.com/maps/documentation/urls/get-started 。
- 按钮应用图标来自各自官方网站，分别为 https://www.gstatic.com/images/branding/product/2x/maps_96in128dp.png 、https://www.airbnb.com/favicon.ico 、https://www.ctrip.com/favicon.ico 。图标及商标归对应权利人所有，仅用于标识跳转目标。

此项目参考 nearcade 的 MapLibre 渲染思路，未复制 nearcade 的源码或调用其私人地理服务。

maimai 按钮及机厅标记图标由用户提供（`maimai.sega.jp-icon.ico`），按原文件复制至 `assets/maimai.ico`，用于标识 maimai 相关功能。图标及 maimai 商标归 SEGA 等相应权利人所有。

巡礼信息来自 Anitabi 及其贡献者，接口文档：https://github.com/anitabi/anitabi.cn-document/blob/main/api.md 。本项目仅调用文档中的作品轻量资料及点位详情接口，未复制主站静态数据。默认作品 ID 分别对应 https://bgm.tv/subject/115908 、https://bgm.tv/subject/1424 、https://bgm.tv/subject/428735 、https://bgm.tv/subject/328609 。

Anitabi 点位及相关截图信息依其文档按 CC BY-NC-SA 4.0 共享：https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans 。页面保留 Anitabi 署名、协议链接及接口返回的 origin/originURL；截图使用 image.anitabi.cn 的 h160 缩略图，原作品与截图权利归相应权利人。加入行程保留来源及作品信息；如后续公开发布或商用，应按来源许可另行核实使用范围。
