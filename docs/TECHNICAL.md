# 高尔夫虚拟图与 GPS 点位工作台技术文档

版本日期：2026-09-07。
适用球场标识：`cn0000385`。
适用范围：18 洞虚拟图、同页编辑、坐标校准、点位测距、GPS 预览与数据交换。
分发方式：私人 GitHub 仓库或受控文件包，供获授权的朋友下载并在本地运行。

本文根据现有前端源代码、静态数据及 2026-09-07 验收记录编写。
本文不表示已经建立公开网站、启用 GitHub Pages、连接客户车载设备或完成现场测量验收。
分发包的具体文件布局、启动脚本与版本标识以包内 README 和清单为准。本次独立版已完成静态适配：默认 cn0000385、直接读取包内 JSON、禁止业务后台写入并移除本机地图配置引用。推荐运行 `node scripts/serve.cjs`，使用 127.0.0.1:3034；下文第 5 节保留源版加载逻辑用于说明差异。
本文不包含个人目录、访问凭据或设备真实行踪。

## 1. 产品能力与使用边界

工作台把球场 WGS84 几何数据、虚拟图像素坐标、浏览器定位和用户编辑连接起来。
用户可以在一个页面中切换球洞，打开虚拟图，放置命名参考点或多辆球车，并进行多目标测距。
每个自定义点保存经纬度和稳定标识，可以从设备 JSON / CSV 快照更新已存在的球车。
地图校准将虚拟图上的已知地物与 WGS84 坐标配对，并保存可序列化的双向换算模型。

虚拟图采用 PNG 美术底图与 SVG 交互层组合。
球场边界、Tee、果岭和路线等另有可编辑的经纬度数据；PNG 本身不保存真实地理关系。
拖动标记、修改几何节点不会自动重画底图中的草地、沙坑或水面纹理。
需要查看完整的数据几何时，可使用实景叠加或 GPS 预览中的矢量视图。

当前实现适合界面演示、数据整理、坐标校准流程测试和设备协议对接准备。
当前实现没有统一账户、远程草稿保存、多人协同、访问审计或车辆消息服务器。
浏览器模拟球车、命名球车和浏览器实时定位是三个不同的数据来源。
精确的坐标小数位数、低拟合残差和流畅动画均不能证明真实球场定位精度。

## 2. 当前静态数据快照

以下统计来自本版本源数据读取，不包含任何浏览器 localStorage 中的用户草稿。

| 项目 | 当前结果 | 说明 |
| --- | --- | --- |
| 球洞数量 | 18 | 主几何 JSON 包含第 1 至第 18 洞 |
| 基础目录点 | 144 | 72 个 Tee 与 72 个果岭相关点 |
| Tee 配置 | 每洞黑、蓝、白、红四组 | 目录以 `tees` 为主要字段 |
| 果岭目录 | 旗杆、前缘、中心、后缘 | 后三者可能由几何推导 |
| 主数据内已保存校准 | 0 | 用户保存的校准可能仅在其浏览器草稿中 |
| 主数据内命名自定义点 | 0 | 朋友下载后可自行创建 |
| 独立设备路线文件 | 第 1 洞一条候选路线 | `reviewed: false`，需要人工及现场复核 |
| 虚拟美术图配置 | 18 张 | 各洞使用的图像版本和尺寸不同 |

第 1 洞路线文件的存在不代表其余 17 洞已经具备完整车行路线。
原始数据的 `draft`、审校说明、视觉校对状态不等同于测绘成果认证。
局部草稿可能改变上述数量；导出时应再次检查目录与 `validation_errors`。

## 3. 运行目录与架构

源码中的运行资源位于同一静态根目录下，必要目录如下。

```text
静态根目录/
├── holemap-viewer/
│   ├── index.html
│   ├── point-workspace-ui.js
│   ├── point-workspace-ui.css
│   ├── map-provider-config.js
│   └── lib/                  Leaflet、旋转插件、配套样式和图片
├── holemap-gps/
│   ├── index.html
│   ├── gps.js / gps.css
│   ├── gps-core.js
│   ├── registration.js
│   ├── point-workspace.js
│   ├── geojson.js
│   └── vector-renderer.js
├── holemap-hd/
│   ├── index.html
│   ├── hd.js / hd.css
│   └── assets/               当前配置需要的虚拟图和参考影像
└── holemap-data/
    ├── cn0000385-codex.json
    ├── cn0000385-device-routes.json
    └── cn0000385-scorecard.json
```

| 模块 | 职责 |
| --- | --- |
| `holemap-viewer/index.html` | 页面状态、球洞选择、实景地图、数据节点编辑、草稿保存、iframe 编排 |
| `point-workspace-ui.js` | 命名点、多车测距、控制点校准、导入导出和公开设备点位 API |
| `holemap-hd/hd.js` | 图像显示、SVG 标记、拖动、缩放平移、像素事件和轨迹叠加 |
| `holemap-gps/gps.js` | GPS / 模拟状态、设备预览、参考目标选择、自动选洞、实时指标 |
| `registration.js` | WGS84 与原始图像像素的仿射配准、逆变换及误差诊断 |
| `point-workspace.js` | 点位校验、完整 ID、目录、椭球测距、遥测解析、点位 GeoJSON |
| `gps-core.js` | 球场几何判断、球面距离、线段投影、路线剩余距离和果岭目标推导 |
| `geojson.js` | 全场 / 单洞点线面 GeoJSON 导出 |
| `vector-renderer.js` | 将球场几何数据渲染为矢量设备视图 |

