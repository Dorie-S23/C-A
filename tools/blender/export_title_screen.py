"""Export "TADC Intro Animation V2.blend" (the title screen) to a GLB the
game can show faithfully.

What the plain glTF export loses, and what this script does about it (all
in memory; the .blend file itself is never saved or modified):

- CIRCUS's polka dots are procedural (two Voronoi layers over the letter's
  vertex colour). glTF can't carry node graphs, so each letter's colour is
  baked into its own texture with Cycles.
- The tent, its doorway and Kinger's glove store colours as float colour
  attributes, which the exporter writes out white. They're converted to
  byte colours and wired straight into the material.
- DIGITAL's material is fully metallic. In Blender it picks up the world
  lighting; in game it would render near-black, so it's made non-metal.
- THE AMAZING and CIRCUS are placed by Child Of constraints, which glTF
  can't express; they're baked into plain keyframes.
- The camera (its fly-in to the tent is part of the animation) and the
  modifiers (Subdivision smoothing, and the Shrinkwrap that seats the
  PLAY/OPTIONS/QUIT labels onto their buttons) are exported too. Modifiers
  are applied by this script at the menu's hold frame, where the buttons
  have their final shape, keeping the shape keys the letters pop in with.
- The sky is a world texture, which glTF has no place for; it's written
  next to the GLB as its own image.

Run from the repo root:
    blender -b "assets-src/TADC Intro Animation V2.blend" \
        --python tools/blender/export_title_screen.py -- \
        "public/models/game screens/title-screen.glb"
"""
import os
import sys

import bpy

OUTPUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'title-screen.glb'
SKY_OUTPUT = os.path.join(os.path.dirname(OUTPUT), 'title-sky.jpg')

# Frame where the logo has finished assembling and the glove rests on PLAY.
# The game holds the animation here while the menu is live.
HOLD_FRAME = 175
END_FRAME = 275  # the camera has flown into the tent
BAKE_SIZE = 1024

scene = bpy.context.scene


def bake_circus_letters():
    """Bakes each CIRCUS letter's procedural colour into its own image."""
    source = bpy.data.materials['Material.005']
    letters = [ob for ob in bpy.data.objects if ob.type == 'MESH'
               and any(slot.material == source for slot in ob.material_slots)]

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4  # a colour-only bake needs no light samples
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 8

    for ob in letters:
        mat = source.copy()
        mat.name = f'CIRCUS {ob.name}'
        for slot in ob.material_slots:
            if slot.material == source:
                slot.material = mat

        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        image = bpy.data.images.new(mat.name, BAKE_SIZE, BAKE_SIZE)
        target = nodes.new('ShaderNodeTexImage')
        target.image = image
        nodes.active = target

        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True)

        # Swap the procedural graph for the baked image.
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        for node in [n for n in nodes if n not in (bsdf, target) and n.type != 'OUTPUT_MATERIAL']:
            nodes.remove(node)
        links.new(target.outputs['Color'], bsdf.inputs['Base Color'])
        image.file_format = 'PNG'
        image.pack()
        print(f'baked {ob.name}')


def byte_vertex_colours(material_names):
    """Float colour attributes export white; swap them for byte copies and
    feed them straight into Base Color (dropping colour-correction nodes
    that leave these two-tone colours practically unchanged)."""
    for name in material_names:
        mat = bpy.data.materials.get(name)
        if mat is None:
            print(f'skip {name}: not in this file')
            continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        attr_node = next(n for n in nodes if n.type == 'VERTEX_COLOR')
        links.new(attr_node.outputs['Color'], bsdf.inputs['Base Color'])

        for ob in bpy.data.objects:
            if ob.type != 'MESH' or not any(s.material == mat for s in ob.material_slots):
                continue
            attrs = ob.data.color_attributes
            source = attrs.get(attr_node.layer_name) or attrs[0]
            if source.data_type == 'BYTE_COLOR':
                continue
            values = [tuple(d.color) for d in source.data]
            domain, attr_name = source.domain, source.name
            for other in [a.name for a in attrs]:
                attrs.remove(attrs[other])
            new = attrs.new(attr_name, 'BYTE_COLOR', domain)
            for d, v in zip(new.data, values):
                d.color = v
            attrs.active_color = new
            attrs.render_color_index = 0
            attr_node.layer_name = attr_name
            print(f'byte colours for {ob.name}')


