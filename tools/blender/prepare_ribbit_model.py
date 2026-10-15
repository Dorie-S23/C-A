"""Turn the downloaded Ribbit model into a game-ready, rigged, idling GLB.

The source (public/models/characters/Ribbit/ribbit.glb) is a static mesh:
no armature, no animation, arms locked out in a T-pose, ~140k triangles,
and two heads — a blank-eyed one on the body and a second, expressive one
(sad half-lidded eyes, blush, red bow tie) lying loose by her feet. This
script, run headless, builds the version the game loads:

  1. stands the (face-down) expressive head upright on her neck, eyes on
     top and bow tie under the chin, and drops the blank one,
  2. welds the unshared vertices and decimates to a browser-friendly size,
  3. scales her to RIBBIT_HEIGHT metres, feet at the origin, facing +Z,
  4. adds a small armature (hips, spine, head, upper arm + forearm per
     side) and skins the mesh to it with weights computed from geometry,
  5. keyframes a looping "Idle" action (arms lowered, a withdrawn slouch,
     breathing, slow head and arm sway) that three.js plays with an
     AnimationMixer.

Nothing is saved back to any .blend; the input GLB is only read.

Run from the repo root:
    blender -b --python tools/blender/prepare_ribbit_model.py -- \
        public/models/characters/Ribbit/ribbit.glb \
        public/models/characters/Ribbit/ribbit-rigged.glb
"""
import math
import sys

import bpy
from mathutils import Matrix, Vector

SOURCE, OUTPUT = sys.argv[sys.argv.index('--') + 1:][:2]

RIBBIT_HEIGHT = 2.2       # metres; taller than Pomni (1.6), shorter than Caine (2.6)
TARGET_TRIANGLES = 30000  # the source is ~140k once the spare head is gone
FPS = 30
IDLE_FRAMES = 120         # one 4 s loop
# Source-space (Blender units, before scaling) head markers, found by
# inspecting the import: the body's own head sits above this height, the
# loose bow head lies entirely below the other.
BODY_HEAD_MIN_Z = 8.8
LOOSE_HEAD_MAX_Z = 0.5
BODY_HEAD_SKULL = 'imagetostl_mesh13_mat13_0'
LOOSE_HEAD_SKULL = 'imagetostl_mesh10_mat10_0'


def world_bounds(objects):
    pts = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def select_only(objects, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]


# --- 1. import, flatten the Sketchfab hierarchy into plain world-space meshes ---

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
select_only(meshes)
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']:
    bpy.data.objects.remove(o)

# --- 2. the bow head replaces the blank one ---

body_head = [o for o in meshes if world_bounds([o])[0].z > BODY_HEAD_MIN_Z]
loose_head = [o for o in meshes if world_bounds([o])[1].z < LOOSE_HEAD_MAX_Z]
body = [o for o in meshes if o not in body_head and o not in loose_head]
print(f'body head parts {len(body_head)}, loose head parts {len(loose_head)}, body parts {len(body)}')

# The loose head lies face-down: its face points -Z, its bulging frog eyes
# point -Y and the bow tie +Y. Stand it up facing the body's front (-Y)
# with the eyes on top and the bow tie under the chin: a half turn about
# (0, 1, 1) turns the face forward, then a half turn about the facing axis
# (Y) — tipping it over toward a shoulder — puts the eyes up top.
(llo, lhi) = world_bounds([bpy.data.objects[LOOSE_HEAD_SKULL]])
pivot = (llo + lhi) / 2
turn = Matrix.Rotation(math.pi, 4, 'Y') @ Matrix.Rotation(math.pi, 4, Vector((0, 1, 1)).normalized())
upright = Matrix.Translation(pivot) @ turn @ Matrix.Translation(-pivot)
for o in loose_head:
    o.data.transform(upright)
    o.data.update()

(blo, bhi) = world_bounds([bpy.data.objects[BODY_HEAD_SKULL]])
(llo, lhi) = world_bounds([bpy.data.objects[LOOSE_HEAD_SKULL]])
# Centre it where the old skull was and rest it on the same neck line.
offset = Vector(((blo.x + bhi.x - llo.x - lhi.x) / 2, (blo.y + bhi.y - llo.y - lhi.y) / 2, blo.z - llo.z))
for o in loose_head:
    o.location += offset
    o.vertex_groups.new(name='head').add(range(len(o.data.vertices)), 1.0, 'REPLACE')
