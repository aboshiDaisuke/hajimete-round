# キャラ設定画（正面・横・背面の3面図）から作るゴルファーのモデル・リグ・アニメーション
#   python3 tools/sheet_model.py female            … 設定画 → 体の形とテクスチャ（tools/build/）
#   CHARACTER=female blender -b -P tools/blender_golfer.py   → assets/golfer-female.glb と golfer-female-glb.js
#   アニメーション：Swing / Putt / Idle（待機）/ Cheer（喜び）/ Sad（落ち込み）
#   ... -- check   → 確認用のポーズ画像も書き出す
# 座標：Blender の Z が上。ゴルファーは -Y を向き、目標方向は +X（右打ち）。
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.geometry import intersect_point_line

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(ROOT, 'assets')
BUILD = os.path.join(ROOT, 'tools', 'build')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from sheet_uv import assign_uvs
CH = os.environ.get('CHARACTER', 'female')
CHECK = 'check' in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else False
OUT_CHECK = os.environ.get('GOLFER_CHECK_DIR', os.path.join(ROOT, 'dist', 'golfer_check'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
V = Vector


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


MATS = {}


def mat(name, hexcol, rough=0.6, metal=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*srgb(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*srgb(hexcol), 1)
    MATS[name] = m
    return m


M_EYE = mat('Eye', '#3a2418', 0.3)
M_MOUTH = mat('MouthIn', '#7a1f2b', 0.5)
M_TONGUE = mat('Tongue', '#ff7a86', 0.5)
M_CHROME = mat('Chrome', '#d9dde2', 0.18, 1.0)
M_BLACK = mat('ClubBlack', '#15171a', 0.25, 0.3)
M_GRIP = mat('Grip', '#1f2124', 0.9)
M_SHAFT = mat('Shaft', '#b8bcc2', 0.2, 1.0)
M_BRIMW = mat('Brim', '#f3f3f5', 0.6)


def new_obj(name, mesh):
    o = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(o)
    return o


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


# =========================================================
# 1. 骨格の位置（設定画から読み取った関節。腕を下ろした A ポーズ）
# =========================================================
CFG = json.load(open(os.path.join(ROOT, 'tools', 'characters', CH + '.json'), encoding='utf-8'))
JJ = json.load(open(os.path.join(BUILD, CH + '_joints.json')))
MESH = np.load(os.path.join(BUILD, CH + '_mesh.npz'))
J = {k: V(v) for k, v in JJ.items() if k not in ('eye', 'mouth', 'brim', 'skin')}


# =========================================================
# 2. 体（設定画のシルエットから作った形を間引き、設定画そのものを貼る）
# =========================================================
me = bpy.data.meshes.new('Body')
me.from_pydata(MESH['verts'].tolist(), [], MESH['faces'].tolist())
me.update()
body = new_obj('Body', me)
bpy.context.view_layer.objects.active = body
for o_ in scene.objects:
    o_.select_set(False)
body.select_set(True)
dec = body.modifiers.new('Dec', 'DECIMATE')
dec.ratio = float(os.environ.get('RATIO', '0.1'))
bpy.ops.object.modifier_apply(modifier='Dec')
me = body.data
BV = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', BV); BV = BV.reshape(-1, 3)
BF = np.zeros(len(me.polygons) * 3, np.int32); me.polygons.foreach_get('vertices', BF); BF = BF.reshape(-1, 3)
print('BODY faces', len(BF), 'verts', len(BV))
uvs = assign_uvs(BV, BF, MESH)
me.uv_layers.new(name='UV').data.foreach_set('uv', uvs.reshape(-1, 2).ravel())
M_BODY = bpy.data.materials.new('Body')
M_BODY.use_nodes = True
tex_img = bpy.data.images.load(os.path.join(BUILD, CH + '_tex.jpg'))
tex_node = M_BODY.node_tree.nodes.new('ShaderNodeTexImage')
tex_node.image = tex_img
bsdf = M_BODY.node_tree.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.85
M_BODY.node_tree.links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
body.data.materials.append(M_BODY)
smooth(body)

# =========================================================
# 3. 骨（アーマチュア）
# =========================================================
arm_data = bpy.data.armatures.new('Rig')
arm = new_obj('Golfer', arm_data)
bpy.context.view_layer.objects.active = arm
for o in scene.objects:
    o.select_set(False)
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
EB = arm_data.edit_bones


def bone(name, head, tail, parent=None, deform=True, connect=False, roll=0.0):
    b = EB.new(name)
    b.head, b.tail = V(head), V(tail)
    b.roll = roll
    if parent:
        b.parent = EB[parent]
        b.use_connect = connect
    b.use_deform = deform
    return b


bone('root', (0, 0, 0), (0, 0.25, 0), deform=False)
bone('hips', J['pelvis'], J['spine'], 'root')
bone('spine', J['spine'], J['chest'], 'hips', connect=True)
bone('chest', J['chest'], J['neck'], 'spine', connect=True)
bone('neck', J['neck'], J['head'], 'chest', connect=True)
bone('head', J['head'], J['headtop'], 'neck', connect=True)
for s in ('L', 'R'):
    bone('clavicle.' + s, J['clav.' + s], J['shoulder.' + s], 'chest')
    bone('upperarm.' + s, J['shoulder.' + s], J['elbow.' + s], 'clavicle.' + s, connect=True)
    bone('forearm.' + s, J['elbow.' + s], J['wrist.' + s], 'upperarm.' + s, connect=True)
    bone('hand.' + s, J['wrist.' + s], J['hand.' + s], 'forearm.' + s, connect=True)
    bone('thigh.' + s, J['hip.' + s], J['knee.' + s], 'hips')
    bone('shin.' + s, J['knee.' + s], J['ankle.' + s], 'thigh.' + s, connect=True)
    bone('foot.' + s, J['ankle.' + s], J['toe.' + s], 'shin.' + s, connect=True)
    bone('ik_foot.' + s, J['ankle.' + s], J['toe.' + s], 'root', deform=False)   # 足の骨と同じ向き

# クラブ：アドレスでの手元と、シャフトの向き
H0 = V((0.03, -0.30, 0.765))
IRON_LEN, DRIVER_LEN, PUTTER_LEN = 0.86, 1.04, 0.74
BALL_IRON = V((0.0, -0.735, 0.021))
C0 = (BALL_IRON - H0).normalized()
BALL_DRIVER_TARGET = V((0.1, -1.02, 0.021))
DIR_DRIVER = (BALL_DRIVER_TARGET - H0).normalized()


def club_matrix(H, C, T):
    y = C.normalized()
    t = (T - y * T.dot(y)).normalized()
    x = t.cross(y).normalized()
    z = x.cross(y).normalized()
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = H
    return m


REST_CLUB = club_matrix(H0, C0, V((0, -1, 0)))
cb = bone('club', H0, H0 + C0 * 0.2, 'chest', deform=False)
cb.matrix = REST_CLUB
cb.length = 0.2
bone('ik_hand.L', H0 - C0 * 0.035, H0 - C0 * 0.035 + C0 * 0.05, 'club', deform=False)
bone('ik_hand.R', H0 + C0 * 0.055, H0 + C0 * 0.055 + C0 * 0.05, 'club', deform=False)
bpy.ops.object.mode_set(mode='OBJECT')

DEFORM = ['hips', 'spine', 'chest', 'neck', 'head'] + [f'{b}.{s}' for s in ('L', 'R') for b in ('clavicle', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]
REST = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm_data.bones}

# =========================================================
# 4. 体の重み付け（領域ごとに候補の骨を絞り、最寄りの骨からの距離で決める）
# =========================================================
for n in DEFORM:
    body.vertex_groups.new(name=n)
BONES = list(DEFORM)


def seg_dist(P, a, b):
    ab = np.array(b - a, np.float64)
    t = np.clip(((P - np.array(a)) @ ab) / (ab @ ab), 0, 1)
    q = np.array(a) + t[:, None] * ab
    return np.linalg.norm(P - q, axis=1)


P3 = BV.astype(np.float64)
# 手は設定画のままだと大きな箱のように見えるので、手首を中心に少し小さくする
hand_mask = (P3[:, 2] < J['wrist.L'].z - 0.015) & (P3[:, 2] > J['hand.L'].z - 0.16) & (np.abs(P3[:, 0]) > max(abs(J[f'{b}.L'].x) for b in ('hip', 'knee', 'ankle')) + 0.09)
for sd, sg in (('L', 1), ('R', -1)):
    m_ = hand_mask & (np.sign(P3[:, 0]) == sg)
    c_ = np.array(J['wrist.' + sd])
    P3[m_] = c_ + (P3[m_] - c_) * 0.82
me.vertices.foreach_set('co', P3.astype(np.float32).ravel())
me.update()
D = np.stack([seg_dist(P3, *REST[n]) for n in BONES], axis=1)
Xv, Yv, Zv = P3[:, 0], P3[:, 1], P3[:, 2]
dzz = float(MESH['dz'])
hw_full = MESH['hw']
hw_full = np.array([hw_full[max(0, i - 8):i + 9].max() for i in range(len(hw_full))])   # 裾のすぐ下でも胴の幅が 0 にならないよう、前後を含めた最大値にする
hwv = np.interp(Zv, np.arange(len(hw_full)) * dzz, hw_full)                    # 高さごとの胴（スカート）の半幅
z_arm = (J['pelvis'].z + 0.35)
hw_torso = float(np.interp(z_arm, np.arange(len(hw_full)) * dzz, hw_full))     # 胴の半幅（わきの下より下）
split_z = float(np.interp(0, [0, 1], [0, 1])) + (float(MESH['gf']) - CFG['split_y']) * float(MESH['s'])
neck_z, head_z = J['neck'].z, J['head'].z
shoulder_z = J['shoulder.L'].z
# 領域
is_head = Zv > head_z
is_neckzone = (Zv > neck_z - 0.02) & ~is_head
below_hem = Zv < split_z - 0.005
torso_hw_z = np.where((Zv > J['chest'].z - 0.1) & (Zv < neck_z), hw_torso, hwv)
leg_x_max = max(abs(J[f'{b}.L'].x) for b in ('hip', 'knee', 'ankle')) + 0.09     # 脚より外側にある手は、腕の一部
arm_zone = (Zv > J['hand.L'].z - 0.16) & (~below_hem | (np.abs(Xv) > leg_x_max)) & ~is_head & ~is_neckzone
# 胴と腕の境目はなめらかにつなぐ（急に切り替えると、肩まわりが板のように伸びる）
t_arm = np.where(arm_zone, np.clip((np.abs(Xv) - (torso_hw_z - 0.02)) / 0.07, 0, 1), 0.0)
t_arm = t_arm * t_arm * (3 - 2 * t_arm)
is_leg = below_hem & ~(t_arm > 0.5)
bi = {n: i for i, n in enumerate(BONES)}


def cand_matrix(fn):
    m = np.zeros((len(P3), len(BONES)), bool)
    for i in range(len(P3)):
        for n in fn('L' if Xv[i] >= 0 else 'R', i):
            m[i, bi[n]] = True
    return m


def norm_top(allow, k=3):
    W_ = np.where(allow, 1.0 / (D + 0.012) ** 5, 0.0)
    keep = np.zeros_like(W_)
    idx = np.argsort(-W_, axis=1)[:, :k]
    np.put_along_axis(keep, idx, np.take_along_axis(W_, idx, axis=1), axis=1)
    return keep / (keep.sum(1, keepdims=True) + 1e-12)


A_head = cand_matrix(lambda sd, i: ['head'])
A_neck = cand_matrix(lambda sd, i: ['neck', 'head', 'chest'])
A_arm = cand_matrix(lambda sd, i: [f'clavicle.{sd}', f'upperarm.{sd}', f'forearm.{sd}', f'hand.{sd}', 'chest'])
A_leg = cand_matrix(lambda sd, i: [f'thigh.{sd}', f'shin.{sd}', f'foot.{sd}', 'hips'])
A_tor = cand_matrix(lambda sd, i: ['hips', 'spine', 'chest', 'neck', 'clavicle.L', 'clavicle.R'])
Wh, Wn, Wa, Wl, Wtor = (norm_top(m) for m in (A_head, A_neck, A_arm, A_leg, A_tor))
Wt = np.where(is_head[:, None], Wh, np.where(is_neckzone[:, None], Wn, np.where(is_leg[:, None], Wl, t_arm[:, None] * Wa + (1 - t_arm[:, None]) * Wtor)))
# 4本まで（glTF の上限）に絞って正規化
idx = np.argsort(-Wt, axis=1)[:, :4]
for i in range(len(P3)):
    ws = [(Wt[i, j], j) for j in idx[i] if Wt[i, j] > 0.02]
    tot = sum(w for w, _ in ws)
    for w, j in ws:
        body.vertex_groups[BONES[j]].add([i], w / tot, 'REPLACE')
body.parent = arm
am = body.modifiers.new('Armature', 'ARMATURE')
am.object = arm

# =========================================================
# 5. 顔の重ね部品（表情の切り替え用）・バイザーのつば（骨に直接くっつける）
#    ふだんは設定画の顔がそのまま見える。まばたき・喜び・落ち込みのときだけ重ねて表示する。
# =========================================================
def attach(o, bone_name):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = arm
    o.parent_type = 'BONE'
    o.parent_bone = bone_name
    o.matrix_world = mw


def uv_sphere(name, loc, scale, m, seg=20, rings=12):
    me_ = bpy.data.meshes.new(name)
    bm_ = bmesh.new()
    bmesh.ops.create_uvsphere(bm_, u_segments=seg, v_segments=rings, radius=1.0)
    bm_.to_mesh(me_); bm_.free()
    o = new_obj(name, me_)
    o.location = loc
    o.scale = scale
    o.data.materials.append(m)
    smooth(o)
    return o


def curve_mesh(name, pts, r, m):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p[0], p[1], p[2], 1)
    o = new_obj(name, cu)
    bpy.context.view_layer.objects.active = o
    for x in scene.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    o.data.materials.append(m)
    smooth(o)
    return o


def arc_pts(cx, cy, cz, rx, rz, a0, a1, n=10):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy, cz + rz * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def surface_y(x, z):
    """顔の表面（正面側）の y。前から光線を当てて調べる"""
    bpy.context.view_layer.update()
    ok, loc, nrm_, idx_ = body.ray_cast(V((x, -1.0, z)), V((0, 1, 0)))
    return loc.y if ok else -0.15


M_SKINP = mat('SkinPatch', JJ['skin'], 0.6)
face_objs = []
for i, (ex, ez) in enumerate(JJ['eye']):
    sn = '1' if ex > (JJ['eye'][0][0] + JJ['eye'][1][0]) / 2 else '-1'
    ys = surface_y(ex, ez)
    cover = uv_sphere('EyeCover' + sn, (ex, ys + 0.013, ez), (0.056, 0.02, 0.05), M_SKINP)
    happy = curve_mesh('EyeHappy' + sn, arc_pts(ex, ys - 0.006, ez - 0.012, 0.038, 0.042, 20, 160), 0.0085, M_EYE)
    closed = curve_mesh('EyeClosed' + sn, arc_pts(ex, ys - 0.006, ez + 0.004, 0.038, 0.02, 200, 340), 0.0085, M_EYE)
    face_objs += [cover, happy, closed]
mx, mz = JJ['mouth']
my = surface_y(mx, mz)
face_objs.append(uv_sphere('MouthCover', (mx, my + 0.012, mz), (0.046, 0.02, 0.034), M_SKINP))
face_objs.append(uv_sphere('MouthOpen', (mx, my + 0.004, mz - 0.002), (0.03, 0.014, 0.024), M_MOUTH))
face_objs.append(uv_sphere('Tongue', (mx, my - 0.001, mz - 0.011), (0.017, 0.008, 0.011), M_TONGUE))
face_objs.append(curve_mesh('MouthSad', arc_pts(mx, my - 0.004, mz - 0.024, 0.026, 0.016, 30, 150), 0.0065, M_MOUTH))
# バイザーのつば（薄い半楕円の板。胴体の形からは外してある）
B = JJ['brim']
s_ = float(MESH['s'])
zb, zt = (float(MESH['gf']) - B['base_z_px']) * s_, (float(MESH['gf']) - B['tip_z_px']) * s_
half_w, length = B['half_w_px'] * s_, B['base_y'] - B['tip_y']
bm_ = bmesh.new()
pts_ = [bm_.verts.new((half_w * math.cos(math.radians(a_)), -length * math.sin(math.radians(a_)), 0)) for a_ in range(0, 181, 10)]
bm_.faces.new(pts_)
brim_me = bpy.data.meshes.new('Brim')
bm_.to_mesh(brim_me); bm_.free()
brim = new_obj('Brim', brim_me)
brim.location = (0, B['base_y'], zb)
brim.rotation_euler = (math.atan2(zt - zb, length), 0, 0)
brim.data.materials.append(M_BRIMW)
bpy.context.view_layer.objects.active = brim
sol = brim.modifiers.new('Sol', 'SOLIDIFY'); sol.thickness = 0.008
bpy.ops.object.modifier_apply(modifier='Sol')
smooth(brim)
face_objs.append(brim)
for o in face_objs:
    attach(o, 'head')

# =========================================================
# 6. クラブ（アイアン・ドライバー・パター）を club の骨に付ける
# =========================================================


def tube(name, a, b, r1, r2, m, seg=16):
    d = b - a
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=d.length)
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = V((0, 0, 1)).rotation_difference(-d.normalized())
    o.location = (a + b) / 2
    o.data.materials.append(m)
    smooth(o)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def club(kind):
    d = DIR_DRIVER if kind == 'Driver' else C0
    L = {'Iron': IRON_LEN, 'Driver': DRIVER_LEN, 'Putter': PUTTER_LEN}[kind]
    butt = H0 - d * 0.13
    grip_end = H0 + d * 0.14
    tip = H0 + d * (L - 0.035)
    parts = [tube(kind + 'Grip', butt, grip_end, 0.0135, 0.0105, M_GRIP),
             tube(kind + 'Shaft', grip_end, tip, 0.0068, 0.0045, M_SHAFT)]
    head_c = H0 + d * L
    # ヘッドの向き：トウは体から離れる方向（-Y）、フェースは目標（+X）
    toe = V((0, -1, 0))
    fwd = V((1, 0, 0))
    me = bpy.data.meshes.new(kind + 'Head')
    bm = bmesh.new()
    if kind == 'Driver':
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
        for v in bm.verts:
            v.co.x *= 0.06; v.co.y *= 0.07; v.co.z *= 0.036
            if v.co.x > 0.03:
                v.co.x = 0.03 + (v.co.x - 0.03) * 0.3
        m_ = M_BLACK
    elif kind == 'Iron':
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.022; v.co.y *= 0.086; v.co.z *= 0.05
            if v.co.y > 0:
                v.co.z *= 0.75
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.005, segments=2, affect='EDGES')
        m_ = M_CHROME
    else:
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.026; v.co.y *= 0.115; v.co.z *= 0.026
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.004, segments=2, affect='EDGES')
        m_ = M_CHROME
    bm.to_mesh(me); bm.free()
    h = new_obj(kind + 'Head', me)
    h.location = head_c + toe * (0.034 if kind != 'Putter' else 0.046) + V((0, 0, 0.012))
    h.data.materials.append(m_)
    smooth(h)
    parts.append(h)
    o = join(parts, 'Club' + kind)
    attach(o, 'club')
    return o


