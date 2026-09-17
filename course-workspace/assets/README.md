# 高清制图材质

`turf-material-v1.png` 是 2026-09-16 使用内置 image_gen 工具生成的草坪材质（非 CLI）。原始输出按原样复制入本目录，未进行图像编辑。它不是球场实景、航拍或测绘成果。

渲染器仅在已有 WGS84 地物多边形内部叠加材质；球洞范围、坐标、道路、沙坑、树木位置不由此材质生成。材质加载失败或超过 4 秒则回退到程序纹理，不阻塞制图。输出记录 `visual.material`。

## 最终生成提示词

```text
Use case: photorealistic-natural. Asset type: reusable seamless albedo grass material for a coordinate-driven golf map renderer, NOT a golf course picture. Generate a square, orthographic directly overhead, finely detailed texture of closely mown healthy golf fairway turf. Natural muted olive and medium green tones, very fine dense blades and subtle irregular organic tonal variation. Soft uniform diffuse daylight, entirely flat lighting, no directional shadow, no vignette, no horizon or perspective, no edges, no borders, no objects, no flags, no trees, no sand, no water, no paths, no white marks, no text or watermark, no mowing stripes (the renderer adds those separately). Texture fills 100 percent of the square and is seamless/tileable on every edge. Fine tactile detail suitable for repeat mapping onto precisely defined polygons.
```
