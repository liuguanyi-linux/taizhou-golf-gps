# 来源、范围与第三方依赖

本交付从已有 Golf.CC 工作目录中抽取用户正在开发的泰州 18 洞虚拟图 / GPS 模块，以及保持它们独立运行所必需的查看器、几何编辑器和本地 JavaScript/CSS 库。原项目许可原文保留于 LICENSE；没有将原项目改为 MIT 或其他开源许可。新增整理材料也不构成对第三方内容的再授权。

包含：holemap-viewer、holemap-editor、holemap-gps、holemap-hd、holemap-data 五个功能目录；当前高清图与历史高清版本保留；18 洞卫星增强参考图只作为原项目已有参考资料。

排除：原 Git 历史、无关网站/后台/小程序、数据库、登录与支付逻辑、node_modules、.env、地图本机密钥、个人路径、浏览器存储和实时定位日志、早期 pilot/training 演示。保留必要页面的原有实现，不声称其全部代码均为本次原创。

运行所含 Leaflet、Leaflet Rotate、Leaflet Geoman 等第三方库保留文件头的来源与版权标记；图层的地图提供商 attribution 保留。第三方卫星/地图服务和参考影像的后续使用须遵守各自授权。私人仓库并不自动消除第三方许可义务。

独立包适配：查看器与旧几何编辑器默认球场设为 cn0000385，强制本地草稿读取；不再尝试原项目业务后台，不载入 map-provider-config.local.js。其余地图 / GPS 实现与提取时原文件保持一致。完整校验清单由 scripts/build-delivery.cjs 生成。

禁止将本测试包中的默认估算坐标、残差、模拟路线当作经过测量验收的安全导航依据。外部账号获得下载文件后可保留副本，移除仓库访问权限不能追回已经下载的副本。

## 金沙湾独立新增模块（2026-09-10）

`kingswan/` 是本次新增的静态编辑工作台，不含朋友项目的后台。随包包括 18 张生成式虚拟底图视觉草稿和转录的记分卡数值；它们不是测绘影像，不应据此声称地理形状或坐标准确。制作参考原图和个人照片不在本次新增分发范围。

新增模块使用 Leaflet 1.9.4，BSD 许可全文见 `kingswan/vendor/LICENSE-Leaflet.txt`。全场参考范围来自 OpenStreetMap way 775530696，© OpenStreetMap contributors，ODbL 1.0；保留在 baseline 中的来源信息和页面署名。在线 Esri 影像仅通过署名瓦片服务显示，没有打包瓦片或赋予额外再分发权。

金沙湾文档见 `kingswan/TECHNICAL.md`；独立几何与 18 张资源测试可运行 `node --test kingswan/tests/geometry.cjs`。几何配准、控制点与实时位置均未通过现场精度验收。
