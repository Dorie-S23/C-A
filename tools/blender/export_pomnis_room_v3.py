"""Export "Pomnis Room V3.blend" to a GLB the game can show faithfully.

The glTF exporter only understands a Principled BSDF fed directly by an
image or colour attribute. Several of this room's materials are built
differently, so their look was lost on export (white or black surfaces,
missing patterns). This script rebuilds just those materials into
export-friendly equivalents in memory, then exports. The .blend file itself
is never saved or modified.

Run from the repo root:
    blender -b "assets-src/Pomnis Room V3.blend" \
        --python tools/blender/export_pomnis_room_v3.py -- \
        "public/models/character rooms/pomnis-room-v3.glb"
"""
import math
import sys

import bpy
import numpy as np

OUTPUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'pomnis-room-v3.glb'


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
    h = np.zeros_like(mx)
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


def read_linear(image):
    """RGBA float array (linear RGB, straight alpha) of a packed image."""
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

def principled(mat):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out = next(n for n in nodes if n.bl_idname == 'ShaderNodeOutputMaterial' and n.is_active_output)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return bsdf


def color_attribute(mat, name='Color'):
    node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    node.layer_name = name
    return node


def find(mat, idname):
    return next(n for n in mat.node_tree.nodes if n.bl_idname == idname)


def mix_inputs(mix):
    get = lambda ident: next(i for i in mix.inputs if i.identifier == ident)
    return get('Factor_Float'), get('A_Color'), get('B_Color')


def by_id(node, identifier):
    return next(i for i in node.inputs if i.identifier == identifier)


def socket_value(socket):
    return np.array(socket.default_value[:3], dtype=np.float64)


# --- shader swaps: same look, expressed as a plain Principled BSDF ---