主页面与内嵌高清图通过 `postMessage` 交换像素事件及显示状态。
设备预览同样嵌入主页面，其内部还使用高清图 iframe。
用户更新命名球车后，主页面把新的球洞数据传给已经打开的设备预览。
客户集成应使用 `window.GolfDevicePoints`，不要依赖内部 DOM 结构或未稳定化的消息类型。

## 4. 私有分发与本地运行

私人仓库用于限制谁可以读取源代码及数据包；本次不需要公开 Pages。
获授权的朋友需要先获得仓库访问权限，再克隆仓库或下载 ZIP。
朋友取得文件后，可在自己的电脑启动静态服务查看页面。
私人仓库的权限不构成文件下载后的复制控制，也不会给本地服务自动增加登录认证。

优先使用分发包 README 提供的启动方式。
如果分发包没有启动脚本，可在包含上述四个同级目录的“静态根目录”执行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

该命令需要本机已安装 Python 3；选择的端口如已被占用，应更换为空闲端口。
仅绑定 `127.0.0.1` 时服务限本机访问，不会自动分享给局域网或互联网。
保持终端运行，在浏览器打开以下入口：

```text
http://127.0.0.1:8765/holemap-viewer/index.html?gb=cn0000385&draft=codex
```

独立设备预览入口：

```text
http://127.0.0.1:8765/holemap-gps/index.html?gb=cn0000385&hole=1
```

独立图像查看入口：

```text
http://127.0.0.1:8765/holemap-hd/index.html?hole=1&mode=concept&labels=on
```

不要依赖直接双击 HTML 的 `file:` 模式；页面需要 fetch、同源 iframe 和浏览器存储。
朋友电脑上的 `127.0.0.1` 指向朋友自己的电脑，并不指向文件提供者的电脑。
关闭服务不会清除浏览器草稿；清除站点数据或更换浏览器则可能失去草稿。

## 5. 数据加载与静态适配

源版 viewer 从参数读取 `gb` 和 `draft`，缺少 `gb` 时不会正常加载球场。
其正式数据入口为当前源下的 `/api/v1/gb/venues/{gb}/holemap`。
`api` 查询参数可以替换 API 根地址；该参数不能承担认证功能。
当正式入口失败且 `draft=codex` 时，源版才回退到相对路径的 `{gb}-codex.json`。
如果正式 API 成功，草稿文件只补充部分文字及记分信息，不会整体覆盖正式几何。

随后 viewer 载入每洞设备路线，再恢复当前浏览器草稿；用户草稿拥有最后覆盖优先级。
独立 GPS 页直接读取静态主数据及设备路线文件，再恢复同名浏览器草稿。
因此，接入正式 API 的 viewer 与独立 GPS 页可能使用不同基线；演示包应明确统一数据来源。

适合私人分发的静态版本应直接使用包内 JSON，并在 README 说明这一适配。
如果保留源版加载逻辑，使用 `draft=codex` 会先经历一次不存在的 API 请求，再加载本地数据。
静态服务器应对真正不存在的文件返回 404，不能把 HTML 首页当作 JSON 返回。
应保留四个运行目录的相对关系，检查 iframe、样式、PNG、脚本和 JSON 的相对地址。
原始 viewer 引用的可选 `map-provider-config.local.js` 不属于应分发的个人配置。
分发时应移除该引用，或提供经过检查且不含凭据的空配置；不能复制个人配置充当默认值。

未来若改为在线托管，需要另外决定身份验证、授权名单、数据源和定位权限策略。
未来即使仓库保持私有，部署平台也必须另行确认网站访问控制，不能从仓库私有推定网站私有。
当前文档的本地运行流程不要求开通公开托管或建立业务后端。

## 6. 单页操作说明

1. 打开 viewer，选择球洞，然后选择“虚拟图”。
2. 点击“编辑本洞”，进入点位工作台。
3. 在“标点测距”填写名称，选择“参考点”或“球车”。
4. 点击“在虚拟图放置新点”，随后点击图内位置。
5. 选中已建立的点，可拖动、修改名称或输入 WGS84 经纬度。
6. 选择测距起点，勾选一个或多个目标；目标可以来自其他球洞。
7. 在“地图校准”添加并保存控制点；在“设备数据”导出或输入位置快照。

工作台会显示完整点位 ID、坐标来源、未知或已记录的精度，以及相对于本洞边界的状态。
点位在球洞数据边界之外可以保存，但会提示核对；边界判断不是许可行驶判断。
球洞边界未知时状态为 `unknown`，不代表该点一定在球场内。
跨洞目标可以参与数值测距，但当前虚拟图只绘制同洞且可投影到图内的连线。
同一个点在多洞之间不会因收到新坐标而自动迁移其 ID 所属洞号。

窄窗口通过“点位工具”展开抽屉，放点时工具区会自动收起。
虚拟图支持滚轮缩放、拖动空白区平移，以及全图复位。
缩放范围由页面限制在约 80% 至 400%；屏幕缩放不改变已保存的原图像素坐标。
删除自定义点后可撤销最近一次删除；该撤销记录只在当前页面内存中保留。

