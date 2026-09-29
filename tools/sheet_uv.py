"""間引いたメッシュに、設定画を投影して貼るための UV を作る（numpy のみ・Blender からも使う）

   1つの面を、正面・背面・横の3つの絵に同時に投影した UV を作る（uvF / uvB / uvS）。
   どの絵をどれだけ使うかは、アプリ側のシェーダー（js/golfer3d.js）が面の向きでなめらかに決める。
   面ごとに1枚の絵を選ぶと、切りかわる所に線やギザギザが出るため。
     - 正面と背面：前を向く面ほど正面の絵（頭だけは位置で決める。あごの下などに後ろ髪が写らないように）
     - 横：左右を向く面ほど横の絵。ただし胴（横の絵ではうでが重なっている）と、手が重なる高さでは使わない
       使わない面は uvS の x に +2 を足しておき、シェーダーはそれを見て横の絵を混ぜない
"""
import numpy as np

SIDE_OFF = 2.0      # 横の絵を使わない面の目印（uvS.x に足す）


def _proj(P, x, y, z, which):
    s = float(P['s'])
    if which == 'f':
        return P['cx_f'] + x / s, P['gf'] - z / s
    if which == 'b':
        return P['cx_b'] - x / s, P['gb'] - z / s
    return P['xr_s'] + y / s, P['gs'] - z / s