club('Iron'); club('Driver'); club('Putter')

# =========================================================
# 7. 拘束（腕と脚のIK）
# =========================================================
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
PB = arm.pose.bones
for pb in PB:
    pb.rotation_mode = 'QUATERNION'
for s in ('L', 'R'):
    # 設定画のキャラは腕が短めなので、IK で少しだけ腕が伸びるようにする
    for bn_ in ('upperarm.', 'forearm.'):
        PB[bn_ + s].ik_stretch = 0.18
    ik = PB['hand.' + s].constraints.new('IK')
    ik.target = arm; ik.subtarget = 'ik_hand.' + s; ik.chain_count = 3
    ik = PB['shin.' + s].constraints.new('IK')
    ik.target = arm; ik.subtarget = 'ik_foot.' + s; ik.chain_count = 2
    ik.use_tail = True
    cr = PB['foot.' + s].constraints.new('COPY_ROTATION')
    cr.target = arm; cr.subtarget = 'ik_foot.' + s
    cr.mix_mode = 'REPLACE'
    # 脚の曲がり方をもう少し安定させる
    PB['shin.' + s].ik_stiffness_y = 0.9
# IK の脚の先端（足首）が ik_foot の根元に来るように、ik_foot を「足首→つま先方向」に置いてあるので use_tail で OK
for s in ('L', 'R'):
    PB['foot.' + s].constraints['Copy Rotation'].target_space = 'WORLD'
    PB['foot.' + s].constraints['Copy Rotation'].owner_space = 'WORLD'