传统“坐标、节点与数据导出”区域用于编辑 Tee、旗杆、点线面中的指定节点。
线至少保留两个节点，面至少保留三个节点；保存节点不代表已进行完整拓扑或视觉验收。
绘制新球车路线时先建立临时草稿，至少两个点才可保存；取消保留原路线。
路线绘制未完成时，页面会阻止某些切洞、预览或结束编辑操作。

## 7. 三类位置与路线的区别

| 来源 | 保存位置 | 用途 |
| --- | --- | --- |
| 命名球车 / 参考点 | `hole.device_points[]` | 稳定 ID、多目标测距、客户 GPS 更新 |
| 旧模拟球车 | `hole.cart_position` | 设备预览的模拟起点与路线演示 |
| 浏览器实时定位 | 当前页面的定位状态 | 显示当前设备位置、精度及临时轨迹 |

“在图上放置球车”这一旧按钮操作 `cart_position`，并不创建新的命名车辆 ID。
要对接多辆客户球车，应在“标点测距”中选择类型“球车”并创建 `device_points`。
设备预览里的播放、进度条及模拟轨迹不代表客户真实车辆正在移动。
浏览器实时定位也不会自行关联并更新某个命名球车 ID。

设备预览存在路线时，可沿 `cart_route` 模拟；没有路线时关闭路线播放和进度控制。
没有路线的球洞仍可显示 Tee、旗杆、参考点、实时 GPS 和直线距离。
球洞中线是打球方向参考，不能直接替代球车可通行路线。

## 8. 坐标约定

经纬度采用 WGS84，交换格式固定使用 `[longitude, latitude]`，单位为十进制度。
例如 `[120.07, 32.61]` 中第一项是经度，第二项是纬度。
有效范围为经度 `[-180, 180]`、纬度 `[-90, 90]`，不接受空白坐标、NaN 或无限值。
GeoJSON 坐标顺序遵循 [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)。
代码中的 `WGS84 / EPSG:4326` 是说明标签；接口顺序仍以明确约定的经度在前为准。

Leaflet 显示使用 `[latitude, longitude]`，转换只发生在显示适配处。
第三方地图可能采用其他显示坐标体系，应在地图服务适配层处理，不能改写原始 WGS84 数据。
对已转换的坐标再次进行 GCJ 等显示转换会引入偏移；数据来源必须记录清楚。
当前点位导入只处理二维经纬度，不以第三个坐标分量计算高程距离。

像素坐标采用 `{x, y}`，以当前配置原图左上角为原点，x 向右、y 向下。
控制点使用原始图像像素，不使用 CSS 缩放后的屏幕像素或设备像素比。
更换图片、裁切图片或改变原始尺寸后，需要重新检查模型，通常需要重新校准。

当前 `conceptConfig` 使用的原始尺寸如下，文件均位于 `holemap-hd/assets/`。

| 洞号 | 像素宽 × 高 | 虚拟 PNG 文件 |
| --- | --- | --- |
| 1 | 886 × 1775 | `hole-01-hd-concept-v1.png` |
| 2 | 1033 × 1522 | `hole-02-hd-concept-v1.png` |
| 3 | 1089 × 1444 | `hole-03-hd-concept-v1.png` |
| 4 | 1199 × 1312 | `hole-04-hd-concept-v1.png` |
| 5 | 1098 × 1433 | `hole-05-hd-concept-v1.png` |
| 6 | 1003 × 1568 | `hole-06-hd-concept-v1.png` |
| 7 | 1293 × 1217 | `hole-07-hd-concept-v1.png` |
| 8 | 947 × 1660 | `hole-08-hd-concept-v1.png` |
| 9 | 1222 × 1287 | `hole-09-hd-concept-v1.png` |
| 10 | 1005 × 1565 | `hole-10-hd-concept-v2.png` |
| 11 | 1060 × 1484 | `hole-11-hd-concept-v2.png` |
| 12 | 1078 × 1459 | `hole-12-hd-concept-v2.png` |
| 13 | 1050 × 1498 | `hole-13-hd-concept-v2.png` |
| 14 | 1244 × 1265 | `hole-14-hd-concept-v2.png` |
| 15 | 1103 × 1426 | `hole-15-hd-concept-v2.png` |
| 16 | 1551 × 1014 | `hole-16-hd-concept-v2.png` |
| 17 | 1740 × 904 | `hole-17-hd-concept-v2.png` |
| 18 | 958 × 1641 | `hole-18-hd-concept-v2.png` |

## 9. WGS84 与像素双向校准

`registration.js` 公开 `window.HoleRegistration`，并可作为 CommonJS 模块读取。
核心函数为 `fit`、`pixelToGeo`、`geoToPixel` 和 `containsPixel`。
模型类型为 `local-wgs84-affine`，算法版本为 `1`。
算法先以控制点平均经纬度为局部原点，按 WGS84 椭球计算该纬度附近的每度米数。
再拟合像素到局部东、北方向米数的仿射变换，并解析求逆得到经纬度到像素的变换。

设像素相对中心为 `dx`、`dy`，模型系数分别为 east 与 north：

```text
east_m  = a0 * dx + a1 * dy + a2
north_m = b0 * dx + b1 * dy + b2
longitude = origin_lng + east_m / meters_per_degree.lng
latitude  = origin_lat + north_m / meters_per_degree.lat
```

