# ゴルファー（人体・服・クラブ・リグ・スイングアニメーション）を作るスクリプト
#   blender -b -P tools/blender_golfer.py            → assets/golfer.glb
#   blender -b -P tools/blender_golfer.py -- check   → 確認用のポーズ画像も書き出す
# 座標：Blender の Z が上。ゴルファーは -Y を向き、目標方向は +X（右打ち）。
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Quaternion
from mathutils.geometry import intersect_point_line

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(ROOT, 'assets')
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


M_SKIN = mat('Skin', '#e2b08c', 0.55)
M_SHIRT = mat('Shirt', '#0d4731', 0.75)
M_PANTS = mat('Pants', '#d9d2c3', 0.8)
M_GLOVE = mat('Glove', '#f4f4f0', 0.6)
M_SHOE = mat('Shoe', '#f5f5f2', 0.45)
M_SOLE = mat('Sole', '#2b2b2b', 0.7)
M_CAP = mat('Cap', '#f5f5f2', 0.7)
M_HAIR = mat('Hair', '#2a1d14', 0.8)
M_BELT = mat('Belt', '#1d1d1d', 0.4)
M_EYE = mat('Eye', '#151515', 0.2)
M_LIP = mat('Lip', '#b97a67', 0.5)
M_CHROME = mat('Chrome', '#d9dde2', 0.18, 1.0)
M_BLACK = mat('ClubBlack', '#15171a', 0.25, 0.3)
M_GRIP = mat('Grip', '#1f2124', 0.9)
M_SHAFT = mat('Shaft', '#b8bcc2', 0.2, 1.0)
M_BUTTON = mat('Button', '#f2f2ee', 0.4)


def new_obj(name, mesh):
    o = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(o)
    return o


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


# =========================================================
# 1. 骨格の位置（レストポーズ：腕を下ろしたAポーズ）
# =========================================================
J = {
    'pelvis': V((0, 0.0, 0.95)), 'spine': V((0, 0.0, 1.08)), 'chest': V((0, 0.0, 1.22)),
    'neck': V((0, 0.0, 1.43)), 'head': V((0, 0.0, 1.53)), 'headtop': V((0, 0.0, 1.76)),
}
for s, sx in (('L', 1), ('R', -1)):
    J['clav.' + s] = V((0.03 * sx, 0.0, 1.38))
    J['shoulder.' + s] = V((0.185 * sx, 0.01, 1.405))
    J['elbow.' + s] = V((0.365 * sx, 0.035, 1.19))       # 肘は少し後ろ（IKが自然に曲がる向き）
    J['wrist.' + s] = V((0.525 * sx, 0.0, 1.0))
    J['hand.' + s] = V((0.575 * sx, -0.005, 0.925))
    J['hip.' + s] = V((0.095 * sx, 0.0, 0.93))
    J['knee.' + s] = V((0.1 * sx, -0.02, 0.51))          # 膝は少し前
    J['ankle.' + s] = V((0.1 * sx, 0.01, 0.085))
    J['toe.' + s] = V((0.1 * sx, -0.14, 0.02))

# =========================================================
# 2. 体（スキンモディファイアで骨格に肉付け → サブディビジョン）
# =========================================================
pts, edges, radii = [], [], []


def P(p, r):
    pts.append(V(p)); radii.append(r)
    return len(pts) - 1


def chain(ids):
    for a, b in zip(ids, ids[1:]):
        edges.append((a, b))


def lerp(a, b, t):
    return a + (b - a) * t


