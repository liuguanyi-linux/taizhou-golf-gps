/*
 * Optional licensed base-map providers for the standalone hole-map viewer.
 *
 * Keep real Web keys restricted by domain/referrer in the provider console.
 * This file intentionally ships without credentials. Fill tileUrl only with an
 * official or otherwise licensed raster-tile endpoint for your account.
 */
window.GOLF_MAP_PROVIDER_CONFIG = {
  huawei: {
    label: "华为",
    tileUrl: "",
    coordinateSystem: "wgs84",
    subdomains: "",
    maxNativeZoom: 20,
    attribution: "© Huawei Map Kit",
    help: "需要在 AppGallery Connect 开通 Map Kit 栅格瓦片 API 并配置受限 Key"
  },
  tencent: {
    label: "腾讯",
    tileUrl: "",
    coordinateSystem: "gcj02",
    subdomains: "0123",
    maxNativeZoom: 20,
    attribution: "© 腾讯位置服务",
    help: "需要腾讯位置服务 Web 应用 Key 或已授权的栅格瓦片地址"
  }
};