for o in body_head:
    bpy.data.objects.remove(o)

# --- 3. one welded, decimated, smooth-shaded mesh at game scale ---

parts = body + loose_head
select_only(parts)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
ribbit = bpy.context.view_layer.objects.active
ribbit.name = 'Ribbit'

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.002)  # the STL-style source shares no vertices
# Its triangles also don't agree on which side is out, which smooth
# shading turns into dark blotches; point them all outward.
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
# The import carries the source's per-corner normals as custom normals;
# decimation scrambles those into dark blotches, so drop them and let
# smooth shading recompute normals from the final surface.
bpy.ops.mesh.customdata_custom_splitnormals_clear()

triangles = sum(len(p.vertices) - 2 for p in ribbit.data.polygons)
if triangles > TARGET_TRIANGLES:
    dec = ribbit.modifiers.new('Decimate', 'DECIMATE')
    dec.ratio = TARGET_TRIANGLES / triangles
    bpy.ops.object.modifier_apply(modifier=dec.name)
bpy.ops.object.shade_smooth()

lo, hi = world_bounds([ribbit])
scale = RIBBIT_HEIGHT / (hi.z - lo.z)
# Feet on the origin, centred; glTF's +Z (three's forward) is Blender's -Y,
# and the source already faces -Y, so no turn is needed.
ribbit.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
ribbit.data.update()
print(f'triangles {triangles} -> {sum(len(p.vertices) - 2 for p in ribbit.data.polygons)}')

# --- 4. landmarks for the skeleton, measured from the geometry ---

verts = ribbit.data.vertices
head_group = ribbit.vertex_groups['head'].index
is_head = [any(g.group == head_group and g.weight > 0.5 for g in v.groups) for v in verts]
H = RIBBIT_HEIGHT
hand_reach = max(abs(v.co.x) for v in verts)
arm_verts = [v.co for v in verts if abs(v.co.x) > 0.45 * hand_reach]
arm_z = sum(c.z for c in arm_verts) / len(arm_verts)
arm_y = sum(c.y for c in arm_verts) / len(arm_verts)
# Torso half-width just under the armpits; her hands droop to this height
# too, so only count what's near the middle.
chest = [abs(v.co.x) for v in verts
         if arm_z - 0.12 * H < v.co.z < arm_z - 0.05 * H and abs(v.co.x) < 0.4 * hand_reach]
shoulder_x = max(chest)
neck_z = min(v.co.z for v, h in zip(verts, is_head) if h)
# Lowest point on the centre line above her feet (which touch, so they'd
# otherwise count): the crotch.
crotch = [v.co.z for v in verts if abs(v.co.x) < 0.02 and 0.25 * H < v.co.z < arm_z - 0.2 * H]
pelvis_z = min(crotch) if crotch else 0.45 * H
elbow_x = shoulder_x + (hand_reach - shoulder_x) * 0.5
print(f'landmarks: arm_z {arm_z:.3f} shoulder_x {shoulder_x:.3f} hand {hand_reach:.3f} '
      f'neck_z {neck_z:.3f} pelvis_z {pelvis_z:.3f}')

# --- 5. armature ---

arm_data = bpy.data.armatures.new('RibbitRig')
rig = bpy.data.objects.new('RibbitRig', arm_data)
bpy.context.scene.collection.objects.link(rig)
select_only([rig])
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    b.roll = 0
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = False
    return b


bone('hips', (0, 0, 0), (0, 0, pelvis_z))
bone('spine', (0, 0, pelvis_z), (0, 0, neck_z), 'hips')
bone('head', (0, 0, neck_z), (0, 0, H), 'spine')
for side, sx in (('L', 1), ('R', -1)):
    bone(f'upper_arm.{side}', (sx * shoulder_x, arm_y, arm_z), (sx * elbow_x, arm_y, arm_z), 'spine')
    bone(f'forearm.{side}', (sx * elbow_x, arm_y, arm_z), (sx * hand_reach, arm_y, arm_z), f'upper_arm.{side}')
bpy.ops.object.mode_set(mode='OBJECT')

# --- 6. skin weights from position ---

groups = {name: ribbit.vertex_groups.get(name) or ribbit.vertex_groups.new(name=name)
          for name in ('hips', 'spine', 'head', 'upper_arm.L', 'forearm.L', 'upper_arm.R', 'forearm.R')}
