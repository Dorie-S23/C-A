"""Export "Dorm Hall V7.blend" to a GLB the game can show faithfully.

Same idea as export_pomnis_room_v3.py: the glTF exporter only understands a
Principled BSDF fed directly by an image or colour attribute, so the
materials built any other way (the door icons' toggle node groups, a
procedural checker rug, Overlay / Multiply / Hue-Saturation colour tweaks,
mixed shaders) are rebuilt in memory into export-friendly equivalents,
baking colour maths into new images where needed. It also trims the file
down for the browser: Subdivision Surface is capped at level 1 and big
images are halved. The .blend file itself is never saved or modified.

Run from the repo root:
    blender -b "assets-src/Dorm Hall V7.blend" \
        --python tools/blender/export_dorm_hall_v7.py -- \
        "public/models/world/dorm-hall-v7.glb"
"""
import sys

import bpy
import numpy as np

OUTPUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'dorm-hall-v7.glb'

MAX_SUBSURF_LEVEL = 1    # level 2-3 makes the hall ~4x heavier for smoothing barely visible in game
MAX_TEXTURE_SIZE = 1024  # longest side, in pixels
ICON_ALPHA_CUTOFF = 0.962  # the door icons' constant colour ramp threshold


# --- colour helpers (shader nodes work in linear; image pixels are sRGB) ---

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    nz = d > 1e-8
    rc = np.where(nz, (mx - r) / np.where(nz, d, 1), 0)
    gc = np.where(nz, (mx - g) / np.where(nz, d, 1), 0)
    bc = np.where(nz, (mx - b) / np.where(nz, d, 1), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    h = np.where(nz, (h / 6) % 1, 0)
    s = np.where(mx > 1e-8, d / np.where(mx > 1e-8, mx, 1), 0)
    return np.stack([h, s, mx], -1)


def hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    choices = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    out = np.zeros(hsv.shape)
    for k, (r, g, b) in enumerate(choices):
        m = i == k
        out[..., 0][m], out[..., 1][m], out[..., 2][m] = r[m], g[m], b[m]
    return out


def luminance(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722])


def shrink(image):
    """Halves an image until its longest side fits MAX_TEXTURE_SIZE."""
    w, h = image.size
    scale = 1
    while max(w, h) / scale > MAX_TEXTURE_SIZE:
        scale *= 2
    if scale > 1:
        image.scale(w // scale, h // scale)


def read_linear(image):
    """RGBA float array (linear RGB, straight alpha) of a packed image."""
    shrink(image)
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float64).reshape(h, w, 4)
    if image.colorspace_settings.name == 'sRGB':
        px[..., :3] = srgb_to_linear(px[..., :3])
    return px


def new_image(name, rgba_linear):
    """Packs a new sRGB image from linear RGBA so the exporter embeds it."""
    h, w = rgba_linear.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    out = rgba_linear.copy()
    out[..., :3] = linear_to_srgb(out[..., :3])
    img.pixels[:] = out.astype(np.float32).ravel()
    img.file_format = 'PNG'
    img.pack()
    return img


# --- node helpers ---

def output_node(mat):
    return next(n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeOutputMaterial' and n.is_active_output)


def principled(mat):
    bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output_node(mat).inputs['Surface'])
    return bsdf


def color_attribute(mat, name='Color'):
    node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    node.layer_name = name
    return node


def find(mat, idname):
    return next(n for n in mat.node_tree.nodes if n.bl_idname == idname)


def by_id(node, identifier):
    return next(i for i in node.inputs if i.identifier == identifier)


def mix_inputs(mix):
    return by_id(mix, 'Factor_Float'), by_id(mix, 'A_Color'), by_id(mix, 'B_Color')


def socket_value(socket):
    return np.array(socket.default_value[:3], dtype=np.float64)


def image_material(mat, img, alpha_clip=False):
    """Rewires mat as a plain Principled BSDF showing img (UV-mapped, image
    alpha as opacity). With alpha_clip, the alpha goes through a Round node,
    which the exporter writes out as glTF's alphaMode MASK."""
    old = find(mat, 'ShaderNodeBsdfPrincipled')
    roughness = old.inputs['Roughness'].default_value
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = principled(mat)
    bsdf.inputs['Roughness'].default_value = roughness
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'CLIP'
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha_clip:
        rnd = nodes.new('ShaderNodeMath')
        rnd.operation = 'ROUND'
        links.new(tex.outputs['Alpha'], rnd.inputs[0])
        links.new(rnd.outputs['Value'], bsdf.inputs['Alpha'])
    return bsdf


# --- door icons ---