def fix_plastic(mat):
    # A mix of Diffuse(vertex colour) with two anisotropic layers at 0.1% and
    # 0.5% — in effect a matte surface in the object's vertex colours.
    bsdf = principled(mat)
    mat.node_tree.links.new(color_attribute(mat).outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.5


def fix_gems(mat):
    # Glass BSDF tinted by vertex colour. glTF transmission would cost the
    # game an extra scene render every frame, so use see-through gloss.
    bsdf = principled(mat)
    mat.node_tree.links.new(color_attribute(mat).outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.16
    bsdf.inputs['Alpha'].default_value = 0.65
    mat.surface_render_method = 'BLENDED'


def fix_mirror(mat):
    # Glass with an IOR of 152 reflects almost everything: a mirror.
    bsdf = principled(mat)
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.02


def fix_balloon(mat):
    # Mix(Transparent, Principled) at 0.7 = the Principled at 70% opacity.
    mix = find(mat, 'ShaderNodeMixShader')
    bsdf = next(l.from_node for l in mix.inputs[2].links)
    fac = by_id(mix, 'Fac').default_value
    out = next(n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeOutputMaterial' and n.is_active_output)
    mat.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Alpha'].default_value = fac
    mat.surface_render_method = 'BLENDED'


# --- colour adjustments baked into the image itself (keeps its tiling) ---

def replace_base_image(mat, image_node, new_img):
    """Points the image node at new_img and wires it straight into Base Color."""
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    image_node.image = new_img
    mat.node_tree.links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])


def fix_walnut(mat):
    mix = find(mat, 'ShaderNodeMix')  # MIX, factor 0.5, A = image, B = dark brown
    fac, a, b = mix_inputs(mix)
    img_node = a.links[0].from_node
    px = read_linear(img_node.image)
    t = fac.default_value
    px[..., :3] = px[..., :3] * (1 - t) + socket_value(b) * t
    replace_base_image(mat, img_node, new_image('Walnut Wood (baked)', px))


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
    f = (px[..., :3] @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    A, B = socket_value(a), socket_value(b)
    px[..., :3] = A * (1 - f + f * B)
    replace_base_image(mat, img_node, new_image('Checkered Rug (baked)', px))


def fix_soft_fabric(mat, objects):
    mix = find(mat, 'ShaderNodeMix')  # DARKEN, factor 0.81, A = vertex colour, B = carpet image
    fac, a, b = mix_inputs(mix)
    img_node = b.links[0].from_node
    # The one object using it is a single flat colour.
    attr = objects[0].data.color_attributes['Color']
    vcol = np.array(attr.data[0].color[:3], dtype=np.float64)  # linear
    px = read_linear(img_node.image)
    t = fac.default_value
    px[..., :3] = vcol * (1 - t) + np.minimum(vcol, px[..., :3]) * t
    replace_base_image(mat, img_node, new_image('Soft Fabric (baked)', px))


def fix_dice(mat):
    mix = find(mat, 'ShaderNodeMix')  # MIX, factor = image alpha, A = vertex colour (white), B = image
    fac, a, b = mix_inputs(mix)
    img_node = b.links[0].from_node
    px = read_linear(img_node.image)
    alpha = px[..., 3:4]
    px[..., :3] = 1.0 * (1 - alpha) + px[..., :3] * alpha
    px[..., 3] = 1.0
    replace_base_image(mat, img_node, new_image('Dice (baked)', px))


def fix_silk(mat):
    # Wave texture (bands along U, sine profile) through a hard colour ramp:
    # blue/red stripes. Draw exactly one period and tile it with the mapping.
    wave = find(mat, 'ShaderNodeTexWave')
    ramp = find(mat, 'ShaderNodeValToRGB').color_ramp
    scale = wave.inputs['Scale'].default_value
    period = 2 * math.pi / (20 * scale)  # in U, from Blender's bands formula
    width = 256
    u = (np.arange(width) + 0.5) / width * period
    value = 0.5 + 0.5 * np.sin(u * scale * 20 - math.pi / 2)
    colors = np.array([ramp.evaluate(float(v))[:] for v in value])
    px = np.repeat(colors[None, :, :], 4, axis=0)
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    uv = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1 / period, 1, 1)
    img_node = nodes.new('ShaderNodeTexImage')
    img_node.image = new_image('Silk Sheets (baked)', px)
    links.new(uv.outputs['UV'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], img_node.inputs['Vector'])
    links.new(img_node.outputs['Color'], bsdf.inputs['Base Color'])


def objects_using(name):
    return [o for o in bpy.data.objects if o.type == 'MESH' and any(s.material and s.material.name == name for s in o.material_slots)]


FIXES = {
    'Plastic': fix_plastic,
    'Gems': fix_gems,
    'Mirror Glass': fix_mirror,
    'Balloon': fix_balloon,
    'Walnut Wood': fix_walnut,
    'Wood': fix_wood,
    'Checkered Rug': fix_checkered_rug,
    'Soft Fabric': lambda mat: fix_soft_fabric(mat, objects_using('Soft Fabric')),
    'Dice': fix_dice,
    'Silk Sheets': fix_silk,
}



def bytes_for_float_colors():
    """Pomni's hat and shoes store "Color" as a float colour attribute (next
    to unused "Rough"/"Metal" ones); the exporter writes those out white.
    Swap each for a byte-colour copy of the same colours, and drop the
    colour attributes no material reads."""
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        attrs = ob.data.color_attributes
        color = attrs.get('Color')
        if color is None or color.data_type != 'FLOAT_COLOR':
            continue
        values = [tuple(d.color) for d in color.data]  # linear
        domain = color.domain
        for name in [a.name for a in attrs]:
            attrs.remove(attrs[name])
        new = attrs.new('Color', 'BYTE_COLOR', domain)
        for d, v in zip(new.data, values):
            d.color = v
        attrs.active_color = new
        attrs.render_color_index = 0
        print(f'byte colours for {ob.name}')


# Two flat gold discs that cut horizontally through the standing mirror. In
# Blender the solid mirror glass hides them, but in game the glass becomes a
# live reflection and they show as an orange bar across it.
HIDDEN_INSIDE_MIRROR = ['Circle', 'Vert.002']
for name in HIDDEN_INSIDE_MIRROR:
    ob = bpy.data.objects.get(name)
    if ob is not None:
        bpy.data.objects.remove(ob)
        print(f'removed {name}')

for name, fix in FIXES.items():
    mat = bpy.data.materials.get(name)
    if mat is None:
        print(f'skip {name}: not in this file')
        continue
    fix(mat)
    print(f'fixed {name}')
bytes_for_float_colors()

bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    # Leave modifiers unapplied, like the room's earlier exports: applying
    # its 182 Subdivision Surface modifiers makes it ~3.5x heavier for
    # smoothing that's barely visible in game.
    export_apply=False,
    export_vertex_color='MATERIAL',  # only where a material reads them,
    export_all_vertex_colors=False,  # and only the one it reads
    export_cameras=False,
    export_lights=False,
)
print('exported', OUTPUT)