# ik_foot のレスト向き（前向き）と foot の向きがずれている分を打ち消す
bpy.ops.object.mode_set(mode='OBJECT')


# =========================================================
# 8. ポーズを作るための道具（世界座標で回す）
# =========================================================
def upd():
    bpy.context.view_layer.update()


def reset_pose():
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    upd()


def rot_world(name, axis, deg, pivot=None):
    pb = arm.pose.bones[name]
    M = pb.matrix.copy()
    p = pivot if pivot is not None else M.translation.copy()
    R = Matrix.Rotation(math.radians(deg), 4, V(axis).normalized())
    pb.matrix = Matrix.Translation(p) @ R @ Matrix.Translation(-p) @ M
    upd()


def rot_own(name, deg):
    """骨の軸（頭→尻尾）まわりに回す（背骨まわりの捻転など）"""
    pb = arm.pose.bones[name]
    M = pb.matrix
    axis = (M.to_3x3() @ V((0, 1, 0))).normalized()
    rot_world(name, axis, deg)


def move_world(name, d):
    pb = arm.pose.bones[name]
    M = pb.matrix.copy()
    M.translation += V(d)
    pb.matrix = M
    upd()


def set_club(H, C, T):
    arm.pose.bones['club'].matrix = club_matrix(V(H), V(C), V(T))
    upd()