arm_length = hand_reach - shoulder_x
for v, head_part in zip(verts, is_head):
    weights = {}
    if head_part:
        weights['head'] = 1.0
    else:
        x, z = v.co.x, v.co.z
        ax = abs(x)
        side = 'L' if x > 0 else 'R'
        # Arms only at arm height, so wide hips/thighs never follow them.
        arm = smoothstep(shoulder_x - 0.04, shoulder_x + 0.06, ax) * smoothstep(arm_z - 0.14 * H, arm_z - 0.08 * H, z)
        if arm > 0:
            fore = smoothstep(0.42 * arm_length, 0.58 * arm_length, ax - shoulder_x)
            weights[f'upper_arm.{side}'] = arm * (1 - fore)
            weights[f'forearm.{side}'] = arm * fore
        torso = 1 - arm
        head = smoothstep(neck_z - 0.08, neck_z + 0.02, z)
        spine = smoothstep(pelvis_z - 0.04, pelvis_z + 0.18, z)
        weights['head'] = torso * head
        weights['spine'] = torso * (1 - head) * spine
        weights['hips'] = torso * (1 - head) * (1 - spine)
    for name, w in weights.items():
        if w > 1e-3:
            groups[name].add([v.index], w, 'REPLACE')

ribbit.parent = rig
mod = ribbit.modifiers.new('Armature', 'ARMATURE')
mod.object = rig

# --- 7. the looping Idle action ---
# Each bone's pose is a rotation about its rest head in the rest frame,
# carried along by its parent's pose, then keyed into the pose bone.

select_only([rig])
bpy.ops.object.mode_set(mode='POSE')
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, IDLE_FRAMES + 1
rig.animation_data_create()
rig.animation_data.action = bpy.data.actions.new('Idle')


def rotation(axis, degrees):
    return Matrix.Rotation(math.radians(degrees), 4, axis)


def idle_pose(t):
    """Per-bone rotation at loop phase t in [0, 1), about the bone's head in
    the rest (T-pose) frame; each is applied under its parent's pose."""
    breath = math.sin(2 * math.pi * t * 2)  # two breaths a loop
    sway = math.sin(2 * math.pi * t)
    # +X rotation tips a bone's top toward -Y, i.e. forward.
    pose = {
        'spine': rotation('X', 5 + 1.5 * breath),  # slumped, breathing
        # Head low, but not so low the player can't see her face; slow tilt.
        'head': rotation('X', 6 + 2 * sway) @ rotation('Y', 5 * math.sin(2 * math.pi * t + 1)),
    }
    for side, sx in (('L', 1), ('R', -1)):
        drop = sx * (74 + 2 * breath)  # T-pose arms lowered to hang by her sides
        pose[f'upper_arm.{side}'] = rotation('X', -6 + 2.5 * math.sin(2 * math.pi * t + (0 if sx > 0 else math.pi))) @ rotation('Y', drop)
        # Poses are in the rest (T-pose) frame, where the forearm lies along X:
        # bending it toward -Y (forward) is a turn about Z.
        pose[f'forearm.{side}'] = rotation('Z', -sx * 14)  # elbows soft, forearms drifting forward
    return pose


order = ['hips', 'spine', 'head', 'upper_arm.L', 'forearm.L', 'upper_arm.R', 'forearm.R']
for frame in range(1, IDLE_FRAMES + 2, 5):
    scene.frame_set(frame)
    rots = idle_pose(((frame - 1) % IDLE_FRAMES) / IDLE_FRAMES)
    delta = {}
    for name in order:
        b = rig.data.bones[name]
        head = b.head_local
        local = Matrix.Translation(head) @ rots.get(name, Matrix.Identity(4)) @ Matrix.Translation(-head)
        delta[name] = (delta[b.parent.name] if b.parent else Matrix.Identity(4)) @ local
        pb = rig.pose.bones[name]
        pb.rotation_mode = 'QUATERNION'
        pb.matrix = delta[name] @ b.matrix_local
        bpy.context.view_layer.update()
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)
bpy.ops.object.mode_set(mode='OBJECT')

# --- 8. export ---

select_only([rig, ribbit], rig)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    use_selection=True,
    export_apply=False,          # keep the armature live — the mesh is skinned
    export_skins=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_cameras=False,
    export_lights=False,
)
print('exported', OUTPUT)