def fix_door_icon(mat):
    """Each door's icon decal: a "DoorIconToggle" group fed by the icon
    image. Toggle off (all but one door) shows the icon, cut out where its
    alpha is under the ramp threshold. Toggle on overlays the "Abstracted"
    art on top of the icon (the Dog door)."""
    group = next(n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeGroup')
    tex = next(n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeTexImage')
    px = read_linear(tex.image)
    alpha = px[..., 3]
    if not by_id(group, 'Socket_2').default_value:
        px[..., 3] = (alpha >= ICON_ALPHA_CUTOFF).astype(np.float64)
    else:
        inner = next(n for n in group.node_tree.nodes if n.bl_idname == 'ShaderNodeGroup')
        abs_node = next(n for n in inner.node_tree.nodes if n.bl_idname == 'ShaderNodeTexImage')
        abs_img = abs_node.image
        abs_img.scale(*tex.image.size)
        abs_px = read_linear(abs_img)
        cover = (abs_px[..., 3] >= ICON_ALPHA_CUTOFF).astype(np.float64)[..., None]
        px[..., :3] = px[..., :3] * (1 - cover) + abs_px[..., :3] * cover
        # Mix.001 (ADD, factor = icon alpha): ramp(abstracted alpha) + alpha * alpha
        px[..., 3] = np.clip(cover[..., 0] + alpha * alpha, 0, 1)
        px[..., 3] = (px[..., 3] >= 0.5).astype(np.float64)
    image_material(mat, new_image(f'{mat.name} icon (baked)', px), alpha_clip=True)


# --- shader swaps: same look, expressed as a plain Principled BSDF ---

def fix_glossy_mix(mat, roughness):
    # Mix of Diffuse(vertex colour) with faint glossy layers (0.1-5%):
    # in effect a matte surface in the object's vertex colours.
    bsdf = principled(mat)
    mat.node_tree.links.new(color_attribute(mat).outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = roughness


def fix_checkers(mat):
    """A procedural 3D checker on Generated coordinates. On the flat rug only
    the top face's slice matters, so draw one 2x2 tile and lay the rug's UVs
    out on the same grid the checker used."""
    checker = find(mat, 'ShaderNodeTexChecker')
    mapping = find(mat, 'ShaderNodeMapping')
    c1, c2 = socket_value(checker.inputs['Color1']), socket_value(checker.inputs['Color2'])
    scale = np.array(mapping.inputs['Scale'].default_value) * checker.inputs['Scale'].default_value

    for ob in objects_using(mat.name):
        mesh = ob.data
        loc, size = np.array(mesh.texspace_location), np.array(mesh.texspace_size)
        uv = mesh.uv_layers.active.data
        for loop in mesh.loops:
            co = np.array(mesh.vertices[loop.vertex_index].co)
            p = (co - (loc - size)) / (2 * size) * scale
            uv[loop.index].uv = (p[0] / 2, p[1] / 2)  # one 2x2 tile per image repeat
        # Top face sits at Generated z = 1; that cell row's parity flips the pattern.
        top_odd = int(np.floor(scale[2] * 0.999999)) % 2

    # Blender's checker: colour 1 where (x parity == y parity) == z parity.
    tile = np.zeros((2, 2, 4))
    for y in range(2):
        for x in range(2):
            tile[y, x, :3] = c1 if (x % 2 == y % 2) == bool(top_odd) else c2
    tile[..., 3] = 1
    px = np.repeat(np.repeat(tile, 32, axis=0), 32, axis=1)

    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = new_image('Checkers (baked)', px)
    tex.interpolation = 'Closest'
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])


def replace_base_image(mat, image_node, new_img):
    """Points the image node at new_img and wires it straight into Base Color."""
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    image_node.image = new_img
    mat.node_tree.links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])


def fix_wood(mat):
    hs = find(mat, 'ShaderNodeHueSaturation')
    img_node = hs.inputs['Color'].links[0].from_node
    px = read_linear(img_node.image)
    hsv = rgb_to_hsv(px[..., :3])
    hsv[..., 0] = (hsv[..., 0] + hs.inputs['Hue'].default_value + 0.5) % 1
    hsv[..., 1] = np.clip(hsv[..., 1] * hs.inputs['Saturation'].default_value, 0, 1)
    hsv[..., 2] = hsv[..., 2] * hs.inputs['Value'].default_value
    t = by_id(hs, 'Fac').default_value
    px[..., :3] = px[..., :3] * (1 - t) + hsv_to_rgb(hsv) * t
    replace_base_image(mat, img_node, new_image('Wood (baked)', px))


def fix_checkered_rug(mat):
    mix = find(mat, 'ShaderNodeMix')  # MULTIPLY, factor = checker image, A/B = colours
    fac, a, b = mix_inputs(mix)
    img_node = fac.links[0].from_node
    px = read_linear(img_node.image)
    f = luminance(px[..., :3])[..., None]
    A, B = socket_value(a), socket_value(b)
    px[..., :3] = A * (1 - f + f * B)
    replace_base_image(mat, img_node, new_image('Checkered Rug (baked)', px))


def flat_vertex_color(mat, layer):
    """The single colour every object using mat has in its colour layer."""
    colors = {tuple(round(c, 4) for c in ob.data.color_attributes[layer].data[0].color[:3]) for ob in objects_using(mat.name)}
    assert len(colors) == 1, f'{mat.name}: expected one flat colour, got {colors}'
    return np.array(colors.pop())