def assign_uvs3(verts, faces, P):
    W, H = float(P['W']), float(P['H'])
    tri = verts[faces]
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    cen = tri.mean(1)
    k = np.clip((cen[:, 2] / float(P['dz'])).astype(int), 0, len(P['hw']) - 1)
    hw = P['hw'][k]
    neck_z = float(P['neck_z'])
    head = cen[:, 2] >= neck_z
    # 胴の半幅：わきの下〜肩の行は、設定画でうでが胴にくっついているので幅が大きく出る。
    # わきの下のすぐ下（すき間がある高さ）の幅から、肩の関節の少し内側まで、なめらかに広げた幅を上限にする（blender_golfer.py の重み付けと同じ考え方）
    above_hand = np.zeros(len(cen), bool)
    if 'pit_z' in P:
        z0_ = float(P['pit_z']) - 0.035
        hw_pit = float(np.interp(z0_, np.arange(len(P['hw'])) * float(P['dz']), P['hw']))
        k_ = np.clip((cen[:, 2] - z0_) / (float(P['shoulder_z']) - z0_), 0, 1)
        k_ = k_ * k_ * (3 - 2 * k_)
        hw_up = hw_pit + (float(P['shoulder_x']) - 0.035 - hw_pit) * k_
        above_hand = (cen[:, 2] > z0_) & (cen[:, 2] < float(P['shoulder_z']))
        hw = np.where(above_hand, np.minimum(hw, hw_up), hw)
    # 胴・スカート。うでより上の高さでは、胴の横・背中のふちまで胴に入れる（背面の絵で胴のとなりに写っているうでの色を拾わないように）
    torso = (np.abs(cen[:, 0]) <= np.where(above_hand | (cen[:, 2] > float(P['hand_z_hi'])), hw + 0.025, hw * 0.98)) & ~head
    outer = np.sign(nrm[:, 0]) == np.sign(cen[:, 0])                  # 手足の外側
    near_hand = (cen[:, 2] > float(P['hand_z_lo'])) & (cen[:, 2] < float(P['hand_z_hi'])) & (np.abs(cen[:, 0]) < 0.25)
    # 首・えり（肩より上）は、横の絵でうでが重ならないので、胴でも横の絵を使う
    neck_zone = (cen[:, 2] > float(P['shtop_z'])) if 'shtop_z' in P else np.zeros(len(cen), bool)
    # 横の絵はキャラの左側（+x）を写している。右手（-x）の手首から先に使うと、左手のグローブ・腕時計が写るので使わない
    far_hand = (cen[:, 0] < 0) & (cen[:, 2] < float(P['hand_z_hi']) + 0.05) & ~head
    side_ok = head | neck_zone | (~torso & outer & ~near_hand & ~far_hand)

    x, y, z = tri[..., 0], tri[..., 1], tri[..., 2]
    # 頭のてっぺん向きの面は、絵のいちばん上のふち（背景のにじみ）ではなく、少し下の髪・帽子の色を使う
    z = z - (0.05 * np.clip((nrm[:, 2] - 0.6) / 0.4, 0, 1) * head)[:, None]
    # 頭の前半分は正面の絵、後ろ半分は背面の絵。ただしバイザー・帽子の帯より上で上を向く面（頭のてっぺん）は、前でも背面の絵を使う
    # （正面の絵のてっぺん近くはバイザー・帽子の帯なので、頭の上に帯が写り込む。背面の絵は髪・帽子の頂上）
    top = (nrm[:, 2] >= 0.4) & ((cen[:, 2] > float(P['brim_z0'])) if 'brim_z0' in P else True)
    head_front = (cen[:, 1] < float(P['head_side_y'])) & ~top

    def clamp_head(px, py, key):
        """頭：設定画の髪のいちばん外側（ほつれと背景が混ざる）を拾わないよう、少し内側に収める"""
        if 'ext_' + key not in P:
            return px
        ext = P['ext_' + key]
        row = np.clip(np.round(py).astype(int), 0, int(H) - 1)
        lo, hi = ext[row, 0] + 9.0, ext[row, 1] - 9.0
        return np.where(head[:, None], np.minimum(np.maximum(px, lo), np.maximum(hi, lo)), px)

    fx, fy = _proj(P, x, y, z, 'f'); fx = clamp_head(fx, fy, 'f')
    bx, by = _proj(P, x, y, z, 'b')
    # 頭のてっぺん（上を向く面）：背面の絵をそのまま上から投影すると、絵のいちばん上の数行が引き伸ばされて筋になる。
    # 上から見た頭を、背面の絵の後頭部あたりの四角に貼る（前後の位置 y を、絵の縦方向に置きかえる）
    ztop = float(verts[:, 2].max())
    tt = (top & head)[:, None]
    by_top = P['gb'] - (ztop - 0.075) / float(P['s']) + y / float(P['s']) * 0.55
    by = np.where(tt, by_top, by)
    bx = clamp_head(bx, by, 'b')

    def clamp_torso(px, py, key):
        """胴・スカート：横向きの面が、正面・背面の絵のふち（背景・うでとのすき間）を拾わないよう、胴の輪郭の内側に収める"""
        if 'cext_' + key not in P:
            return px
        ext = P['cext_' + key]
        row = np.clip(np.round(py).astype(int), 0, int(H) - 1)
        lo, hi = ext[row, 0] + 6.0, ext[row, 1] - 6.0
        # うでより上（わきの下〜肩）は、うでの写りこみを拾わないよう、うでを含まない胴の幅の内側に収める
        cx_ = float(P['cx_' + key])
        hwp = (hw / float(P['s']))[:, None] - 5.0
        lo = np.where(above_hand[:, None], np.maximum(lo, cx_ - hwp), lo)
        hi = np.where(above_hand[:, None], np.minimum(hi, cx_ + hwp), hi)
        ok = ~np.isnan(lo) & (hi > lo)
        lo, hi = np.where(ok, lo, -1e9), np.where(ok, hi, 1e9)
        return np.where(torso[:, None], np.minimum(np.maximum(px, lo), hi), px)
    fx = clamp_torso(fx, fy, 'f')
    bx = clamp_torso(bx, by, 'b')
    sx, sy = _proj(P, x, y, z, 's'); sx = clamp_head(sx, sy, 's')
    # 頭は位置で正面か背面かを決めて、uvF と uvB を同じにする（向きで混ぜない）
    hf = (head & head_front)[:, None]
    hb = (head & ~head_front)[:, None]
    fx2, fy2 = np.where(hb, bx, fx), np.where(hb, by, fy)
    bx2, by2 = np.where(hf, fx, bx), np.where(hf, fy, by)

    def pack(px, py, off=0.0):
        uv = np.zeros((len(faces), 3, 2), np.float32)
        uv[..., 0] = px / W + off
        uv[..., 1] = 1 - py / H
        return uv
    uvF = pack(fx2, fy2)
    uvB = pack(bx2, by2)
    uvS = pack(sx, sy)
    uvS[~side_ok, :, 0] += SIDE_OFF
    return uvF, uvB, uvS


def assign_uvs(verts, faces, P):
    """確認用（Blender の画像書き出し）：向きで1枚を選んだ UV"""
    uvF, uvB, uvS = assign_uvs3(verts, faces, P)
    tri = verts[faces]
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    use_s = (uvS[:, 0, 0] < 1.5) & (np.abs(nrm[:, 0]) > 0.7)
    use_b = nrm[:, 1] > 0
    out = np.where(use_b[:, None, None], uvB, uvF)
    return np.where(use_s[:, None, None], uvS, out)