最少需要三个不共线且分布合理的控制点；建议五个以上，覆盖起点、终点与横向两侧。
三个点没有冗余度，完全拟合可能出现接近零的训练残差，不能据此证明真实位置准确。
控制点声明的 `accuracy_m` 保存在来源信息中，但当前拟合并不使用其进行加权最小二乘。

| 拒绝或警告项 | 当前行为 |
| --- | --- |
| 少于三个控制点 | 拟合无效 |
| 非法坐标 / 像素 / 负精度 | 拟合无效 |
| 相同像素的重复控制点 | 拟合无效 |
| 像素或地理控制点接近共线 | 根据特征值比例拒绝 |
| 控制点跨度过大 | 默认超过局部 20 km 范围时拒绝 |
| 原点纬度绝对值超过 89° | 不支持该极区条件 |
| 逆变换不可解或极端形变 | 拟合无效 |
| 控制点少于五个 / 覆盖狭窄 | 记录警告 |
| 最大训练残差超过默认 10 m | 记录警告，不自动拒绝 |
| 没有独立检查点 | 记录警告 |

独立检查点只用于误差检查，不参与拟合。
与控制点同 ID 或同像素的检查点会被排除，非法检查点也会被排除并留下警告。
`diagnostics.training` 与 `diagnostics.independent` 分别保存数量、RMS、最大误差和逐点残差。
二者均衡量输入之间的一致性；输入影像或测量本身的系统误差不会自动消失。

底层转换函数默认拒绝控制点凸包之外的换算，返回 `null`。
传入 `{allowExtrapolation: true}` 可以显式启用外推。
现有页面适配层为显示及交互启用了外推，并在任意点保存后给出外推提示。
因此不能把底层默认保护理解为网页会完全禁止在绿色覆盖区外放点。

```js
const R = window.HoleRegistration;
const model = R.fit(controls, { checkpoints });
if (!model.valid) throw new Error(model.diagnostics.reason);
const geo = R.pixelToGeo(model, { x: 350, y: 700 });
const pixel = geo ? R.geoToPixel(model, geo) : null;
const savedModel = JSON.parse(JSON.stringify(model));
```

代码示例中的 `controls` 和 `checkpoints` 必须由调用方提供；示例不包含任何实测坐标。
模型含系数、原点、凸包、比例、来源与诊断，可直接序列化为 JSON。
单个控制点与检查点使用相同记录结构，例如以下明确为合成示例的记录：

```json
{
  "id": "synthetic-example-control",
  "pixel": { "x": 350, "y": 700 },
  "coordinate": [120.07, 32.61],
  "source": "synthetic_example",
  "accuracy_m": null
}
```

现有默认 Tee / 旗杆估算适配还保留旧拟合逻辑；其拟合方向与新模块不完全相同。
客户应使用明确保存的校准模型，而不应尝试自行复原默认估算后假定结果完全一致。

## 10. 保存校准的实际行为

在“地图校准”中，先选择图像像素，再填写同一地物的 WGS84 坐标。
可把记录标为控制点或独立检查点，并记录来源与已知精度。
从同页实景地图点击得到的坐标记为 `map_pick`；人工输入也不自动成为现场测量成果。
新增对应点只进入当前页面的校准临时草稿，必须点击“应用并保存本洞校准”才能持久保存。

保存结构包含 `controls`、`checkpoints`、`model`、`quality`、`version`、`image` 和 `updated_at`。
每次保存生成新的校准 UUID，并明确写入 `field_verified: false`。
模型内部 `version: 1` 是算法格式版本；外层 `registration.version` 是该次校准记录标识。
`quality: calibrated` 取决于声明来源文字，不是独立验证或测绘认证。
尤其 `map_pick`、`wgs84_input` 等来源可产生该标签，仍需查看 `field_verified` 和检查点结果。

应用新校准会重新计算 `source: virtual_pick` 且保留 `pixel` 的自定义点。
这些点会获得新校准版本、`calibrated_unverified` 状态和未知测量精度。
手工输入坐标或 GPS 导入点的经纬度保持不变，其在图片上的显示位置受新模型影响。
保存校准不会同步改写原始 Tee、果岭、边界等整套球场几何，也不会重画 PNG。

## 11. 球场与点位数据模型

主球场 JSON 是自定义对象，并不是自身即为 GeoJSON FeatureCollection。
顶层包含 `schema_version`、`slug`、`name`、`center`、`zoom`、`holes` 等字段。
每洞使用 `n` 编号，核心字段如下。

| 字段 | 结构及意义 |
| --- | --- |
| `par` / `handicap` | 标准杆与差点序号 |
| `dist` / `scorecard_yards` | 各 Tee 的米数 / 记分卡码数；不从当前标点重新推算 |
| `tees` | 颜色到 `[lng, lat]` 的映射 |
| `tee` | 历史兼容的单一发球点，通常与黑 Tee 对应 |
| `flag` / `pins.mid` | 旗杆位置及兼容字段 |
| `green_targets` | 可选 `front`、`middle`、`back` 坐标 |
| `holeperim` / `green` | 边界环；通常为坐标数组 |
| `fairways` / `bunkers` / `water` 等 | 多组面环；部分模块兼容单环写法 |
| `centerline` / `cart_route` | 一条有序折线 |
| `cartpaths` | 多条球车道折线 |
| `cart_route_meta` | 路线来源、复核标志及说明 |
| `device_points` | 自定义参考点或命名球车数组 |
| `registration` | 当前洞已保存的图像配准记录 |
| `virtual_feature_points` / `virtual_overlays` | 视觉锚点地理坐标 / 图像叠加状态 |

