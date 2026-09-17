"""Local CLIPSeg candidates. No remote code, telemetry, survey claims or project writes."""
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys

MODEL = 'CIDAS/clipseg-rd64-refined'
REVISION = '999e0328d9e10b484360c477313983f9afdd7050'
MODEL_DIR = Path(os.environ.get('GOLF_RECOGNITION_MODEL', str(Path.home() / 'Library/Caches/golf-recognition-model')))
PROMPTS = {'green': 'a golf putting green viewed from above',
           'fairway': 'a golf course fairway viewed from above',
           'bunker': 'sand', 'water': 'water'}
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'


def emit(kind, **data):
    print(json.dumps({'event': kind, **data}, ensure_ascii=False), flush=True)


def validate(data):
    if not isinstance(data, dict) or data.get('kind') not in PROMPTS:
        raise ValueError('请选择果岭、球道、沙坑或水域')
    bounds = data.get('bounds')
    if not isinstance(bounds, list) or len(bounds) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) for v in bounds):
        raise ValueError('需要 west,south,east,north 的 WGS84 范围')
    w, s, e, n = bounds
    if not (-180 <= w < e <= 180 and -85 < s < n < 85 and e-w <= .05 and n-s <= .05):
        raise ValueError('选区无效或过大，请分区识别（经纬跨度最多 0.05 度）')
    threshold = data.get('threshold', .5)
    if type(threshold) not in (float, int) or not .2 <= threshold <= .85:
        raise ValueError('分割阈值应在 0.2–0.85；阈值不是精度')
    if not isinstance(data.get('provider'), str) or not 1 <= len(data['provider']) <= 100:
        raise ValueError('缺少影像来源')
    return bounds, threshold


def coordinate(x, y, width, height, bounds):
    w, s, e, n = bounds
    north = math.log(math.tan(math.pi/4 + math.radians(n)/2))
    south = math.log(math.tan(math.pi/4 + math.radians(s)/2))
    lat = math.degrees(2*math.atan(math.exp(north + (south-north)*y/height))-math.pi/2)
    return [w+(e-w)*x/width, lat]


def polygons(mask, bounds):
    import cv2
    import numpy as np
    height, width = mask.shape
    contours, hierarchy = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    accepted, rejected = [], {'small': 0, 'edge': 0, 'holes': 0, 'complex': 0}
    nodes = 5
    for i, contour in enumerate(contours):
        if hierarchy[0][i][3] != -1:
            continue  # Inner rings belong to their parent, which is explicitly rejected.
        if hierarchy[0][i][2] != -1:
            rejected['holes'] += 1
            continue
        if cv2.contourArea(contour) < 24:
            rejected['small'] += 1
            continue
        xy = contour[:, 0, :]
        if (xy[:, 0] <= 0).any() or (xy[:, 1] <= 0).any() or (xy[:, 0] >= width-1).any() or (xy[:, 1] >= height-1).any():
            rejected['edge'] += 1
            continue
        if not 3 <= len(xy) <= 1500 or len(accepted) >= 100 or nodes+len(xy)+1 > 40000 or len({tuple(p) for p in xy}) != len(xy):
            rejected['complex'] += 1
            continue
        # OpenCV contours follow pixel centers. Preserve their positions, not a bounding box.
        ring = [coordinate(float(x)+.5, float(y)+.5, width, height, bounds) for x, y in xy]
        ring.append(ring[0][:])
        accepted.append(ring)
        nodes += len(ring)
    return accepted, rejected


def download():
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL, revision=REVISION, local_dir=str(MODEL_DIR),
                      allow_patterns=['*.json', 'merges.txt', 'vocab.json', 'model.safetensors', 'README.md'])
    emit('ready', model=MODEL, revision=REVISION)