pelvis = P(J['pelvis'], (0.155, 0.115))
waist = P((0, 0.0, 1.03), (0.138, 0.1))
belly = P((0, -0.005, 1.12), (0.145, 0.105))
chest = P((0, -0.005, 1.25), (0.162, 0.112))
upper = P((0, 0.0, 1.35), (0.17, 0.1))
neckb = P((0, 0.005, 1.425), (0.058, 0.058))
neckt = P((0, 0.005, 1.52), (0.052, 0.052))
chain([pelvis, waist, belly, chest, upper, neckb, neckt])
body_ids = {}
for s in ('L', 'R'):
    sh = P(J['shoulder.' + s], (0.066, 0.066))
    edges.append((upper, sh))
    ua1 = P(lerp(J['shoulder.' + s], J['elbow.' + s], 0.3), (0.056, 0.056))
    cuff = P(lerp(J['shoulder.' + s], J['elbow.' + s], 0.52), (0.059, 0.059))
    cuff2 = P(lerp(J['shoulder.' + s], J['elbow.' + s], 0.56), (0.047, 0.047))
    el = P(J['elbow.' + s], (0.041, 0.041))
    fa = P(lerp(J['elbow.' + s], J['wrist.' + s], 0.35), (0.044, 0.042))
    wr = P(J['wrist.' + s], (0.03, 0.024))
    hd = P(J['hand.' + s], (0.042, 0.02))
    tip = P(J['hand.' + s] + (J['hand.' + s] - J['wrist.' + s]).normalized() * 0.07, (0.03, 0.016))
    chain([sh, ua1, cuff, cuff2, el, fa, wr, hd, tip])
    hp = P(J['hip.' + s] + V((0, 0, -0.02)), (0.088, 0.088))
    edges.append((pelvis, hp))
    th = P(lerp(J['hip.' + s], J['knee.' + s], 0.45), (0.078, 0.08))
    kn = P(J['knee.' + s], (0.056, 0.058))
    cf = P(lerp(J['knee.' + s], J['ankle.' + s], 0.3), (0.056, 0.06))
    an = P(J['ankle.' + s] + V((0, 0, 0.02)), (0.038, 0.04))
    chain([hp, th, kn, cf, an])

me = bpy.data.meshes.new('Body')
me.from_pydata([tuple(p) for p in pts], edges, [])
body = new_obj('Body', me)
skin = body.modifiers.new('Skin', 'SKIN')
skin.branch_smoothing = 0.6
for i, r in enumerate(radii):
    body.data.skin_vertices[0].data[i].radius = r
body.data.skin_vertices[0].data[pelvis].use_root = True
sub = body.modifiers.new('Sub', 'SUBSURF')
sub.levels = sub.render_levels = 2
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.modifier_apply(modifier='Skin')
bpy.ops.object.modifier_apply(modifier='Sub')
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
# 4. 体の重み付けと素材の割り当て（最寄りの骨で決める）
# =========================================================
for n in DEFORM:
    body.vertex_groups.new(name=n)


def seg_info(p, n):
    a, b = REST[n]
    q, t = intersect_point_line(p, a, b)
    t = max(0.0, min(1.0, t))
    q = a + (b - a) * t
    return (p - q).length, t


# 腕の骨が胴体の点を拾わないよう、領域ごとに候補を絞る
def candidates(p):
    ax = abs(p.x)
    side = 'L' if p.x >= 0 else 'R'
    if ax > 0.2 or (ax > 0.15 and p.z < 1.33 and p.z > 0.9):
        return [f'clavicle.{side}', f'upperarm.{side}', f'forearm.{side}', f'hand.{side}', 'chest']
    if p.z < 0.9 and ax > 0.02:
        return [f'thigh.{side}', f'shin.{side}', f'foot.{side}', 'hips']
    return ['hips', 'spine', 'chest', 'neck', 'head', f'clavicle.{side}', f'upperarm.{side}', f'thigh.{side}']


for v in body.data.vertices:
    p = v.co
    ds = sorted(((seg_info(p, n)[0], n) for n in candidates(p)))[:3]
    ws = [(1.0 / (d + 0.012) ** 5, n) for d, n in ds]
    tot = sum(w for w, _ in ws)
    for w, n in ws:
        if w / tot > 0.02:
            body.vertex_groups[n].add([v.index], w / tot, 'REPLACE')

for m_ in (M_SKIN, M_SHIRT, M_PANTS, M_GLOVE):
    body.data.materials.append(m_)
IDX = {'Skin': 0, 'Shirt': 1, 'Pants': 2, 'Glove': 3}
for poly in body.data.polygons:
    c = poly.center
    ds = sorted(((seg_info(c, n)[0], n) for n in candidates(c)))
    n = ds[0][1]
    t = seg_info(c, n)[1]
    if n in ('neck', 'head'):
        k = 'Skin' if c.z > 1.445 else 'Shirt'
    elif n.startswith('upperarm'):
        k = 'Shirt' if t < 0.54 else 'Skin'
    elif n.startswith('forearm'):
        k = 'Skin'
    elif n.startswith('hand'):
        k = 'Glove' if n.endswith('.L') else 'Skin'
    elif n in ('chest', 'spine') or n.startswith('clavicle'):
        k = 'Shirt'
    elif n == 'hips':
        k = 'Shirt' if c.z > 0.985 else 'Pants'
    else:
        k = 'Pants'
    poly.material_index = IDX[k]

body.parent = arm
am = body.modifiers.new('Armature', 'ARMATURE')
am.object = arm

# =========================================================
# 5. 頭・服の小物・靴（骨に直接くっつける）
# =========================================================