果岭前后缘缺省时，算法以 Tee 到果岭环顶点的距离排序选择最近 / 最远点。
缺省中心为该环顶点的平均值，不保证是面积质心，也不保证是实测落点。
代码支持多个独立外环，但未建立完整含洞多边形或复杂 GIS 拓扑语义。

下面展示自定义点的完整字段；坐标和 ID 都是协议示意，不是现有车辆或实测数据。

```json
{
  "id": "example-cart-a",
  "name": "示例球车 A",
  "kind": "cart",
  "coordinate": [120.07, 32.61],
  "hole": 1,
  "source": "gps_import",
  "accuracy_m": null,
  "updated_at": "2026-09-07T04:00:00.000Z",
  "pixel": null,
  "registration_version": null,
  "registration_quality": "gps_coordinate_image_unverified"
}
```

`kind` 只允许 `reference` 或 `cart`；UI 新建点使用随机 UUID 作为局部 ID。
`accuracy_m: null` 表示未知；数字零是调用方明确报告的值，不能自行推断。
在虚拟图上放点保存 `source: virtual_pick`；修改经纬度时改为 `wgs84_input` 并清空像素。
点位目录完整 ID 由各段逐一 URL 编码后以斜线连接：

```text
{course_id}/hole/{hole_number}/{type}/{local_id}
cn0000385/hole/1/device/example-cart-a
cn0000385/hole/1/tee/black
cn0000385/hole/2/green/flag
```

目录 `type` 包括 `tee`、`green`、`cart-position` 和 `device`。
旧数据缺少点 ID 时可临时使用 `legacy-{index}`，同时产生 `legacy_id` 诊断。
这种索引 ID 不适合作为长期设备标识；交付前应分配并保存稳定 ID。

## 12. 全部 window.GolfDevicePoints 公开 API

API 由主页面的 `point-workspace-ui.js` 建立，只有以下四个方法。
它不是 HTTP 服务；外部设备不会因为知道方法名称就自动接入浏览器。
调用前需要确认页面已加载球场，`catalog().points` 已可读取。
不要把浏览器初始化早期的空目录当作球场没有数据。

| 方法 | 返回 | 作用 |
| --- | --- | --- |
| `catalog()` | `{course_id, points, errors}` | 获取当前内存中所有洞的稳定点目录 |
| `measure(originId, targetIds)` | 测距对象 | 以完整 ID 选择起点与多个目标 |
| `updatePositions(positions)` | `{ok, ...}` | 校验并更新已存在的命名球车 |
| `exportPackage()` | 普通 JSON 对象 | 取得点位、边界及已保存校准测试包 |

### 12.1 catalog

```js
const api = window.GolfDevicePoints;
const { course_id, points, errors } = api.catalog();
const carts = points.filter(p => p.type === 'device' && p.kind === 'cart');
```

目录点包含完整 `id`、`local_id`、`course_id`、`hole`、`name`、`type`、`kind` 和 `coordinate`。
另含 `source`、`accuracy_m`、`updated_at`、校准版本 / 质量、`pixel`、`range_status`。
果岭角色还带 `role`，Tee 带 `color`。
目录遇到非法点会记录错误并跳过；调用方必须检查 `errors`，不能仅检查数组是否非空。

### 12.2 measure

```js
const { points } = window.GolfDevicePoints.catalog();
const start = points.find(p => p.type === 'device' && p.kind === 'cart');
const targetIds = points.filter(p => p.type === 'green' && p.role === 'flag')
  .slice(0, 2).map(p => p.id);
const measurement = start
  ? window.GolfDevicePoints.measure(start.id, targetIds)
  : null;
```

返回包含 `origin_id`、`origin_coordinate`、`unit: m`、`distance_type`、`results` 和 `errors`。
每个结果包含目标 ID、名称、洞号、坐标、`distance_m`、`method`、范围和两端记录精度。
找不到起点会产生 `invalid_origin`；不存在的目标 ID 会被过滤，并不逐一报未知目标错误。
结果顺序按当前目录顺序产生，不保证与 `targetIds` 输入顺序相同。
重复目标 ID 不会生成重复结果；需要完整性保证的集成方应自行比对请求与返回 ID。

### 12.3 updatePositions

```js
const { points } = window.GolfDevicePoints.catalog();
const cart = points.find(p => p.type === 'device' && p.kind === 'cart');
if (cart) {
  const result = window.GolfDevicePoints.updatePositions([{
    id: cart.id,
    coordinate: cart.coordinate,
    accuracy_m: null,
    timestamp: new Date().toISOString()
  }]);
  if (!result.ok) console.error(result.errors);
}
```