def run(data):
    bounds, threshold = validate(data)
    encoded = data.get('image', '')
    if not isinstance(encoded, str) or not encoded.startswith('data:image/png;base64,') or len(encoded) > 6_000_000:
        raise ValueError('需要最多 6 MB 的 PNG 选区')
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 1024*1024
    raw = base64.b64decode(encoded.split(',', 1)[1], validate=True)
    image = Image.open(io.BytesIO(raw))
    if image.format != 'PNG' or min(image.size) < 32 or max(image.size) > 1024:
        raise ValueError('识别选区每边应为 32–1024 像素')
    if 'A' in image.getbands() and image.getchannel('A').getextrema()[0] < 250:
        raise ValueError('选区影像不完整，不能识别透明缺图')
    image = image.convert('RGB')
    emit('progress', message='加载本机 CLIPSeg 模型（不上传影像）')
    import torch
    import numpy as np
    from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation
    torch.set_num_threads(4)
    processor = CLIPSegProcessor.from_pretrained(str(MODEL_DIR), local_files_only=True)
    model = CLIPSegForImageSegmentation.from_pretrained(str(MODEL_DIR), local_files_only=True, use_safetensors=True).eval()
    # A single ROI is intentionally bounded. Small features need a closer zoom, not invented detail.
    emit('progress', message='正在识别选区地物；输出是待核对候选，不是实测轮廓')
    # This pinned processor uses explicit 352x352 resizing, not center cropping.
    if processor.image_processor.size != {'height': 352, 'width': 352}:
        raise ValueError('模型图像预处理尺寸与配准约定不匹配')
    inputs = processor(text=[PROMPTS[data['kind']]], images=[image], padding=True, return_tensors='pt')
    with torch.inference_mode():
        logits = model(**inputs).logits
        if logits.ndim == 2:
            logits = logits.unsqueeze(0)
        scores = torch.nn.functional.interpolate(logits.unsqueeze(1), size=(image.height, image.width), mode='bilinear', align_corners=False)[0, 0].sigmoid().numpy()
    rings, rejected = polygons(scores >= threshold, bounds)
    digest = hashlib.sha256(raw + json.dumps([bounds, data['kind'], threshold, REVISION]).encode()).hexdigest()[:16]
    w, s, e, n = bounds
    source = {'name': '本机 CLIPSeg 影像候选', 'method': 'clipseg_text_mask_v1', 'model': MODEL,
              'model_revision': REVISION, 'model_license': 'Apache-2.0', 'provider': data['provider'],
              'status': 'model_draft_unverified', 'accuracy_m': None, 'field_verified': False,
              'threshold': threshold, 'prompt': PROMPTS[data['kind']], 'image_sha256': hashlib.sha256(raw).hexdigest(),
              'image_size': list(image.size), 'bounds': bounds, 'projection': 'EPSG:3857 pixel grid to WGS84',
              'model_grid': list(logits.shape[-2:]), 'license': None, 'scope_only': True,
              'diagnostics': {'score_min': float(scores.min()), 'score_max': float(scores.max()), 'rejected': rejected}}
    # This scope is deliberately not asserted to be the actual course boundary.
    features = [{'type': 'Feature', 'id': 'scope-'+digest, 'properties': {'kind': 'course', 'name': '本次影像选区（非球场边界，须核对）', 'scope_only': True},
                 'geometry': {'type': 'Polygon', 'coordinates': [[[w, n], [e, n], [e, s], [w, s], [w, n]]]}}]
    for i, ring in enumerate(rings):
        features.append({'type': 'Feature', 'id': 'clipseg-'+digest+'-'+str(i),
                         'properties': {'kind': data['kind'], 'name': data['kind']+' 模型候选 '+str(i+1), 'hole': None, 'field_verified': False},
                         'geometry': {'type': 'Polygon', 'coordinates': [ring]}})
    emit('result', data={'type': 'FeatureCollection', 'coordinate_system': 'WGS84', 'source': source, 'features': features},
         rejected=rejected, statistics={'score_min': float(scores.min()), 'score_max': float(scores.max()), 'candidates': len(rings)})


if __name__ == '__main__':
    try:
        if '--download' in sys.argv:
            download()
        else:
            os.environ['HF_HUB_OFFLINE'] = '1'
            raw = sys.stdin.buffer.read(6_100_001)
            if len(raw) > 6_100_000:
                raise ValueError('请求超过大小限制')
            run(json.loads(raw))
    except Exception as error:
        emit('error', message=str(error)[:500])
        sys.exit(1)