KEY_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'club', 'ik_foot.L', 'ik_foot.R']
prev_q = {}


def key_all(frame):
    for n in KEY_BONES:
        pb = arm.pose.bones[n]
        q = pb.rotation_quaternion.copy()
        if n in prev_q and prev_q[n].dot(q) < 0:
            q.negate()
            pb.rotation_quaternion = q
        prev_q[n] = q.copy()
        pb.keyframe_insert('location', frame=frame)
        pb.keyframe_insert('rotation_quaternion', frame=frame)


def pose(frame, tilt, spine_tilt, hips_turn, chest_turn, hips_move, H, C, T, head_turn, head_tilt=4,
         r_heel=0.0, l_knee=0.0, r_knee=0.0, hop=0.0):
    scene.frame_set(frame)
    reset_pose()
    # 腰：前傾・回転・移動
    move_world('hips', (hips_move[0], hips_move[1], hips_move[2] + hop))
    rot_world('hips', (1, 0, 0), tilt)
    rot_own('hips', hips_turn)
    rot_world('spine', (1, 0, 0), spine_tilt * 0.5)
    rot_world('chest', (1, 0, 0), spine_tilt * 0.5)
    rot_own('spine', chest_turn * 0.45)
    rot_own('chest', chest_turn * 0.55)
    # 頭：ボールを見続ける
    rot_own('neck', head_turn * 0.5)
    rot_own('head', head_turn * 0.5)
    rot_world('neck', (1, 0, 0), head_tilt * 0.6)
    rot_world('head', (1, 0, 0), head_tilt * 0.4)
    if hop:
        move_world('ik_foot.L', (0, 0, hop)); move_world('ik_foot.R', (0, 0, hop))
    # 足：右かかとを上げる（つま先を支点に）
    if r_heel:
        pb = arm.pose.bones['ik_foot.R']
        toe = V(REST['foot.R'][1])
        rot_world('ik_foot.R', (1, 0, 0), -r_heel, pivot=toe)
        rot_world('ik_foot.R', (0, 0, 1), r_heel * 0.5, pivot=toe)
    # 膝を内側に（ターゲット方向へ）送る：腰の横移動で自然に曲がるので控えめ
    set_club(H, C, T)
    key_all(frame)