上例使用原坐标演示协议，会更新该球车的来源和时间；仅在允许修改的测试草稿内执行。
方法先解析所有记录，再检查完整 ID 是否对应 `type: device` 且 `kind: cart` 的已有点。
不接受 Tee、旗杆、普通参考点或旧模拟球车 ID，也不会按快照自动创建新车辆。
任何解析错误、未知 / 非球车 ID、重复 ID 或旧时间戳均会拒绝整批更新。
同一时间戳允许更新；仅在新旧两者都有有效时间且新时间更早时拒绝。
未提供时间时使用浏览器当前时间，因此真实接入应始终提交设备带时区时间戳。

成功后保留车辆名称、局部 ID、类型及所属洞，更新坐标、来源、精度和时间。
`pixel` 变为 `null`，`registration_quality` 变为 `gps_coordinate_image_unverified`。
接口刷新草稿、测距和已打开预览；实际导入不按快照中的 `name` 改名或按 `hole` 移洞。
成功对象中 `updated` 是更新车辆数，`measurements` 实际为目录点总数，并不是测距结果数组。
校验通过后的多洞 localStorage 写入没有跨键事务；浏览器存储失败时不能保证事务回滚。

### 12.4 exportPackage

返回对象包含当前全场点位 GeoJSON 以及每洞 `registration`、状态和 `cart_route`。
此方法只返回数据，不触发下载；界面下载按钮会另外生成 Blob 并触发浏览器文件下载。
`schema_version` 为 `golf-point-workspace/1`，`field_verified` 固定为 `false`。
没有保存校准的洞其 `registration` 为 `null`，状态为 `estimated_default`。
该包不会自动包含 PNG 文件、全部球道几何或所有历史轨迹，也不是浏览器完整草稿备份格式。

## 13. JSON 与 CSV 位置快照协议

UI 接受文本中的 JSON 数组或 `{ "positions": [...] }`，也接受 CSV。
`updatePositions()` 接受 JavaScript 数组；不要向它直接传 CSV 字符串或外层对象。
以下为最小可交换 JSON 示例；使用前必须把示例 ID 替换为已建立车辆的完整 ID。

```json
{
  "positions": [
    {
      "id": "cn0000385/hole/1/device/example-cart-a",
      "coordinate": [120.07, 32.61],
      "accuracy_m": null,
      "timestamp": "2026-09-07T04:00:00Z"
    }
  ]
}
```

等价 CSV：

```csv
id,longitude,latitude,accuracy_m,timestamp
cn0000385/hole/1/device/example-cart-a,120.07,32.61,,2026-09-07T04:00:00Z
```

CSV 必须有 `id`、经度列和纬度列；表头去首尾空白后不区分大小写。
经度别名支持 `longitude`、`lng`、`lon`；纬度别名支持 `latitude`、`lat`。
标准推荐只使用 `longitude`、`latitude`，避免同时提供多个语义相同的别名列。
重复表头、列数不一致和未闭合引号会报错；支持 UTF-8 BOM、CRLF 和标准双引号转义。
时间字段可用 `timestamp` 或 `updated_at`；后者存在时优先读取后者。
时间必须为含 `T` 及 `Z` 或显式时区偏移的 ISO 8601 文本，规范化为 UTC ISO 字符串。

数字字段接受有限数字或符合数字语法的字符串；空白坐标不能作为零。
精度为非负米数，未知值使用 `null` 或 CSV 空字段。
空数组、非法坐标、负精度、非法时间以及同批重复 ID 均不能成功更新。
GeoJSON FeatureCollection 不是此入口支持的位置快照格式；需要先转换为 `positions`。
当前接口没有认证、重试队列、速率限制、历史回放或冲突版本号。

## 14. 两种 GeoJSON 与测试包

| 导出入口 | 标识 | 包含内容 |
| --- | --- | --- |
| 工作台“下载点位 GeoJSON” | `point_workspace_schema: 1.0` | 目录点、球洞边界、来源、精度、完整稳定 ID 和错误列表 |
| 工作台“下载 18 洞点位与校准包” | `golf-point-workspace/1` | 上述 GeoJSON、每洞已保存校准和已存在路线 |
| 原编辑器 / GPS 页“GeoJSON” | `device_schema_version: 2` | 支持的点线面几何、Tee、旗杆、视觉锚点、参考点等 |

全几何导出覆盖边界、长草、发球区、球道、果岭裙、果岭、沙坑、水域、桥。
也覆盖中线、设备路线、球车道、步道、溪流、沟、OB、围栏及红黄罚杆区等支持的线字段。
全几何导出不会无条件复制球洞对象中所有字段；例如某些展示层建筑或停车区不在当前导出映射表中。
原全几何导出的 ID 使用另一命名格式，不能直接替换 `GolfDevicePoints` 的完整目录 ID。
该格式中的 `device_reference_point` 元数据较少，不能替代工作台包含来源和精度的点位协议。

GeoJSON 示例中的坐标只用于说明结构：

```json
{
  "type": "Feature",
  "id": "cn0000385/hole/1/device/example-cart-a",
  "properties": {
    "id": "cn0000385/hole/1/device/example-cart-a",
    "course_id": "cn0000385",
    "hole": 1,
    "type": "device",
    "kind": "cart",
    "name": "示例球车 A",
    "source": "gps_import",
    "accuracy_m": null,
    "coordinate_system": "WGS84 / EPSG:4326"
  },
  "geometry": { "type": "Point", "coordinates": [120.07, 32.61] }
}
```

