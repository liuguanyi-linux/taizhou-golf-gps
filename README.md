# 泰州云海湿地 · 虚拟图与 GPS 点位工作台

公开测试版 · 2026-09-08 · 球场 `cn0000385` · 18 洞

直接打开：[在线球洞工作台](https://liuguanyi-linux.github.io/taizhou-golf-gps/holemap-viewer/index.html?gb=cn0000385&draft=codex) · [网站首页与文档](https://liuguanyi-linux.github.io/taizhou-golf-gps/) · [完整版本下载](https://github.com/liuguanyi-linux/taizhou-golf-gps/releases)

无需 GitHub 账号即可在线查看、标点、测距和下载。编辑保存在各自浏览器，不能修改仓库基线，也不会自动同步给其他人。

本仓库只整理虚拟图、任意点标记、多球车测距、图像坐标校准、设备数据接入和必要页面依赖。不是原 Golf.CC 全站，也不连接朋友项目的后台。

**这是流程测试版本，不是已经完成实地测绘的导航产品。默认图片配准是估算；第 11 洞默认控制点近共线，须校准后才能新建图上点位。**

## 朋友怎么打开

以下是可选的本地运行方法；在线使用直接点击上方链接即可。

1. 在本仓库的 [Releases](https://github.com/liuguanyi-linux/taizhou-golf-gps/releases) 下载完整 ZIP 并解压，不需要登录。
2. 安装 Node.js（本次在 Node 25.8.2 验证，启动器仅使用内置模块），进入解压目录。
3. 运行 `node scripts/serve.cjs`。终端显示地址后，在本机打开 `http://127.0.0.1:3034/`。
4. 点击“打开球洞工作台”→“虚拟图”→“编辑本洞”，进入标点、校准、设备数据。设备预览仍在同一工作页面。

Mac 可运行 `bash start.command`；Windows 可双击 `start.bat`。这两个启动器均需要已安装 Node.js。关闭终端或 Ctrl+C 停止服务。3034 被占用时启动器报错，不会杀死别人的服务；先退出自己之前的预览服务再启动。

不要直接双击 HTML 使用 `file://`，数据读取需要 HTTP。不要将 `127.0.0.1` 地址发给远方朋友：它始终指向打开链接的那台设备。

## 交付内容

- [完整技术文档](docs/TECHNICAL.md)：架构、坐标换算、精度限制、数据协议、API、测试和接入步骤。
- [朋友操作指南](docs/QUICKSTART.md)：从放点到导出、模拟与实际 GPS 的区别。
- [分发与权限说明](docs/DISTRIBUTION.md)：公开网页、下载、数据保存和访问边界。
- [当前数据清单](downloads/data-inventory.json)：18 洞图片尺寸、数据数量与 SHA-256。
- [默认配准审计](downloads/registration-audit.json)：估算控制点的拟合残差，不是现场精度。
- [基线点位测试包](downloads/cn0000385-baseline-test-package.json) / [点位 GeoJSON](downloads/cn0000385-points.geojson) / [全几何 GeoJSON](downloads/cn0000385-geometry.geojson)。
- `holemap-hd/assets/`：全部现有高清虚拟图及参考影像，未重新生成；清单标明当前使用版本。
- `tests/`：点位、测距、输入验证、配准回归；`node scripts/check.cjs` 运行测试。

下载包中的 JSON 是磁盘保存的 18 洞基线，**不包含浏览器里尚未导出的个人草稿**。要交付最新人工编辑，先在“设备数据”导出测试包，并将该文件单独发给朋友。

## 核心约定

坐标为 WGS84，数组顺序 `[经度, 纬度]`，距离单位米。任意两点测距是椭球地表最短距离；球车道剩余路程是另一个指标，不可混用。多个球车用稳定 ID 区分；接入接口 `window.GolfDevicePoints.updatePositions(positions)`，不是已经联网的车辆平台。

编辑默认只保存到当前浏览器、当前域名的本机草稿，不会写回 GitHub或他人电脑。换浏览器、域名、设备前务必导出。外部卫星底图需网络及提供商授权，虚拟图和随包数据可本地使用。

## 隐私与来源

按拥有者 2026-09-08 的要求，仓库和全部 Release 改为公开，并使用 GitHub Pages 提供 HTTPS 在线页面。任何人可查看、下载当前内容和历史发布包；网站没有登录门槛。访客不因此获得仓库写入权限。本地浏览器旧草稿不会迁移到新网站域名，请先导出备份。

原项目版权说明保存在 [LICENSE](LICENSE)，必要依赖与本次整理范围见 [来源说明](NOTICE.md)。公开访问不改变原有权利归属，本次不新增开源许可。未包含原项目后端、账号、支付、微信配置、环境变量或本机地图密钥。