def attach(o, bone_name):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = arm
    o.parent_type = 'BONE'
    o.parent_bone = bone_name
    o.matrix_world = mw


def uv_sphere(name, loc, scale, m, seg=32, rings=16):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me)
    o.location = loc
    o.scale = scale
    o.data.materials.append(m)
    smooth(o)
    return o


def apply_tf(o):
    bpy.context.view_layer.objects.active = o
    for x in scene.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


HC = V((0, -0.005, 1.625))   # 頭の中心
head = uv_sphere('Head', HC, (0.083, 0.095, 0.112), M_SKIN)
# あごと頬：下半分を少し前に絞る
apply_tf(head)
for v in head.data.vertices:
    if v.co.z < 0:
        k = min(1.0, -v.co.z / 0.11)
        v.co.x *= 1 - 0.18 * k
        v.co.y *= 1 - 0.08 * k
    if v.co.y < -0.05 and v.co.z < 0.03:
        v.co.y -= 0.008 * (1 - abs(v.co.z) / 0.1)
nose = uv_sphere('Nose', HC + V((0, -0.093, -0.01)), (0.014, 0.022, 0.028), M_SKIN, 16, 10)
for s in (1, -1):
    uv_sphere('Ear' + str(s), HC + V((0.082 * s, 0.005, 0.0)), (0.012, 0.022, 0.032), M_SKIN, 16, 10)
    uv_sphere('Eye' + str(s), HC + V((0.032 * s, -0.083, 0.018)), (0.011, 0.006, 0.008), M_EYE, 12, 8)
    uv_sphere('Brow' + str(s), HC + V((0.032 * s, -0.087, 0.038)), (0.02, 0.005, 0.004), M_HAIR, 12, 6)
uv_sphere('Mouth', HC + V((0, -0.085, -0.045)), (0.02, 0.005, 0.004), M_LIP, 12, 6)
# 髪（帽子の下からのぞく後頭部と横）
hair = uv_sphere('Hair', HC + V((0, 0.006, 0.006)), (0.087, 0.098, 0.113), M_HAIR)
apply_tf(hair)
bm = bmesh.new(); bm.from_mesh(hair.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.035 or v.co.z < -0.045 or v.co.z > 0.03 or (v.co.y < 0.02 and v.co.z < -0.01)], context='VERTS')
bm.to_mesh(hair.data); bm.free()
# キャップ
cap = uv_sphere('Cap', HC + V((0, 0.0, 0.018)), (0.092, 0.103, 0.1), M_CAP)
apply_tf(cap)
bm = bmesh.new(); bm.from_mesh(cap.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.0], context='VERTS')
bm.to_mesh(cap.data); bm.free()
bpy.context.view_layer.objects.active = cap
sol = cap.modifiers.new('Sol', 'SOLIDIFY'); sol.thickness = 0.004
bpy.ops.object.modifier_apply(modifier='Sol')
brim_me = bpy.data.meshes.new('Brim')
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, radius=1.0, segments=32)
for v in bm.verts:
    v.co.x *= 0.085; v.co.y = v.co.y * 0.075
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.02], context='VERTS')
bm.to_mesh(brim_me); bm.free()
brim = new_obj('Brim', brim_me)
brim.location = HC + V((0, -0.075, 0.02))
brim.rotation_euler = (math.radians(-12), 0, 0)
brim.data.materials.append(M_CAP)
bpy.context.view_layer.objects.active = brim
sol = brim.modifiers.new('Sol', 'SOLIDIFY'); sol.thickness = 0.006
bpy.ops.object.modifier_apply(modifier='Sol')
for o in [head, nose, hair, cap, brim] + [o for o in scene.objects if o.name.startswith(('Ear', 'Eye', 'Brow', 'Mouth'))]:
    attach(o, 'head')

# ポロシャツの襟とボタン
collar_me = bpy.data.meshes.new('Collar')
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=0.072, radius2=0.062, depth=0.04)
bm.to_mesh(collar_me); bm.free()
collar = new_obj('Collar', collar_me)
collar.location = (0, 0.008, 1.445)
collar.data.materials.append(M_SHIRT)
bpy.context.view_layer.objects.active = collar
sol = collar.modifiers.new('Sol', 'SOLIDIFY'); sol.thickness = 0.006
bpy.ops.object.modifier_apply(modifier='Sol')
smooth(collar)
attach(collar, 'chest')
for i, z in enumerate((1.4, 1.37)):
    b_ = uv_sphere('Button' + str(i), (0, -0.108 + i * 0.004, z), (0.006, 0.003, 0.006), M_BUTTON, 10, 6)
    attach(b_, 'chest')
