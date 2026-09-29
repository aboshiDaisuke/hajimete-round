"""表情の絵（まばたき・喜び・落ち込み）を、体のテクスチャの目・口のところに重ねる小さな画像として作る
   python3 tools/sheet_model.py female   → tools/build/female_tex.jpg（顔アップを貼りこんだテクスチャ）
   python3 tools/face_states.py female   → assets/golfer-female-face.js
   考え方：目・口の周りを肌色でうめ、その上に閉じた目・笑った目・口を描く。テクスチャと同じ座標なので、
   顔の丸みにめり込んだり、ずれたりしない。アプリ側（js/golfer3d.js）が、表情に合わせてシェーダーでこの絵に差し替える。
"""
import base64, io, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from skimage.restoration import inpaint_biharmonic

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
UP = 2                     # sheet_model.py と同じ（テクスチャは設定画の2倍）
SS = 4                     # 描くときの拡大率（なめらかにするため）
INK = (72, 42, 32)         # まつげの色


def ellipse_mask(shape, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    return (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) <= 1.0


def feather(mask, px):
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(px))
    return np.asarray(m).astype(np.float32) / 255.0


def build(name):
    cfg = json.load(open(os.path.join(ROOT, 'tools', 'characters', name + '.json')))
    tex = np.asarray(Image.open(os.path.join(ROOT, 'tools', 'build', name + '_tex.jpg')).convert('RGB')).astype(np.float32)
    TH, TW, _ = tex.shape
    eyes = np.array(cfg['eyes'], float) * UP
    mouth = np.array(cfg['mouth'], float) * UP
    ed = eyes[1, 0] - eyes[0, 0]
    x0, x1 = int(eyes[0, 0] - 0.62 * ed), int(eyes[1, 0] + 0.62 * ed)
    y0, y1 = int(eyes[:, 1].mean() - 0.40 * ed), int(mouth[1] + 0.34 * ed)
    crop = tex[y0:y1, x0:x1].copy()
    h, w, _ = crop.shape
    E = [((e[0] - x0), (e[1] - y0 - 0.01 * ed)) for e in eyes]
    M = (mouth[0] - x0, mouth[1] - y0)
    erx, ery = 0.36 * ed, 0.29 * ed
    mrx, mry = 0.24 * ed, 0.13 * ed

    eye_mask = np.zeros((h, w), bool)
    for cx, cy in E:
        eye_mask |= ellipse_mask((h, w), cx, cy, erx, ery)
    mouth_mask = ellipse_mask((h, w), M[0], M[1] + 0.01 * ed, mrx, mry)
    src = crop / 255.0
    skin_eyes = inpaint_biharmonic(src, eye_mask, channel_axis=-1)
    skin_mouth = inpaint_biharmonic(src, mouth_mask, channel_axis=-1)
    # まぶた・くちびるの陰影が急に途切れないよう、うめた色は少しだけ元の絵に混ぜる
    a_eye = feather(eye_mask, 0.03 * ed)[..., None]
    a_mouth = feather(mouth_mask, 0.03 * ed)[..., None]

    def layer(fn):
        """SS 倍のキャンバスに描いて縮小する（fn(draw, k) の k は座標の倍率）"""
        im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
        fn(ImageDraw.Draw(im), SS)
        return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0

    def lid(d, k, cx, cy, up):
        """閉じた目：up=False は下にふくらむ弧（まばたき）、True は上にふくらむ弧（笑い目 ^）"""
        n = 40
        hw = 0.30 * ed
        pts = []
        for i in range(n + 1):
            t = i / n
            x = cx + (t * 2 - 1) * hw
            s = np.sin(np.pi * t)
            y = cy + (0.03 * ed - 0.13 * ed * s) if up else cy + (0.0 * ed + 0.075 * ed * s)
            pts.append((x * k, y * k))
        wdt = (0.062 if up else 0.05) * ed * k
        d.line(pts, fill=INK + (255,), width=int(wdt), joint='curve')
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - wdt / 2, p[1] - wdt / 2, p[0] + wdt / 2, p[1] + wdt / 2], fill=INK + (255,))

    def eyes_fn(up):
        return lambda d, k: [lid(d, k, cx, cy, up) for cx, cy in E]

    def open_mouth(d, k):
        cx, cy = M[0], M[1] + 0.02 * ed
        rx, ry = 0.125 * ed, 0.10 * ed
        d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=(118, 24, 44, 255))
        d.ellipse([(cx - rx * 0.62) * k, (cy + ry * 0.05) * k, (cx + rx * 0.62) * k, (cy + ry * 0.92) * k], fill=(232, 112, 128, 255))
        d.arc([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], 0, 360, fill=(90, 18, 34, 255), width=int(0.012 * ed * k))

    def sad_mouth(d, k):
        cx, cy = M[0], M[1] + 0.05 * ed
        n = 30
        pts = [(cx + (i / n * 2 - 1) * 0.15 * ed, cy - 0.07 * ed * np.sin(np.pi * i / n) + 0.02 * ed) for i in range(n + 1)]
        d.line([(x * k, y * k) for x, y in pts], fill=(176, 82, 88, 255), width=int(0.032 * ed * k), joint='curve')

    def compose(eye_layer, mouth_layer, eyes_on, mouth_on):
        """肌色のうめ（アルファ a）の上に、描いた線・口（アルファ la）を重ねる。目と口は重ならないので、足し合わせる"""
        pm = np.zeros((h, w, 3), np.float32)
        alpha = np.zeros((h, w), np.float32)
        parts = []
        if eyes_on:
            parts.append((skin_eyes, a_eye[..., 0], eye_layer))
        if mouth_on:
            parts.append((skin_mouth, a_mouth[..., 0], mouth_layer))
        for skin, a, lay in parts:
            la = lay[..., 3]
            out_a = la + a * (1 - la)
            pm += lay[..., :3] * la[..., None] + skin * (a * (1 - la))[..., None]
            alpha += out_a
        alpha = np.clip(alpha, 0, 1)
        return np.dstack([np.clip(pm / np.maximum(alpha[..., None], 1e-4), 0, 1), alpha])

    none = np.zeros((h, w, 4), np.float32)
    blink = compose(layer(eyes_fn(False)), none, True, False)
    happy = compose(layer(eyes_fn(True)), layer(open_mouth), True, True)
    sad = compose(none, layer(sad_mouth), False, True)
    strip = np.concatenate([blink, happy, sad], axis=1)               # 横に3つ並べる：まばたき | 喜び | 落ち込み
    img = Image.fromarray((strip * 255 + 0.5).astype(np.uint8), 'RGBA')
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    png = base64.b64encode(buf.getvalue()).decode('ascii')
    rect = [x0 / TW, y0 / TH, (x1 - x0) / TW, (y1 - y0) / TH]
    out = os.path.join(ROOT, 'assets', f'golfer-{name}-face.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(f'/* {name} の表情（まばたき・喜び・落ち込み）の絵。tools/face_states.py */\n')
        f.write('window.GOLFER_FACES = window.GOLFER_FACES || {};\n')
        f.write(f'window.GOLFER_FACES.{name} = {{ rect: {json.dumps([round(v, 6) for v in rect])}, n: 3, png: "{png}" }};\n')
    img.save(os.path.join(ROOT, 'tools', 'build', name + '_face_states.png'))
    print(name, 'face states', img.size, 'bytes', len(png))


if __name__ == '__main__':
    build(sys.argv[1])
