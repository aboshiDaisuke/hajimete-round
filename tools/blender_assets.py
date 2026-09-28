# Blender で使う素材を作るスクリプト
#   blender -b -P tools/blender_assets.py
# 出力:
#   assets/ball.glb        … ディンプル付きゴルフボール（Three.js 用）
#   assets/render_icon.png … アプリアイコン用レンダー
#   assets/render_hero.png … 3D 読み込み前に表示するヒーロー画像
import bpy, bmesh, math, os, random
from mathutils import Vector, kdtree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSETS = os.path.join(ROOT, "assets")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def dimple_centers(n):
    pts = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - (i + 0.5) / n * 2
        r = math.sqrt(1 - y * y)
        t = golden * i
        pts.append(Vector((math.cos(t) * r, y, math.sin(t) * r)))
    return pts


def make_ball(name, subdiv, radius):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    centers = dimple_centers(332)
    tree = kdtree.KDTree(len(centers))
    for i, c in enumerate(centers):
        tree.insert(c, i)
    tree.balance()
    R = 0.092   # ディンプルの角半径（rad）
    D = 0.026   # ディンプルの深さ（半径比）
    for v in bm.verts:
        p = v.co.normalized()
        co, _, _ = tree.find(p)
        ang = p.angle(co)
        depth = 0.0
        if ang < R:
            t = ang / R
            depth = D * (1 - t * t) ** 1.5
        v.co = p * radius * (1 - depth)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def principled(name, color, rough, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    for key in ("Coat Weight", "Clearcoat"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = coat
            break
    return mat


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


# ---------- 1. Three.js 用のボール（GLB） ----------
reset()
ball = make_ball("GolfBall", 6, 1.0)
ball.data.materials.append(principled("BallWhite", srgb("#f7f7f2"), 0.32, 0.6))
bpy.ops.object.select_all(action="DESELECT")
ball.select_set(True)
bpy.context.view_layer.objects.active = ball
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ASSETS, "ball.glb"),
    export_format="GLB",
    use_selection=True,
    export_normals=True,
    export_texcoords=False,
    export_materials="EXPORT",
)
print("exported ball.glb")


# ---------- 2. レンダー用シーン ----------
def build_render_scene(kind):
    reset()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception as e:
        print("GPU not used:", e)
    scene.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"

    # ボール（実寸 42.67mm）
    ball = make_ball("Ball", 7, 0.02135)
    ball.data.materials.append(principled("BallWhite", srgb("#f5f5ef"), 0.28, 0.7))

    # ティー（フラッグイエロー）
    tee_h = 0.035
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.0022, depth=tee_h, location=(0, 0, tee_h / 2))
    shaft = bpy.context.object
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.0022, radius2=0.0075, depth=0.008, location=(0, 0, tee_h + 0.004))
    cup = bpy.context.object
    tee_mat = principled("Tee", srgb("#f2b705"), 0.35, 0.3)
    for o in (shaft, cup):
        o.data.materials.append(tee_mat)
        for poly in o.data.polygons:
            poly.use_smooth = True
    ball.location = (0, 0, tee_h + 0.008 + 0.0205)

    # 芝の地面（ノイズで色ムラ）
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    ground = bpy.context.object
    gm = bpy.data.materials.new("Grass")
    gm.use_nodes = True
    nt = gm.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.9
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 60.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*srgb("#1d5230"), 1)
    ramp.color_ramp.elements[1].color = (*srgb("#3f8a4c"), 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    ground.data.materials.append(gm)

    # 遠景の木（ボケ用）
    tree_mat = principled("Tree", srgb("#1e4a2a"), 0.8)
    rnd = random.Random(7)
    for i in range(26):
        x = rnd.uniform(-6, 6)
        y = rnd.uniform(5, 9)
        s = rnd.uniform(0.6, 1.3)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=s, location=(x, y, s * 0.9))
        bpy.context.object.data.materials.append(tree_mat)

    # 空
    world = bpy.data.worlds.new("Sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*srgb("#bfe0f0"), 1)
    bg.inputs["Strength"].default_value = 0.9

    # 太陽（朝の斜光）
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 4.0
    sun_data.angle = math.radians(3)
    sun_data.color = srgb("#fff0d8")
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(58), 0, math.radians(-140))
    scene.collection.objects.link(sun)

    # カメラ
    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = ball
    target = Vector(ball.location)

    if kind == "icon":
        scene.render.resolution_x = 1024
        scene.render.resolution_y = 1024
        cam_data.lens = 100
        cam_data.dof.aperture_fstop = 2.0
        cam.location = target + Vector((0.0, -0.36, 0.09))
    else:
        scene.render.resolution_x = 1600
        scene.render.resolution_y = 1000
        cam_data.lens = 70
        cam_data.dof.aperture_fstop = 1.6
        cam.location = target + Vector((0.11, -0.40, 0.035))
    direction = target + Vector((0, 0, -0.004)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    if kind == "hero":
        # ボールを画面の右下寄りに置く
        cam_data.shift_x = -0.16
        cam_data.shift_y = 0.12
    return scene


for kind in ("icon", "hero"):
    scene = build_render_scene(kind)
    scene.render.filepath = os.path.join(ASSETS, f"render_{kind}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", kind)