def write_sky():
    image = next(n.image for n in scene.world.node_tree.nodes if n.type == 'TEX_IMAGE')
    with open(SKY_OUTPUT, 'wb') as f:
        f.write(image.packed_file.data)
    print('wrote', SKY_OUTPUT)


def lighten_subdivision(max_levels):
    """The logo letters carry level-2 Subdivision (16x the faces, and
    DIGITAL's shape keys copy them again), which alone made the GLB ~13 MB.
    One level is plenty at title-screen size."""
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.name.startswith('Text'):
            continue
        for mod in ob.modifiers:
            if mod.type == 'SUBSURF' and mod.levels > max_levels:
                mod.levels = max_levels


def bake_constraints():
    """THE AMAZING and CIRCUS follow animated empties through Child Of
    constraints, which glTF can't express — exported as-is they sit frozen
    in the wrong place. Record where each constrained object really is on
    every frame, drop the constraint, and key those transforms instead."""
    constrained = [ob for ob in bpy.data.objects if ob.constraints]
    samples = {ob: [] for ob in constrained}
    for frame in range(scene.frame_start, END_FRAME + 1):
        scene.frame_set(frame)
        for ob in constrained:
            samples[ob].append((frame, ob.matrix_world.copy()))

    for ob in constrained:
        ob.constraints.clear()
        ob.animation_data_clear()  # CIRCUS's one-key placeholder actions
        ob.rotation_mode = 'QUATERNION'
        for frame, matrix in samples[ob]:
            ob.matrix_world = matrix
            ob.keyframe_insert('location', frame=frame)
            ob.keyframe_insert('rotation_quaternion', frame=frame)
            ob.keyframe_insert('scale', frame=frame)
        print(f'baked constraints of {ob.name}')


def apply_modifiers():
    """Applies every mesh's modifiers as they stand at HOLD_FRAME.

    The exporter's own "apply modifiers" evaluated these at frame 0, where
    the labels' Shrinkwrap target (their button) is still scale 0 and
    DIGITAL's letters are shrunk by their shape key, so both came out as
    a single point. It also drops shape keys entirely. Here, objects with
    shape keys get each key re-evaluated through the modifiers (they don't
    change topology), so the pop-in animations survive."""
    scene.frame_set(HOLD_FRAME)
    for ob in [o for o in bpy.data.objects if o.type == 'MESH' and o.modifiers]:
        keys = ob.data.shape_keys
        if keys is None:
            depsgraph = bpy.context.evaluated_depsgraph_get()
            mesh = bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph))
            ob.modifiers.clear()
            ob.data = mesh
            continue

        # Evaluate with the shape-key animation lifted off, so each key's
        # value can be set by hand.
        action = keys.animation_data.action if keys.animation_data else None
        slot = getattr(keys.animation_data, 'action_slot', None) if action else None
        if action:
            keys.animation_data.action = None
        blocks = keys.key_blocks
        shapes = {}
        for target in [None] + [kb.name for kb in blocks[1:]]:
            for kb in blocks[1:]:
                kb.value = 1.0 if kb.name == target else 0.0
            depsgraph = bpy.context.evaluated_depsgraph_get()
            depsgraph.update()
            evaluated = bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph))
            shapes[target] = evaluated

        names = [kb.name for kb in blocks]
        ob.modifiers.clear()
        ob.shape_key_clear()
        ob.data = shapes[None]
        ob.shape_key_add(name=names[0], from_mix=False)
        for name in names[1:]:
            block = ob.shape_key_add(name=name, from_mix=False)
            for point, vertex in zip(block.data, shapes[name].vertices):
                point.co = vertex.co
        if action:
            new_keys = ob.data.shape_keys
            new_keys.animation_data_create()
            new_keys.animation_data.action = action
            if slot is not None:
                new_keys.animation_data.action_slot = slot
        print(f'applied modifiers of {ob.name}, keeping shape keys {names[1:]}')


bake_circus_letters()
lighten_subdivision(1)
bake_constraints()
apply_modifiers()
byte_vertex_colours(['Cloth.001', 'Plastic', 'kinger_gloves'])
bpy.data.materials['Material.002'].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.0
write_sky()

scene.frame_set(HOLD_FRAME)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    export_apply=False,  # already applied above, at the right frame
    export_vertex_color='MATERIAL',
    export_all_vertex_colors=False,
    export_cameras=True,
    export_lights=False,  # lit in game to match; see titleScreen.js
    export_animations=True,
    export_animation_mode='ACTIONS',
)
print('exported', OUTPUT)