def fix_dark_wood(mat):
    # Base Color = Multiply(greyscale(ash wood image), flat brown colour attribute).
    mix = find(mat, 'ShaderNodeMix')
    img_node = find(mat, 'ShaderNodeTexImage')
    px = read_linear(img_node.image)
    tint = flat_vertex_color(mat, find(mat, 'ShaderNodeVertexColor').layer_name)
    px[..., :3] = luminance(px[..., :3])[..., None] * tint
    replace_base_image(mat, img_node, new_image('Dark Wood (baked)', px))
    mat.node_tree.nodes.remove(mix)


def overlay(a, b, fac):
    """Blender's Overlay mix (A = base, B = blend colour)."""
    facm = 1 - fac
    return np.where(a < 0.5, a * (facm + 2 * fac * b), 1 - (facm + 2 * fac * (1 - b)) * (1 - a))


def fix_painting_frames(mat):
    """Base Color = Overlay(ash wood image, the frame's colour attribute, 0.7).
    Each frame's colour is flat, so bake one wood image per distinct colour
    and give each its own copy of the material."""
    mix = find(mat, 'ShaderNodeMix')
    fac = by_id(mix, 'Factor_Float').default_value
    layer = find(mat, 'ShaderNodeVertexColor').layer_name
    img_node = find(mat, 'ShaderNodeTexImage')
    wood = read_linear(img_node.image)

    by_color = {}
    for ob in objects_using(mat.name):
        color = tuple(round(c, 4) for c in ob.data.color_attributes[layer].data[0].color[:3])
        by_color.setdefault(color, []).append(ob)

    # Copy before editing, so every variant starts from the original nodes.
    variants = [mat] + [mat.copy() for _ in range(len(by_color) - 1)]
    for i, (variant, (color, obs)) in enumerate(zip(variants, by_color.items())):
        if i > 0:
            variant.name = f'{mat.name} {i + 1}'
            for ob in obs:
                for slot in ob.material_slots:
                    if slot.material == mat:
                        slot.material = variant
        px = wood.copy()
        px[..., :3] = overlay(px[..., :3], np.array(color), fac)
        replace_base_image(variant, find(variant, 'ShaderNodeTexImage'), new_image(f'{variant.name} (baked)', px))
        variant.node_tree.nodes.remove(find(variant, 'ShaderNodeMix'))


def objects_using(name):
    return [o for o in bpy.data.objects if o.type == 'MESH' and any(s.material and s.material.name == name for s in o.material_slots)]


def is_door_icon(mat):
    return mat.node_tree is not None and any(
        n.bl_idname == 'ShaderNodeGroup' and n.node_tree and n.node_tree.name == 'DoorIconToggle'
        for n in mat.node_tree.nodes)


FIXES = {
    'Checkers': fix_checkers,
    'Checkered Rug': fix_checkered_rug,
    'Plant': lambda mat: fix_glossy_mix(mat, 0.5),
    'Rubber': lambda mat: fix_glossy_mix(mat, 0.4),
    'Wood': fix_wood,
    'Dark Wood (Shiny)': fix_dark_wood,
    'Painting Frame': fix_painting_frames,
}


def bytes_for_float_colors():
    """Most objects store "Color" as a float colour attribute, which the
    exporter writes out white. Swap each for a byte-colour copy."""
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        attrs = ob.data.color_attributes
        color = attrs.get('Color')
        if color is None or color.data_type != 'FLOAT_COLOR':
            continue
        values = [tuple(d.color) for d in color.data]  # linear
        domain = color.domain
        attrs.remove(color)
        new = attrs.new('Color', 'BYTE_COLOR', domain)
        for d, v in zip(new.data, values):
            d.color = v
        attrs.active_color = new


def cap_subdivision():
    for ob in bpy.data.objects:
        for md in ob.modifiers:
            if md.type == 'SUBSURF':
                md.levels = min(md.levels, MAX_SUBSURF_LEVEL)
                md.render_levels = min(md.render_levels, MAX_SUBSURF_LEVEL)


for mat in [m for m in bpy.data.materials if is_door_icon(m)]:
    fix_door_icon(mat)
    print(f'fixed door icon {mat.name}')
for name, fix in FIXES.items():
    mat = bpy.data.materials.get(name)
    if mat is None:
        print(f'skip {name}: not in this file')
        continue
    fix(mat)
    print(f'fixed {name}')
bytes_for_float_colors()
cap_subdivision()
for image in bpy.data.images:
    if image.packed_file is not None and image.size[0] > 0:
        shrink(image)

bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    # Apply modifiers: the walls and frames get their thickness from
    # Solidify and Bevel. Subdivision was capped above to keep this small.
    export_apply=True,
    export_image_format='WEBP',
    export_vertex_color='MATERIAL',  # only where a material reads them,
    export_all_vertex_colors=False,  # and only the one it reads
    export_animations=False,
    export_cameras=False,
    export_lights=False,
)
print('exported', OUTPUT)