def toward(H, target):
    return (V(target) - V(H)).normalized()


# =========================================================
# 9. アニメーション：フルスイング
# =========================================================
arm.animation_data_create()
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
act = bpy.data.actions.new('Swing')
arm.animation_data.action = act
ADDR = dict(tilt=22, spine_tilt=12, hips_move=(0, 0.055, -0.045))
Hi = V((0.06, -0.305, 0.765))
pose(0, **ADDR, hips_turn=0, chest_turn=0, H=H0, C=C0, T=(0, -1, 0), head_turn=0)
pose(10, **ADDR, hips_turn=-10, chest_turn=-25, H=(-0.25, -0.29, 0.86), C=(-0.97, -0.05, 0.22), T=(0, 0, 1), head_turn=30)
pose(18, tilt=21, spine_tilt=12, hips_move=(-0.015, 0.055, -0.045), hips_turn=-25, chest_turn=-42, H=(-0.4, -0.16, 1.1), C=(-0.12, 0.08, 0.99), T=(0, -1, 0), head_turn=58)
pose(28, tilt=20, spine_tilt=12, hips_move=(-0.025, 0.055, -0.04), hips_turn=-40, chest_turn=-52, H=(-0.3, 0.03, 1.43), C=(0.9, 0.32, -0.28), T=(0, 0, -1), head_turn=80)
pose(35, tilt=21, spine_tilt=12, hips_move=(0.04, 0.055, -0.05), hips_turn=-12, chest_turn=-42, H=(-0.36, -0.14, 1.03), C=(-0.33, 0.14, 0.93), T=(0, -1, 0), head_turn=48)
pose(40, tilt=21, spine_tilt=11, hips_move=(0.07, 0.06, -0.045), hips_turn=35, chest_turn=-25, H=Hi, C=toward(Hi, BALL_IRON), T=(0, -1, 0), head_turn=-8, r_heel=8)
pose(45, tilt=15, spine_tilt=8, hips_move=(0.09, 0.05, -0.035), hips_turn=55, chest_turn=0, H=(0.42, -0.27, 0.93), C=(0.95, -0.05, 0.28), T=(0, 0, 1), head_turn=-35, head_tilt=0, r_heel=25)
pose(52, tilt=8, spine_tilt=4, hips_move=(0.1, 0.03, -0.02), hips_turn=75, chest_turn=18, H=(0.42, -0.1, 1.3), C=(0.1, 0.3, 0.95), T=(0, -1, 0), head_turn=-55, head_tilt=-8, r_heel=45)
pose(62, tilt=4, spine_tilt=0, hips_move=(0.11, 0.02, -0.01), hips_turn=88, chest_turn=25, H=(0.22, 0.02, 1.46), C=(-0.55, 0.6, -0.58), T=(0, 0, -1), head_turn=-75, head_tilt=-12, r_heel=60)
for fc in getattr(act, 'fcurves', []):
    for k in fc.keyframe_points:
        k.interpolation = 'BEZIER'
