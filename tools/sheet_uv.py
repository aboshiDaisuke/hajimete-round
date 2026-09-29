"""間引いたメッシュに、設定画を投影して貼るための UV を作る（numpy のみ・Blender からも使う）"""
import numpy as np


def assign_uvs(verts, faces, P):
    """各面の向きで、正面／背面／横のどの絵を使うかを決めて UV（ピクセル位置÷画像サイズ）を返す"""
    s, W, H = float(P['s']), float(P['W']), float(P['H'])
    tri = verts[faces]
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    cen = tri.mean(1)
    k = np.clip((cen[:, 2] / float(P['dz'])).astype(int), 0, len(P['hw']) - 1)
    hw = P['hw'][k]
    neck_z = float(P['neck_z'])
    torso = (np.abs(cen[:, 0]) <= hw * 0.98) & (cen[:, 2] < neck_z)       # 胴・スカートの側面は、正面／背面の絵を使う
    head = cen[:, 2] >= neck_z
    # 頭：ふつうは正面／背面の絵。耳より後ろの横向きの面だけ、横の絵を使う（つばの二重写しを防ぐ）
    # 目・鼻・口の高さの前半分は、横の絵（顔の輪郭）を使うと顔が二重に写るので、正面の絵を使う
    face_band = (cen[:, 2] > float(P['face_z_lo'])) & (cen[:, 2] < float(P['face_z_hi'])) & (cen[:, 1] <= float(P['head_side_y']))
    side_head = head & (np.abs(nrm[:, 0]) > 0.45) & ~face_band
    # 手足：外側を向いた面だけ横の絵を使う（内側はうでや反対の脚が写っているので、正面／背面の絵）
    outer = np.sign(nrm[:, 0]) == np.sign(cen[:, 0])
    # 手がからだに重なって写っている高さでは、胴・脚の側面に手袋が写り込むので、正面／背面の絵を使う
    near_hand = (cen[:, 2] > float(P['hand_z_lo'])) & (cen[:, 2] < float(P['hand_z_hi'])) & (np.abs(cen[:, 0]) < 0.25)
    side_limb = (np.abs(nrm[:, 0]) > np.abs(nrm[:, 1])) & outer & ~near_hand
    side = np.where(torso, False, np.where(head, side_head, side_limb))
    # 頭は面の向きではなく位置で決める（前半分は正面の絵、後ろ半分は背面の絵）。下向きの面などで背面の絵が混ざるのを防ぐ
    front = (~side) & np.where(head, cen[:, 1] < float(P['head_side_y']), nrm[:, 1] < 0)
    back = (~side) & ~front
    uv = np.zeros((len(faces), 3, 2), np.float32)
    x, y, z = tri[..., 0], tri[..., 1], tri[..., 2]
    # 頭のてっぺん向きの面は、絵のいちばん上のふち（背景のにじみ）ではなく、少し下の髪・帽子の色を使う
    z = z - (0.05 * np.clip((nrm[:, 2] - 0.6) / 0.4, 0, 1) * head)[:, None]
    px = np.where(front[:, None], P['cx_f'] + x / s, np.where(back[:, None], P['cx_b'] - x / s, P['xr_s'] + y / s))
    gr = np.where(front, P['gf'], np.where(back, P['gb'], P['gs']))
    py = gr[:, None] - z / s
    uv[..., 0] = px / W
    uv[..., 1] = 1 - py / H
    return uv