面导出会闭合环；当前实现不统一修复环绕方向、自相交、孔洞或所有拓扑问题。
对严格 GIS 消费者，应在接入层验证完整几何，而不能只验证 JSON 可解析。
`validation_errors` 可能在仍然生成导出文件时非空，接收端应明确显示或拒绝不合格记录。
客户复现图像换算还需要对应洞的原图、原始尺寸和已保存模型，单独经纬度文件不足以重建美术图。

## 15. 距离算法与单位

任意点多目标测距采用 WGS84 椭球反解 Vincenty，距离单位为米。
返回 `distance_type: surface_geodesic_not_route`，正常方法标识为 `WGS84-Vincenty`。
近对跖点迭代不收敛时使用带明确标识的 `spherical-fallback`，不静默假装椭球解已收敛。
界面称“直线距离”时，含义是地表两点最短距离，不包括海拔差、障碍绕行或车辆路网。

旧 GPS 指标中的旗杆和果岭前中后距离使用球面 Haversine。
球道侧向距离、最近线距离和路线进度使用球场局部平面近似。
因此不同区域显示的距离不是完全相同的算法结果，也可能采用不同四舍五入方式。

沿球车路线到果岭的指标计算方式如下：

```text
将位置投影至 cart_route 最近线段
剩余路线 = 路线总长 - 投影处累计长度
沿路线到旗杆指标 = 剩余路线 + 路线末端到旗杆的地表距离
```

最后一段是单独的几何补距，不等于已经确认存在可驾驶道路通向旗杆。
指标不额外加入当前位置离最近路线的横向距离。
当车辆远离路线、路线相交或候选线不准确时，最近线段投影可能产生不合理进度。
当前实现不是路网导航、通行许可系统、避障规划器或车辆控制系统。
沙坑 / 水域“最近距离”按边界线几何计算；身处区域内部时也不一定返回零。

## 16. 浏览器草稿、恢复和分享

WGS84 草稿键为 `golfmap.gps-draft.{course_id}.hole-{n}`。
其值为 `version: 2`、洞号、坐标系说明和 `hole_data` 对象。
保存字段包括可编辑几何、Tee、旗杆、目标点、自定义点、路线、视觉状态及 `registration`。
旧版只含局部 Tee / 旗杆的草稿仍有兼容恢复逻辑。

高清图另有像素叠加键 `golfmap.virtual-overlays.cn0000385.hole-{n}`。
该键当前固定球场标识，扩展新球场时需要改为按球场区分，避免像素叠加串用。
主页面把部分像素叠加同步进洞草稿，但像素叠加键和 WGS84 键仍是两份不同状态。
只清理其中一类状态可能仍看到另一类草稿效果。

localStorage 按浏览器配置和源隔离；协议、主机名或端口变化都可能形成不同存储空间。
`localhost` 与 `127.0.0.1` 即使指向同一电脑也不是同一个存储源。
A 在自己的电脑编辑不会自动出现在 B 的电脑，也不会自动进入 GitHub 仓库。
仓库文件更新同样不会自动覆盖已恢复的个人草稿，旧草稿可能继续盖住新版基线。

分发新数据前，应导出点位校准包和必要全几何，并记录版本与适用图像。
现有页面支持位置快照导入，但没有“导入完整校准测试包并恢复全部草稿”的通用按钮。
若需要把某人编辑后的整套数据作为共同基线，需要维护者检查后整理成发行数据并重新分发。
localStorage 不提供数据库事务、加密备份或多用户冲突处理；浏览器配额不足时保存可能失败。

## 17. GPS 权限、设备环境与隐私

页面使用浏览器 `navigator.geolocation.watchPosition`，请求高精度定位。
选项为 `enableHighAccuracy: true`、`maximumAge: 1000`、`timeout: 12000`。
它们是请求选项，不构成一秒更新周期、十二秒必定定位或固定米级精度保证。
GPS 精度、速度和朝向取决于设备、操作系统、卫星条件及浏览器提供的数据。