swing_action = act

# =========================================================
# 10. アニメーション：パッティング
# =========================================================
act = bpy.data.actions.new('Putt')
arm.animation_data.action = act
prev_q.clear()
PUT = dict(tilt=28, spine_tilt=16, hips_move=(0, 0.06, -0.05), hips_turn=0, chest_turn=0, head_tilt=8)
Hp = V((0.0, -0.24, 0.72))
Cp = V((0, -0.34, -0.94)).normalized()
BALL_PUTT = Hp + Cp * PUTTER_LEN


def putt_pose(frame, dx_head, dx_hand):
    head = BALL_PUTT + V((dx_head, 0, 0.004 if dx_head else 0))
    H = Hp + V((dx_hand, 0, 0.004 * abs(dx_head) / 0.15))
    pose(frame, **PUT, H=H, C=(head - H).normalized(), T=(0, -1, 0), head_turn=0)


putt_pose(0, 0, 0)
putt_pose(16, -0.17, -0.05)
putt_pose(28, 0, 0)
putt_pose(40, 0.22, 0.07)
putt_action = act

# =========================================================
# 10b. アニメーション：待機（息づかい＋クラブをちょんちょん）・喜び・落ち込み
# =========================================================
def new_action(name):
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    prev_q.clear()
    return act


def bez(act):
    for fc in getattr(act, 'fcurves', []):
        for k in fc.keyframe_points:
            k.interpolation = 'BEZIER'


def sway(dx):
    return V(C0) + V((dx, 0, 0.02 * abs(dx) / 0.12))


def pose2(frame, **kw):
    kw.setdefault('hips_turn', 0); kw.setdefault('chest_turn', 0)
    pose(frame, **kw)


