"""キャラ設定画（正面・横・背面の3面図）から、3Dの体の形と貼り付け用テクスチャを作る
   python3 tools/sheet_model.py female   →  tools/build/female_mesh.npz / female_tex.jpg
   考え方：各高さで「正面の幅 × 横の奥行き」の楕円を積み重ねて体を作る（シルエット積層）。
   テクスチャは設定画そのもの。向きごとに、正面・背面・横の絵を投影して貼る。
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD = os.path.join(ROOT, 'tools', 'build')
SHOULDER_Z = 1.405     # リグの肩の高さ（メートル）。スイングの動きはこの寸法に合わせてある


def segment(im, bg_dist=16, min_size=2000):
    """背景（と床の影）を取り除いて、人物だけのマスクを作る"""
    h, w, _ = im.shape
    border = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3), im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    bgl = bg.mean()
    d = np.sqrt(((im - bg) ** 2).sum(2))
    neutral = (im.max(2) - im.min(2)) < 9
    lum = im.mean(2)
    shadow = neutral & (lum > 0.62 * bgl) & (lum < bgl + 8)
    lab, _ = ndi.label((d < bg_dist) | shadow)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(edge))
    fg = ndi.binary_fill_holes(ndi.binary_opening(fg, iterations=1))
    lab, n = ndi.label(fg)
    sizes = ndi.sum(fg, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > min_size]
    return np.isin(lab, keep), lab, keep


def runs_of(row):
    """真偽の1次元配列から、Trueが続く区間 [(始点, 終点)] を返す"""
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0] - 1))


def joints(cfg, fm, s, cx_f, gy):
    """設定画の目印（高さ）と、シルエットの中心線から、骨の関節位置（メートル）を求める"""
    jy = cfg['joints_y']
    Zof = lambda py: (gy - py) * s
    def limb_center(py, sign, lo, hi):
        # 指定の高さで、中心から離れた区間（腕・脚）の中心の x（メートル）
        for a, b in runs_of(fm[py]):
            c = ((a + b) / 2 - cx_f) * s
            if sign * c > 0 and not ((a - cx_f) * s <= 0 <= (b - cx_f) * s) and lo <= abs(c) <= hi:
                return c
        return None
    arm_y = lambda z: float(np.interp(z, [p[0] for p in cfg['arm_y']], [p[1] for p in cfg['arm_y']]))
    J = {'pelvis': [0, 0, Zof(jy['pelvis'])], 'spine': [0, 0, Zof(jy['spine'])], 'chest': [0, 0, Zof(jy['chest'])],
         'neck': [0, 0, Zof(jy['neck'])], 'head': [0, 0, Zof(jy['head'])], 'headtop': [0, 0, Zof(jy['headtop'])]}
    sh_dx = cfg['shoulder_dx'] * s
    for sn, sx in (('L', 1), ('R', -1)):
        J['clav.' + sn] = [0.03 * sx, 0, Zof(jy['shoulder']) + 0.0]
        J['shoulder.' + sn] = [sh_dx * sx, arm_y(Zof(jy['shoulder'])), Zof(jy['shoulder'])]
        for nm in ('elbow', 'wrist', 'hand'):
            z = Zof(jy[nm])
            c = limb_center(jy[nm], sx, 0.1, 0.6)
            J[nm + '.' + sn] = [c if c is not None else sx * 0.4, arm_y(z) + (0.0 if nm != 'elbow' else 0.0), z]
        hip_dx = cfg['hip_dx'] * s
        J['hip.' + sn] = [hip_dx * sx, 0, Zof(jy['hip'])]
        za = Zof(jy['ankle'])
        ca = limb_center(jy['ankle'], sx, 0.02, 0.4)
        ax = ca if ca is not None else sx * hip_dx
        J['ankle.' + sn] = [ax, 0.01, za]
        # ひざは、腰と足首を結ぶ直線の上（少しだけ外側）に置く。内側にずれると IK でひざが交差する
        zk = Zof(jy['knee'])
        tk = (Zof(jy['hip']) - zk) / (Zof(jy['hip']) - za)
        J['knee.' + sn] = [hip_dx * sx + (ax - hip_dx * sx) * tk + 0.006 * sx, cfg['knee_y'], zk]
        J['toe.' + sn] = [J['ankle.' + sn][0], cfg['toe_y'], Zof(jy['toe'])]
    J['eye'] = [[(px - cx_f) * s, Zof(py)] for px, py in cfg['eyes']]
    J['mouth'] = [(cfg['mouth'][0] - cx_f) * s, Zof(cfg['mouth'][1])]
    J['brim'] = cfg['brim']
    return J


def paste_hires_face(tex, cfg):
    """設定画の顔（約100px）を、同じキャラの高解像度の顔アップで置き換える。目と口の3点で位置を合わせ、ふちはぼかして混ぜる"""
    from PIL import Image
    UP = 2                                                        # テクスチャは設定画の2倍の大きさにする
    H, W, _ = tex.shape
    base = np.array(Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)).resize((W * UP, H * UP), Image.LANCZOS)).astype(np.float32)
    hr = cfg['hires_head']
    hi = np.array(Image.open(os.path.join(ROOT, hr['file'])).convert('RGB')).astype(np.float32)
    src = np.array(hr['eyes'] + [hr['mouth']], np.float64)         # 顔アップの中の目・口
    dst = np.array(cfg['eyes'] + [cfg['mouth']], np.float64) * UP  # 設定画の中の目・口（テクスチャ上）
    # 相似変換（拡大・回転・移動）を最小二乗で求める
    sc = src - src.mean(0); dc = dst - dst.mean(0)
    A = np.zeros((6, 4)); bvec = np.zeros(6)
    for i in range(3):
        A[2 * i] = [sc[i, 0], -sc[i, 1], 1, 0]; A[2 * i + 1] = [sc[i, 1], sc[i, 0], 0, 1]
        bvec[2 * i], bvec[2 * i + 1] = dc[i]
    a_, b_, _, _ = np.linalg.lstsq(A, bvec, rcond=None)[0]
    M = np.array([[a_, -b_], [b_, a_]])
    t = dst.mean(0) - M @ src.mean(0)
    Minv = np.linalg.inv(M)
    # 顔のまわりの楕円のマスク（ふちはぼかす）
    ed = (dst[1, 0] - dst[0, 0])
    cx, cy = (dst[0, 0] + dst[1, 0]) / 2, dst[:2, 1].mean() + 0.22 * ed
    yy, xx = np.mgrid[0:H * UP, 0:W * UP].astype(np.float32)
    d = np.sqrt(((xx - cx) / (cfg.get('face_rx', 1.5) * ed)) ** 2 + ((yy - cy) / (cfg.get('face_ry', 1.35) * ed)) ** 2)
    mask = np.clip((1.0 - d) / 0.22, 0, 1)
    mask = mask * mask * (3 - 2 * mask)
    # 顔アップの画素を、テクスチャの各点に対応させて取り出す
    ys, xs = np.where(mask > 0)
    P = np.stack([xs, ys], 1).astype(np.float64)
    S = (P - t) @ Minv.T
    ok = (S[:, 0] >= 0) & (S[:, 0] < hi.shape[1] - 1) & (S[:, 1] >= 0) & (S[:, 1] < hi.shape[0] - 1)
    sampled = np.zeros((len(P), 3), np.float32)
    x0 = np.floor(S[ok, 0]).astype(int); y0 = np.floor(S[ok, 1]).astype(int); fx = (S[ok, 0] - x0)[:, None]; fy = (S[ok, 1] - y0)[:, None]
    sampled[ok] = (hi[y0, x0] * (1 - fx) * (1 - fy) + hi[y0, x0 + 1] * fx * (1 - fy) + hi[y0 + 1, x0] * (1 - fx) * fy + hi[y0 + 1, x0 + 1] * fx * fy)
    # 顔アップの背景（灰色）は貼らない：髪の外側の背景まで貼ると、横から見たときに灰色の筋になる
    hfg, _, _ = segment(hi, hr.get('bg_dist', 14), 5000)
    hfg = ndi.binary_erosion(hfg, iterations=3).astype(np.float32)
    hfg = ndi.gaussian_filter(hfg, 2.0)
    alpha_hi = np.zeros(len(P), np.float32)
    alpha_hi[ok] = hfg[np.clip(np.round(S[ok, 1]).astype(int), 0, hi.shape[0] - 1), np.clip(np.round(S[ok, 0]).astype(int), 0, hi.shape[1] - 1)]
    # 色あわせ：マスクの内側で、設定画の色の平均・ばらつきに合わせる
    inner = mask[ys, xs] > 0.9
    if inner.sum() > 100:
        bm_, bs_ = base[ys, xs][inner].mean(0), base[ys, xs][inner].std(0) + 1e-3
        hm_, hs_ = sampled[inner].mean(0), sampled[inner].std(0) + 1e-3
        sampled = (sampled - hm_) * np.clip(bs_ / hs_, 0.8, 1.25) + bm_
    m = (mask[ys, xs] * ok * alpha_hi)[:, None]
    out = base.copy()
    out[ys, xs] = base[ys, xs] * (1 - m) + sampled * m
    return out


def diffuse_fill(im, core):
    """人物の外側（背景）を、まわりの人物の色をなめらかに広げてうめる。
       いちばん近い色をそのまま伸ばすと、放射状の筋になり、はみ出した面に筋が写る。
       小さいぼかしから順に「重みつき平均」を作り、届いたところから採用する"""
    out = np.zeros_like(im)
    filled = core.copy()
    out[core] = im[core]
    w = core.astype(np.float32)
    for sigma in (3, 8, 20, 50, 120):
        den = ndi.gaussian_filter(w, sigma)
        num = np.stack([ndi.gaussian_filter(im[..., c] * w, sigma) for c in range(3)], -1)
        est = num / np.maximum(den[..., None], 1e-6)
        ok = (den > 0.06) & ~filled
        out[ok] = est[ok]
        filled |= ok
    if not filled.all():                                   # 念のため、残りは一番近い色
        idx = ndi.distance_transform_edt(~filled, return_distances=False, return_indices=True)
        out[~filled] = out[idx[0][~filled], idx[1][~filled]]
    return out


def build(name):
    cfg = json.load(open(os.path.join(ROOT, 'tools', 'characters', name + '.json')))
    im = np.array(Image.open(os.path.join(ROOT, cfg['sheet'])).convert('RGB')).astype(np.float32)
    H, W, _ = im.shape
    fg, lab, keep = segment(im, cfg.get('bg_dist', 16))
    boxes = []
    for k in keep:
        ys, xs = np.where(lab == k)
        boxes.append((xs.min(), xs.max(), ys.min(), ys.max(), k))
    boxes.sort()
    (fx0, fx1, fy0, fy1, fk), (sx0, sx1, sy0, sy1, sk), (bx0, bx1, by0, by1, bk) = boxes
    s = SHOULDER_Z / (fy1 - cfg['shoulder_y'])           # 1ピクセルあたりのメートル
    print(name, 'scale m/px', round(s, 5), 'height m', round((fy1 - fy0) * s, 3))
    fm, sm = lab == fk, lab == sk
    # 髪のほつれ（細い毛）は体の形に入れない。入れると、頭のふちが灰色の背景をまとった細い毛の色を拾って、横から見たときに筋になる
    disk = np.hypot(*np.mgrid[-6:7, -6:7]) <= 6
    neck_row = cfg['neck_y']
    for m_ in (fm, sm):
        m_[:neck_row] = ndi.binary_opening(m_, structure=disk)[:neck_row]
    cx_f, xr_s = cfg['front']['cx'], cfg['side']['xref']

    # ---- 体積（ボクセル）----
    dx = 0.004
    X = np.arange(-0.62, 0.62, dx); Y = np.arange(-0.42, 0.42, dx); Z = np.arange(0, (fy1 - fy0) * s + 0.06, dx)
    XX, YY = np.meshgrid(X, Y, indexing='ij')
    vol = np.zeros((len(X), len(Y), len(Z)), np.float32)
    split_z = (fy1 - cfg['split_y']) * s

    def front_at(py_):
        sr_ = runs_of(sm[py_])
        return min((a - xr_s) * s for a, b in sr_) if sr_ else 0.0


    # 胴の半幅（わきの下のすぐ下の高さ）
    az = np.array([p[0] for p in cfg['arm_y']]); ay = np.array([p[1] for p in cfg['arm_y']])

    def arm_y(z):                                          # 高さごとのうでの前後位置（横の絵から読み取った値）
        return float(np.interp(z, az, ay))
    hw_arm = 0.0
    for a, b in runs_of(fm[cfg['armpit_y'] + 12]):
        if (a - cx_f) * s <= 0 <= (b + 1 - cx_f) * s:
            hw_arm = min(abs((a - cx_f) * s), abs((b + 1 - cx_f) * s)) * 1.02
    b0, b1 = cfg['brim_rows']
    # 行ごとの前後の範囲（横の絵）と、胴の中心の左右の範囲（正面の絵）。頭では上下になめらかにする。
    # 1行ずつの値をそのまま使うと、くちびる・まつげ・つばのくぼみの行だけ頭全体の楕円が小さくなり、
    # 頭を一周する溝（横から見ると線）になるため
    YA = np.full(H, np.nan); YB = np.full(H, np.nan); XL = np.full(H, np.nan); XR = np.full(H, np.nan)
    cf = cfg['brim_front_y']
    for py in range(fy0, fy1 + 1):
        sr = runs_of(sm[py])
        if sr:
            ya = min((a - xr_s) * s for a, b in sr); yb = max((b + 1 - xr_s) * s for a, b in sr)
            if b0 <= py <= b1:                            # バイザー・帽子のつばは別パーツにするので、胴体からは外す
                ya = max(ya, cf)
            elif b1 < py <= b1 + 14:                      # つばの上下は、段差にならないよう斜めにつなぐ
                ya = max(ya, cf + (front_at(b1 + 14) - cf) * (py - b1) / 14)
            elif b0 - 14 <= py < b0:
                ya = max(ya, cf + (front_at(b0 - 14) - cf) * (b0 - py) / 14)
            YA[py], YB[py] = ya, yb
        for a, b in runs_of(fm[py]):
            if (a - cx_f) * s <= 0 <= (b + 1 - cx_f) * s:
                XL[py], XR[py] = (a - cx_f) * s, (b + 1 - cx_f) * s
    head_end = cfg['neck_y'] + 6
    def smooth_rows(arr, sigma):
        v = arr.copy()
        ok_ = ~np.isnan(v)
        idx_ = np.arange(H)
        v[~ok_] = np.interp(idx_[~ok_], idx_[ok_], v[ok_])
        sm_ = ndi.gaussian_filter1d(ndi.median_filter(v, size=5), sigma)
        w_ = np.clip((head_end + 8 - idx_) / 8.0, 0, 1)            # 頭だけ（首の少し下で元の値に戻す）
        out_ = v * (1 - w_) + sm_ * w_
        out_[~ok_] = np.nan
        return out_
    YA, YB = smooth_rows(YA, 4.0), smooth_rows(YB, 4.0)
    XL, XR = smooth_rows(XL, 2.5), smooth_rows(XR, 2.5)
    for k, z in enumerate(Z):
        py = int(round(fy1 - z / s))
        if py < fy0 or py > fy1:
            continue
        fr = [((a - cx_f) * s, (b + 1 - cx_f) * s) for a, b in runs_of(fm[py])]
        if not fr or np.isnan(YA[py]):
            continue
        if py < head_end + 8 and not np.isnan(XL[py]):
            fr = [(XL[py], XR[py]) if (x0 <= 0 <= x1) else (x0, x1) for x0, x1 in fr]
        ya, yb = YA[py], YB[py]
        yc, yh = (ya + yb) / 2, (yb - ya) / 2
        u = (fy1 - py) * s
        for x0, x1 in fr:
            xc, xh = (x0 + x1) / 2, (x1 - x0) / 2
            central = x0 <= 0 <= x1
            if xh < 0.004:
                continue
            if central and cfg.get('sh_top_y', 0) <= py <= cfg.get('armpit_y', 0) and xh > hw_arm + 0.012:
                # 肩〜わきの下：正面では胴と腕がつながって見えるので、胴と腕の2つに分けて作る
                for sx in (-1, 1):
                    a_ = 0.05
                    axc = sx * (xh - a_)
                    m = (np.abs((XX - axc) / a_) ** 2.1 + np.abs((YY - arm_y(z)) / (a_ * 1.1)) ** 2.1) <= 1.0
                    vol[:, :, k] = np.maximum(vol[:, :, k], m)
                xc, xh = 0.0, hw_arm
                n_, bh, byc = 2.4, yh, yc
            elif central:
                n_, bh, byc = 2.4, yh, yc
            elif z > split_z:                              # うで
                byc = arm_y(z)
                n_, bh = 2.1, xh * 1.1
                if z < 0.9:
                    bh, n_ = xh * 0.82, 2.0                    # 手：少し平たい丸（薄い板にすると、斜めから見て箱のように見える）
            elif abs(xc) > cfg['hip_dx'] * s + 0.1:       # 股より下にたれた手（あしの扱いにすると、横の奥行きいっぱいの板になる）
                byc = arm_y(z)
                n_, bh = 2.0, xh * 0.82
            else:                                          # あし
                n_, bh, byc = 2.3, yh, yc
            bh = max(bh, 0.012)
            m = (np.abs((XX - xc) / xh) ** n_ + np.abs((YY - byc) / bh) ** n_) <= 1.0
            vol[:, :, k] = np.maximum(vol[:, :, k], m)
    vol = ndi.gaussian_filter(vol, 1.3)
    verts, faces, _, _ = measure.marching_cubes(vol, 0.5, spacing=(dx, dx, dx))
    verts = verts + np.array([X[0], Y[0], Z[0]])
    faces = faces[:, ::-1].copy()                          # 面を外向きにそろえる
    print('mesh', len(verts), len(faces))

    # ---- テクスチャ：背景を人物の色でうめる（にじみ防止）。顔は高解像度の顔アップに差し替える ----
    # 髪と首・ほほの間に閉じこめられた背景（穴うめで人物あつかいになった灰色）は、テクスチャの色に使わない
    border_ = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3), im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    bgc = np.median(border_, axis=0)
    bg_like = (np.sqrt(((im - bgc) ** 2).sum(2)) < cfg.get('bg_dist', 16) * 1.6) & ((im.max(2) - im.min(2)) < 12)
    bg_like[cfg['shoulder_y']:] = False                      # 服（白いスカート・えり）は背景に近い色でも残す
    if cfg.get('head_bg'):                                  # 頭：髪のすき間から背景が透けた、少し色のついた灰色も背景あつかい
        hd, hc = cfg['head_bg']
        hb = (np.sqrt(((im - bgc) ** 2).sum(2)) < hd) & ((im.max(2) - im.min(2)) < hc)
        hb[cfg['neck_y'] + 4:] = False
        bg_like |= hb
    bg_like = ndi.binary_dilation(bg_like, iterations=2)
    core = ndi.binary_erosion(fg & ~bg_like, iterations=3)
    tex = diffuse_fill(im, core)
    # 横向きの絵の目・眉・口を消す（横の絵を頭の側面いっぱいに使うと、正面から見たときに横顔の目が端に写り込むため）
    from skimage.restoration import inpaint_biharmonic
    for ecx, ecy, erx, ery in cfg.get('side_erase', []):
        x0_, x1_, y0_, y1_ = int(ecx - erx - 12), int(ecx + erx + 12), int(ecy - ery - 12), int(ecy + ery + 12)
        crop = tex[y0_:y1_, x0_:x1_] / 255.0
        yy_, xx_ = np.mgrid[y0_:y1_, x0_:x1_]
        msk = (((xx_ - ecx) / erx) ** 2 + ((yy_ - ecy) / ery) ** 2) <= 1.0
        tex[y0_:y1_, x0_:x1_] = np.clip(inpaint_biharmonic(crop, msk, channel_axis=-1), 0, 1) * 255.0
    if cfg.get('hires_head'):
        tex = paste_hires_face(tex, cfg)
    os.makedirs(BUILD, exist_ok=True)
    Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)).save(os.path.join(BUILD, name + '_tex.jpg'), quality=92)

    # ---- UV に必要な値（Blender 側で、間引いたメッシュに対して作る）----
    hw = np.zeros(len(Z), np.float32)
    for k, z in enumerate(Z):
        py = int(round(fy1 - z / s))
        if fy0 <= py <= fy1:
            for a, b in runs_of(fm[py]):
                if (a - cx_f) * s <= 0 <= (b + 1 - cx_f) * s:
                    hw[k] = min(abs((a - cx_f) * s), abs((b + 1 - cx_f) * s))
    J = joints(cfg, fm, s, cx_f, fy1)
    px_, py_ = cfg['skin_px']
    c_ = im[py_ - 5:py_ + 6, px_ - 5:px_ + 6].reshape(-1, 3).mean(0)
    J['skin'] = '#%02x%02x%02x' % tuple(int(v) for v in c_)
    json.dump(J, open(os.path.join(BUILD, name + '_joints.json'), 'w'), indent=1)
    # 頭のふちの色を拾わないための、各行の「髪のいちばん外側」（設定画のピクセル）。UV をこの内側に収める
    def extents(mask):
        ex = np.zeros((H, 2), np.float32)
        ex[:, 1] = W
        for r_ in range(H):
            xs_ = np.where(mask[r_])[0]
            if len(xs_):
                ex[r_] = (xs_[0], xs_[-1] + 1)
        return ex
    bm_mask = lab == bk
    def central_extents(mask, cx):
        """各行で、体の中心線をふくむ区間（胴・スカート）の左右のはし"""
        ex = np.full((H, 2), np.nan, np.float32)
        c_ = int(round(cx))
        for r_ in range(H):
            for a_, b_ in runs_of(mask[r_]):
                if a_ <= c_ <= b_:
                    ex[r_] = (a_, b_ + 1)
        return ex
    for m_ in (bm_mask,):
        m_[:neck_row] = ndi.binary_opening(m_, structure=disk)[:neck_row]
    np.savez_compressed(os.path.join(BUILD, name + '_mesh.npz'), side_rr=cfg.get('side_rr', 0.85),
                        brim_z0=(fy1 - cfg['brim_rows'][0]) * s, pit_z=(fy1 - cfg['armpit_y']) * s, shoulder_x=abs(J['shoulder.L'][0]), shoulder_z=J['shoulder.L'][2], cext_f=central_extents(fm, cx_f), cext_b=central_extents(lab == bk, cfg['back']['cx']), shtop_z=(fy1 - cfg.get('sh_top_y', cfg['neck_y'] + 10)) * s, ext_f=extents(fm), ext_s=extents(sm), ext_b=extents(bm_mask), verts=verts.astype(np.float32), faces=faces.astype(np.int32),
                        hw=hw, dz=dx, s=s, cx_f=cx_f, xr_s=xr_s, cx_b=cfg['back']['cx'], gf=fy1, gs=sy1, gb=by1, W=W, H=H,
                        neck_z=(fy1 - cfg['neck_y']) * s,
                        face_z_lo=(fy1 - cfg['mouth'][1]) * s - 0.05, face_z_hi=(fy1 - cfg['eyes'][0][1]) * s + 0.06,
                        hand_z_lo=(fy1 - cfg['hand_rows'][1]) * s, hand_z_hi=(fy1 - cfg['hand_rows'][0]) * s, head_side_y=cfg.get('head_side_y', 0.0))
    return s


if __name__ == '__main__':
    build(sys.argv[1])
