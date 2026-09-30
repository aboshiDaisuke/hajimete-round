"""Blender製の起動コース。blender -b -P tools/blender_lobby.py"""
import base64
import math
import os
import random
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(18)

def material(name, color, roughness=0.85, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    p = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(p.outputs['BSDF'], output.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return m

grass = material('Soft emerald turf', (0.19, 0.48, 0.23))
fairway = material('Freshly cut fairway', (0.32, 0.66, 0.30))
stripe = material('Fairway mowing stripes', (0.39, 0.72, 0.36))
green = material('Putting green', (0.51, 0.79, 0.35))
earth = material('Island cut earth', (0.21, 0.34, 0.25))
rim = material('Island pale foundation', (0.70, 0.77, 0.57))
sand = material('Warm sand', (0.93, 0.84, 0.63))
water = material('Turquoise pond', (0.10, 0.55, 0.58), 0.24, 0.20)
bark = material('Tree trunks', (0.36, 0.27, 0.16))
leaves = [material('Foliage ' + str(i), c) for i, c in enumerate([(0.12, 0.37, 0.22), (0.22, 0.51, 0.24), (0.39, 0.63, 0.27)])]
cream = material('Clubhouse ivory', (0.97, 0.93, 0.78))
roof = material('Clubhouse terracotta', (0.73, 0.34, 0.19))
glass = material('Clubhouse windows', (0.12, 0.34, 0.31), 0.3)
gold = material('Flag golden yellow', (1.0, 0.71, 0.10))
white = material('Flagpole white', (0.94, 0.96, 0.86), 0.45)
stone = material('Path stones', (0.76, 0.79, 0.66))

def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def sphere(name, pos, scale, mat, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=pos)
    o = finish(bpy.context.object, name, mat)
    o.scale = scale
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def disc(name, pos, scale, mat, depth=0.08):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1, depth=depth, location=pos)
    o = finish(bpy.context.object, name, mat)
    o.scale.x, o.scale.y = scale
    bevel = o.modifiers.new('Soft edges', 'BEVEL')
    bevel.width, bevel.segments = 0.04, 2
    o.modifiers.new('Smooth normals', 'WEIGHTED_NORMAL')
    return o

def box(name, pos, scale, mat, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = finish(bpy.context.object, name, mat)
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('Rounded edges', 'BEVEL')
        b.width, b.segments = bevel, 2
        o.modifiers.new('Smooth normals', 'WEIGHTED_NORMAL')
    return o

# Z is up in Blender; glTF exporter converts to Three.js Y-up.
disc('Island base', (0, 0, -0.42), (5.8, 3.9), earth, 0.75)
disc('Island foundation', (0, 0, -0.75), (5.64, 3.78), rim, 0.15)
disc('Island turf', (0, 0, -0.01), (5.83, 3.93), grass, 0.15)
disc('Fairway', (-0.3, 0, 0.08), (3.7, 2.4), fairway)
for i in range(8):
    y = -1.75 + i * 0.5
    width = 5.9 * math.sqrt(max(0, 1 - (y / 2.5) ** 2))
    box('Mowing stripe', (-0.3, y, 0.125), (width, 0.25, 0.014), stripe, 0.015)
disc('Green collar', (1.8, 0.75, 0.16), (1.65, 1.22), fairway)
disc('Putting green', (1.8, 0.75, 0.21), (1.48, 1.08), green)
disc('Bunker edge', (-1.3, 1.45, 0.16), (1.3, 0.72), rim)
disc('Bunker', (-1.3, 1.45, 0.21), (1.15, 0.60), sand)
disc('Pond bank', (3.5, -0.9, 0.10), (1.45, 1.0), rim)
disc('Pond water', (3.5, -0.9, 0.16), (1.32, 0.88), water)
for i in range(3):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25 + i * 0.18, minor_radius=0.013, major_segments=48, minor_segments=6, location=(3.5, -0.9, 0.205))
    finish(bpy.context.object, 'Water ripple', white).scale.y = 0.55

# Clubhouse and stone path.
box('Clubhouse', (-3.1, 1.55, 0.63), (1.6, 1.1, 1.1), cream)
for x in [-3.6, -2.9]:
    box('Clubhouse window', (x, 0.989, 0.74), (0.36, 0.03, 0.44), glass)
box('Clubhouse door', (-3.25, 0.977, 0.37), (0.30, 0.05, 0.65), bark)
for sign in [-1, 1]:
    o = box('Pitched roof', (-3.1, 1.55 + sign * 0.33, 1.40), (1.93, 0.83, 0.13), roof)
    o.rotation_euler.x = sign * math.radians(-30)
box('Chimney', (-3.55, 1.70, 1.65), (0.24, 0.24, 0.60), cream)
for i in range(6):
    disc('Stepping stone', (-3.15 + i * 0.12, 0.6 - i * 0.45, 0.15), (0.23, 0.16), stone, 0.07)

for i, (x, y, h) in enumerate([(-4.8, 0, 1.9), (-4.5, 2.0, 2.2), (-1.7, 2.9, 1.8), (0, 3.1, 2.5), (3.4, 2.2, 1.9), (4.7, 1.0, 2.3), (-4.5, -1.6, 1.6)]):
    disc('Tree trunk', (x, y, h * 0.40), (0.10, 0.10), bark, h * 0.8)
    sphere('Tree crown', (x, y, h * 0.83), (0.65, 0.57, h * 0.40), leaves[i % 3])
    sphere('Tree crown detail', (x - 0.32, y - 0.12, h * 0.70), (0.42, 0.4, 0.5), leaves[(i + 1) % 3])
for i in range(20):
    angle = i / 20 * 2 * math.pi
    x, y = math.cos(angle) * 5.45, math.sin(angle) * 3.50
    sphere('Edge shrub', (x, y, 0.25), (0.28, 0.30, 0.30), leaves[i % 3], 1)

# A real waving flag is animated in the Three.js scene.
disc('Cup', (1.8, 0.7, 0.258), (0.11, 0.11), bark, 0.015)
disc('Flagpole', (1.8, 0.7, 1.22), (0.025, 0.025), white, 1.95)
mesh = bpy.data.meshes.new('Flag triangle')
mesh.from_pydata([(1.8, 0.7, 2.15), (2.6, 0.7, 1.94), (1.8, 0.7, 1.71)], [], [(0, 1, 2)])
mesh.update()
flag = bpy.data.objects.new('LobbyFlag', mesh)
bpy.context.collection.objects.link(flag)
flag.data.materials.append(gold)
solid = flag.modifiers.new('Flag thickness', 'SOLIDIFY')
solid.thickness = 0.012
for x in [-1.35, 0.25]:
    disc('Tee marker', (x, -2.25, 0.16), (0.11, 0.11), gold, 0.18)
disc('Character tee', (-0.55, -2.1, 0.115), (1.7, 0.8), fairway)

os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, 'lobby.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True)
with open(path, 'rb') as f:
    encoded = base64.b64encode(f.read()).decode()
with open(os.path.join(OUT, 'lobby-glb.js'), 'w') as f:
    f.write('window.LOBBY_GLB_BASE64="' + encoded + '";\n')

# A matching still makes startup usable while WebGL/CDN is loading or unavailable.
for ch, x in [('female', -1.2), ('male', 0.65)]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, 'golfer-' + ch + '.glb'))
    imported = set(bpy.data.objects) - before
    for o in imported:
        if o.type == 'ARMATURE':
            o.data.pose_position = 'REST'
        if o.parent is None:
            o.location += Vector((x, -2.15, 0.17))
            o.rotation_euler.z = math.radians(-8)
        if o.type == 'MESH' and (o.name.startswith('Club') or o.name.startswith(('EyeCover', 'EyeHappy', 'EyeClosed', 'MouthCover', 'MouthOpen', 'MouthSad', 'Tongue'))):
            o.hide_render = True
        if o.name.startswith('Club'):
            for child in o.children_recursive:
                child.hide_render = True

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1100, 900
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.world.color = (0.45, 0.55, 0.48)
for name, pos, power, size in [('Key', (-4, -6, 9), 1500, 7), ('Fill', (5, 1, 7), 900, 6)]:
    bpy.ops.object.light_add(type='AREA', location=pos)
    light = bpy.context.object
    light.name = name
    light.data.energy, light.data.shape, light.data.size = power, 'DISK', size
    light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(7.8, -13, 9.2))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0.65)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type, camera.data.ortho_scale = 'ORTHO', 13.7
scene.camera = camera
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, 'lobby-poster.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tools', 'build', 'lobby.blend'))
bpy.ops.render.render(write_still=True)
print('Built lobby.glb, lobby-glb.js, and lobby-poster.png')