idle_action = new_action('Idle')
A2 = dict(tilt=22, spine_tilt=12)
pose2(0, **A2, hips_move=(0, 0.055, -0.045), H=H0, C=C0, T=(0, -1, 0), head_turn=0)
pose2(15, tilt=21, spine_tilt=12, hips_move=(0.012, 0.055, -0.038), H=H0 + V((-0.02, 0, 0.005)), C=sway(-0.14), T=(0, -1, 0), head_turn=4)
pose2(30, tilt=22.5, spine_tilt=12.5, hips_move=(0, 0.055, -0.052), H=H0, C=C0, T=(0, -1, 0), head_turn=0)
pose2(45, tilt=21, spine_tilt=12, hips_move=(-0.012, 0.055, -0.038), H=H0 + V((0.02, 0, 0.005)), C=sway(0.14), T=(0, -1, 0), head_turn=-4)
pose2(60, **A2, hips_move=(0, 0.055, -0.045), H=H0, C=C0, T=(0, -1, 0), head_turn=0)
bez(idle_action)

cheer_action = new_action('Cheer')
pose2(0, **A2, hips_move=(0, 0.055, -0.045), H=H0, C=C0, T=(0, -1, 0), head_turn=0)
pose2(8, tilt=30, spine_tilt=18, hips_move=(0, 0.07, -0.15), H=(0.03, -0.27, 0.66), C=(0.12, -0.3, -0.94), T=(0, -1, 0), head_turn=0)
pose2(16, tilt=-4, spine_tilt=-6, hips_move=(0, 0.02, 0.0), hop=0.16, H=(0.1, -0.4, 1.35), C=(0.7, 0.0, 0.7), T=(0, -1, 0), head_turn=0, head_tilt=-14)
pose2(24, tilt=-6, spine_tilt=-8, hips_move=(0, 0.02, 0.0), hop=0.24, H=(0.12, -0.42, 1.5), C=(0.72, 0.0, 0.69), T=(0, -1, 0), head_turn=0, head_tilt=-18)
pose2(32, tilt=4, spine_tilt=-2, hips_move=(0, 0.03, -0.09), H=(0.1, -0.4, 1.3), C=(0.7, 0.0, 0.7), T=(0, -1, 0), head_turn=0, head_tilt=-10)
pose2(40, tilt=-2, spine_tilt=-5, hips_move=(0, 0.02, -0.03), H=(0.12, -0.41, 1.42), C=(0.72, 0.0, 0.69), T=(0, -1, 0), head_turn=0, head_tilt=-14)
pose2(50, tilt=-3, spine_tilt=-6, hips_move=(0, 0.02, -0.012), H=(0.12, -0.42, 1.46), C=(0.74, 0.0, 0.67), T=(0, -1, 0), head_turn=0, head_tilt=-16)
bez(cheer_action)

sad_action = new_action('Sad')
pose2(0, **A2, hips_move=(0, 0.055, -0.045), H=H0, C=C0, T=(0, -1, 0), head_turn=0)
pose2(14, tilt=32, spine_tilt=22, hips_move=(0, 0.09, -0.1), H=(0.03, -0.22, 0.66), C=(0.1, -0.25, -0.96), T=(0, -1, 0), head_turn=0, head_tilt=26)
pose2(30, tilt=33, spine_tilt=23, hips_move=(0.015, 0.09, -0.105), H=(0.05, -0.22, 0.66), C=(0.12, -0.25, -0.96), T=(0, -1, 0), head_turn=8, head_tilt=28)
pose2(46, tilt=32, spine_tilt=22, hips_move=(-0.015, 0.09, -0.1), H=(0.01, -0.22, 0.66), C=(0.08, -0.25, -0.96), T=(0, -1, 0), head_turn=-8, head_tilt=26)
pose2(60, tilt=32, spine_tilt=22, hips_move=(0, 0.09, -0.1), H=(0.03, -0.22, 0.66), C=(0.1, -0.25, -0.96), T=(0, -1, 0), head_turn=0, head_tilt=26)
bez(sad_action)

# キャラ紹介用：背すじを伸ばして正面を向き、クラブを地面について立つ（息づかいだけ動く）
stand_action = new_action('Stand')
ST = dict(tilt=0, spine_tilt=0, H=(0.10, -0.20, 0.92), C=(0.02, -0.10, -0.995), T=(0, -1, 0), head_turn=0)
pose2(0, **ST, hips_move=(0.0, 0.0, 0.0), head_tilt=0)
pose2(30, tilt=0.8, spine_tilt=0.6, H=(0.10, -0.20, 0.925), C=(0.02, -0.10, -0.995), T=(0, -1, 0), head_turn=2, hips_move=(0.0, 0.0, 0.006), head_tilt=-1.5)
pose2(60, **ST, hips_move=(0.0, 0.0, 0.0), head_tilt=0)
bez(stand_action)

for a in (swing_action, putt_action, idle_action, cheer_action, sad_action, stand_action):
    a.use_fake_user = True
    tr = arm.animation_data.nla_tracks.new()
    tr.name = a.name
    tr.strips.new(a.name, 0, a)
arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')

# =========================================================
# 11. 確認：手とクラブのずれ、ヘッドの位置
# =========================================================


def eval_frame(action, f):
    arm.animation_data.action = action
    scene.frame_set(f)
    upd()


def world_of(name):
    return arm.matrix_world @ arm.pose.bones[name].matrix