浏览器定位需要用户许可，并受安全上下文和 Permissions Policy 限制。
生产网络访问应使用 HTTPS；本机环回开发环境需按实际浏览器行为验证。
跨源嵌入还需要宿主页明确允许 geolocation，并同时满足浏览器权限。
定位精度字段以米表示，详见 [W3C Geolocation](https://www.w3.org/TR/geolocation/)。

桌面电脑可能使用网络推测位置，并不等同于专用 GNSS 天线。
树木遮挡、建筑反射、设备省电、页面后台运行和系统权限均可能影响结果。
当前 UI 的精度圆有视觉最小 / 最大半径限制，不是严格按比例保证的置信边界。
少数缺失精度的旧预览显示会使用“模拟”文本；应结合数据来源核对真实状态。

GPS 预览保留最多约 360 个显示轨迹点，轨迹主要存在页面内存 / SVG 中。
停止定位应调用界面“停止”功能；当前设备位置不会自动上传到客户服务器。
浏览器或操作系统自身的定位服务可能与服务提供商通信，不能据此承诺完全离线定位。
导出的车辆名称、坐标和时间仍可能揭示个人行踪，分享前应检查并使用测试数据。

## 18. 来源、授权和安全约束

私人仓库只应包含该演示所需代码、数据、图片、文档和相关第三方许可声明。
应排除本机配置、环境文件、登录材料、数据库、日志、用户导出及含行踪的真实设备快照。
已发布到私人仓库的 Web 端代码仍对获授权读者可见，不能把服务端密钥放进前端文件。
如配置地图供应商 Web key，应使用专用于该用途的凭据和来源限制，并核对授权方式。

使用在线实景底图会向地图提供商请求 SDK 或瓦片，可能暴露客户端 IP 和所查看区域。
底图可用性受联网、服务商配额、域名白名单及服务配置影响。
打包已有图像并不自动取得影像、地图服务或第三方作品的再分发权。
应保留可确认的来源和许可信息；尚不能确认再分发许可的素材应单独标明或从发行包排除。

新点位工作台的消息接收路径校验同源及具体 iframe 来源。
旧 viewer 与 HD 的部分消息路径仍只检查消息字段，部分发送使用 `targetOrigin: '*'`。
因此当前实现适合受信任页面组合；若用于长期在线服务，需统一校验 origin、source 和消息数据。
跨域打开链接、第三方嵌入、同源不可信脚本等场景需要在产品化前进一步审计。

## 19. 验收结果与回归计划

已有 2026-09-07 验收记录包含真实浏览器测试，并在隔离草稿空间完成写入。
记录确认了新建两辆球车、刷新保留、拖动后经纬度及距离更新、跨洞多目标测距。
记录也确认设备预览打开时导入点位可刷新测距，空经度快照被拒绝。
窄窗口抽屉、放点后收起、滚轮缩放和图像拖动均有交互验收记录。
这些是该次版本和浏览器环境的结果，不是对所有浏览器、设备或未来部署的承诺。

已有报告记载点位模块 44 项测试、配准 1000 点往返、序列化及退化 / 越界检查通过。
报告也记载 18 张配置 PNG 尺寸匹配、18 张 JPG 存在，以及相关脚本语法检查通过。
本文编写时另行只读验证：18 洞、144 基础目录点、目录无校验错误、静态文件无已保存校准。
本次模块抽查确认合成模型序列化往返误差低于 `1e-8` 像素、凸包外默认返回 null、空经度被拒绝。
合成模型和合成控制点只用于数值流程验证，不能用作任何球场真实精度证据。

每次分发更新后，建议按以下顺序进行回归：

1. 在朋友实际使用的浏览器打开入口，确认脚本、图像和 JSON 均返回正确内容。
2. 遍历 18 洞，核对图像版本、尺寸、Tee 颜色和编辑工作台可用性。
3. 在测试草稿新建参考点及两辆球车，拖动并保存，刷新后核对坐标和 ID。
4. 检查同洞及跨洞测距，确认显示的是正确的距离类型和目标。
5. 测试有效快照，以及空白、越界、重复 ID、未知车辆、旧时间等拒绝路径。
6. 保存有横向覆盖的控制点与独立检查点，验证双向变换和外推提示。
7. 导出点位与完整几何，检查元数据、错误列表、模型版本及图片尺寸。
8. 对存在路线的洞验证路线剩余距离；对无路线的洞验证播放被禁用。
9. 在支持定位的设备验证许可拒绝、超时、开始 / 停止定位和轨迹清理。
10. 比较两个浏览器或两个源的草稿，确认用户了解它们互不自动共享。

## 20. 仍需现场完成的工作

默认图像锚点属于估算，图内形状还可能存在美术处理造成的局部形变。
已有报告的默认控制点拟合残差示例为 H1 RMS 8.72 m、H8 RMS 20.88 m；它们不是现场误差。
第 11 洞默认控制点接近共线，新任意点工作台会要求补充两侧控制点后再可靠换算。
不能从这些例子推导其余球洞准确，也不能声称所有 18 洞任意点均已准确。

现场验收需要提供每洞分布合理的 WGS84 控制点、独立检查点和可追溯采集方法。
应分别检查基础几何、图像配准、设备 GPS、距离计算和车行路线，而不是只检查最终标记视觉效果。
需要约定可接受的误差指标、覆盖区域、设备条件和不合格时的处理方式。
对局部形变大的图像，全局仿射模型可能不足；后续可能需要修图、分区模型或重新整理几何。
真实设备接入还需要明确车辆标识、消息格式、鉴权、传输渠道、刷新频率及离线处理。
完成这些工作后才能按实际验收结果声明适用精度与运行范围。

## 21. 本文依据

实现依据为本版本运行目录中的以下文件及数据：

- `holemap-viewer/index.html`、`point-workspace-ui.js` 和对应样式。
- `holemap-gps/registration.js`、`point-workspace.js`、`gps-core.js`、`geojson.js`、`gps.js`。
- `holemap-gps/vector-renderer.js`、`holemap-hd/hd.js`、HTML 与当前图像配置。
- `holemap-data/cn0000385-codex.json` 和 `cn0000385-device-routes.json`。
- 原项目 `docs/gps-point-workspace.md` 与 2026-09-07 点位工作台验收记录。

数据交换坐标约定参考 [RFC 7946 GeoJSON](https://www.rfc-editor.org/rfc/rfc7946)。
浏览器定位许可、字段含义与环境约束参考 [W3C Geolocation](https://www.w3.org/TR/geolocation/)。
源代码定义当前软件行为，标准链接说明交换格式与平台约束；二者都不替代现场测量验收。