# ベルト
belt_me = bpy.data.meshes.new('Belt')
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=40, radius1=1.0, radius2=1.0, depth=0.032)
for v in bm.verts:
    v.co.x *= 0.142; v.co.y *= 0.106
bm.to_mesh(belt_me); bm.free()
belt = new_obj('Belt', belt_me)
belt.location = (0, 0.0, 0.985)
belt.data.materials.append(M_BELT)
bpy.context.view_layer.objects.active = belt
sol = belt.modifiers.new('Sol', 'SOLIDIFY'); sol.thickness = 0.007
bpy.ops.object.modifier_apply(modifier='Sol')
smooth(belt)
buckle = bpy.data.meshes.new('Buckle')
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(buckle); bm.free()
bk = new_obj('Buckle', buckle)
bk.location = (0, -0.112, 0.985); bk.scale = (0.03, 0.006, 0.024)
bk.data.materials.append(M_CHROME)
attach(belt, 'hips'); attach(bk, 'hips')


# ゴルフシューズ（丸みのある箱＋黒いソール）
def shoe(s):
    sx = 1 if s == 'L' else -1
    me = bpy.data.meshes.new('Shoe.' + s)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        # 足の形：つま先は細く低く、かかとは丸く高く、底は平ら
        w = 0.047 * (1 - max(0.0, -y - 0.35) * 0.55)
        hgt = 0.05 if z > 0 else 0.012
        top = 1 - max(0.0, -y) * 0.45
        v.co.x = x * w
        v.co.y = y * 0.142
        v.co.z = z * hgt * (top if z > 0 else 1) + 0.012
    bm.to_mesh(me); bm.free()
    o = new_obj('Shoe.' + s, me)
    o.location = (0.1 * sx, -0.05, 0.0)
    o.data.materials.append(M_SHOE)
    o.data.materials.append(M_SOLE)
    for p in o.data.polygons:
        if p.center.z < 0.009:
            p.material_index = 1
    smooth(o)
    attach(o, 'foot.' + s)


shoe('L'); shoe('R')

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
            v.co.x *= 0.05; v.co.y *= 0.058; v.co.z *= 0.03
            if v.co.x > 0.03:
                v.co.x = 0.03 + (v.co.x - 0.03) * 0.3
        m_ = M_BLACK
    elif kind == 'Iron':
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.02; v.co.y *= 0.078; v.co.z *= 0.046
            if v.co.y > 0:
                v.co.z *= 0.75
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.005, segments=2, affect='EDGES')
        m_ = M_CHROME
    else:
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.024; v.co.y *= 0.105; v.co.z *= 0.022
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.004, segments=2, affect='EDGES')
        m_ = M_CHROME
    bm.to_mesh(me); bm.free()
    h = new_obj(kind + 'Head', me)
    h.location = head_c + toe * (0.03 if kind != 'Putter' else 0.04) + V((0, 0, 0.012))
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
         r_heel=0.0, l_knee=0.0, r_knee=0.0):
    scene.frame_set(frame)
    reset_pose()
    # 腰：前傾・回転・移動
    move_world('hips', hips_move)
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

for a in (swing_action, putt_action):
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


for a, frames in ((swing_action, (0, 10, 18, 28, 35, 40, 45, 52, 62)), (putt_action, (0, 16, 28, 40))):
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
    scene.display.shading.color_type = 'MATERIAL'
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
    for a, frames in ((swing_action, (0, 10, 18, 28, 35, 40, 45, 62)), (putt_action, (0, 16, 40))):
        ballo.location = BALL_PUTT if a is putt_action else BALL_IRON
        for f in frames:
            eval_frame(a, f)
            shoot(os.path.join(OUT_CHECK, f'{a.name}_{f:02d}_front.png'), (0, -4.2, 1.0), (0, 0, 0.9))
            shoot(os.path.join(OUT_CHECK, f'{a.name}_{f:02d}_side.png'), (-4.0, -0.5, 1.0), (0, -0.4, 0.85))
    g.hide_render = True
    bpy.data.objects.remove(g); bpy.data.objects.remove(ballo); bpy.data.objects.remove(cam)

# =========================================================
# 13. 書き出し
# =========================================================
arm.animation_data.action = None
scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ASSETS, 'golfer.glb'),
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_frame_step=1,
    export_texcoords=False,
    export_skins=True,
    export_all_influences=False,
    export_yup=True,
)
print('EXPORTED golfer.glb')