for a, frames in ((swing_action, (0, 10, 18, 28, 35, 40, 45, 52, 62)), (putt_action, (0, 16, 28, 40)), (idle_action, (0, 15, 45)), (cheer_action, (8, 16, 24, 32, 50)), (sad_action, (14, 30)), (stand_action, (0, 30))):
    for f in frames:
        eval_frame(a, f)
        errs = []
        for s in ('L', 'R'):
            hand_tail = arm.matrix_world @ arm.pose.bones['hand.' + s].tail
            tgt = arm.matrix_world @ arm.pose.bones['ik_hand.' + s].head
            errs.append((hand_tail - tgt).length)
        print(f'CHECK {a.name} f{f}: hand gap L={errs[0]:.3f} R={errs[1]:.3f}')
print('BALL iron', tuple(round(x, 3) for x in BALL_IRON), 'driver', tuple(round(x, 3) for x in (H0 + DIR_DRIVER * DRIVER_LEN)), 'putt', tuple(round(x, 3) for x in BALL_PUTT))

# =========================================================
# 12. 確認用の画像
# =========================================================
if CHECK:
    os.makedirs(OUT_CHECK, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.display.shading.light = 'FLAT'
    for o_ in face_objs:
        o_.hide_render = True
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 420
    scene.render.resolution_y = 520
    wd = bpy.data.worlds.new('W'); scene.world = wd
    ground = bpy.data.meshes.new('G')
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3); bm.to_mesh(ground); bm.free()
    g = new_obj('Ground', ground); g.data.materials.append(mat('GroundM', '#7fae6a', 1))
    ballo = uv_sphere('BallCheck', BALL_IRON + V((0, 0, 0.0)), (0.0214, 0.0214, 0.0214), mat('BallM', '#ffffff', 0.3))
    cam_d = bpy.data.cameras.new('C'); cam = new_obj('Cam', cam_d); scene.camera = cam
    cam_d.lens = 50

    def shoot(path, loc, look):
        cam.location = V(loc)
        cam.rotation_euler = (V(look) - V(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

    ballo.location = BALL_IRON
    for a, frames in ((swing_action, (0, 10, 18, 28, 35, 40, 45, 62)), (putt_action, (0, 16, 40)), (idle_action, (0,)), (cheer_action, (8, 24, 50)), (sad_action, (14,)), (stand_action, (0,))):
        ballo.location = BALL_PUTT if a is putt_action else BALL_IRON
        for f in frames:
            eval_frame(a, f)
            shoot(os.path.join(OUT_CHECK, f'{a.name}_{f:02d}_front.png'), (0, -4.2, 1.0), (0, 0, 0.9))
            shoot(os.path.join(OUT_CHECK, f'{a.name}_{f:02d}_side.png'), (-4.0, -0.5, 1.0), (0, -0.4, 0.85))
    eval_frame(idle_action, 0)
    shoot(os.path.join(OUT_CHECK, 'hands_side.png'), (-1.3, -0.35, 0.85), (0, -0.3, 0.8))
    shoot(os.path.join(OUT_CHECK, 'hands_front.png'), (0.1, -1.6, 0.9), (0, -0.3, 0.8))
    eval_frame(swing_action, 45)
    shoot(os.path.join(OUT_CHECK, 'hands45_front.png'), (0.3, -2.2, 1.0), (0.3, -0.2, 0.9))
    arm.animation_data.action = None
    for tr_ in arm.animation_data.nla_tracks:
        tr_.mute = True
    bpy.ops.object.mode_set(mode='POSE')
    reset_pose()
    bpy.ops.object.mode_set(mode='OBJECT')
    shoot(os.path.join(OUT_CHECK, 'face_front.png'), (0, -1.7, 1.66), (0, 0, 1.66))
    shoot(os.path.join(OUT_CHECK, 'face_34.png'), (0.9, -1.4, 1.72), (0, -0.1, 1.66))
    for tr_ in arm.animation_data.nla_tracks:
        tr_.mute = False
    g.hide_render = True
    bpy.data.objects.remove(g); bpy.data.objects.remove(ballo); bpy.data.objects.remove(cam)

# =========================================================
# 13. 書き出し
# =========================================================
arm.animation_data.action = None
scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ASSETS, f'golfer-{CH}.glb'),
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_frame_step=1,
    export_texcoords=True,
    export_skins=True,
    export_all_influences=False,
    export_yup=True,
)

# アプリが読み込む JS 版（ファイルをダブルクリックで開いても動くよう base64 で埋め込む）
import base64
with open(os.path.join(ASSETS, f'golfer-{CH}.glb'), 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('ascii')
with open(os.path.join(ASSETS, f'golfer-{CH}-glb.js'), 'w', encoding='utf-8') as f:
    f.write(f'/* 設定画から作ったゴルファー（{CH}）tools/blender_golfer.py */\n')
    f.write('window.GOLFER_GLBS = window.GOLFER_GLBS || {};\n')
    f.write(f'window.GOLFER_GLBS.{CH} = "' + b64 + '";\n')
print(f'EXPORTED golfer-{CH}.glb / -glb.js')
