"""Export "Kaufmos Room V4.blend" to a GLB the game can show faithfully.

Same problem as Pomni's room (see export_pomnis_room_v3.py): the glTF
exporter only understands a Principled BSDF fed directly by an image or a
colour attribute, and several of this room's materials mix the two, or
build colour procedurally, in ways the exporter can't follow. This script
rebuilds just those materials into export-friendly equivalents in memory,
then exports. The .blend file itself is never saved or modified.

Run from the repo root:
    blender -b "assets-src/Kaufmos Room V4.blend" \
        --python tools/blender/export_kaufmos_room.py -- \
        "public/models/character rooms/kaufmos-room.glb"
"""
import sys

import bpy
import numpy as np

OUTPUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'kaufmos-room.glb'


# --- colour helpers (shader nodes work in linear; image pixels are sRGB) ---

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


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


def replace_base_image(mat, image_node, new_img):
    """Points the image node at new_img and wires it straight into Base Color."""
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    image_node.image = new_img
    mat.node_tree.links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])


def objects_using(name):
    return [o for o in bpy.data.objects if o.type == 'MESH' and any(s.material and s.material.name == name for s in o.material_slots)]


def representative_vertex_color(material_name):
    """A single colour standing in for a material's vertex-painted tint.
    Several objects can share one material with different paint, so (like
    Pomni's room before it) this keeps only the first object's colour —
    good enough for "looks right", not a per-object-accurate bake. The
    active colour attribute's name varies per object ("Color", "Attribute",
    ...), so read whichever one is actually active rather than assuming "Color".
    """
    obs = objects_using(material_name)
    mesh = next(o.data for o in obs if len(o.data.color_attributes) > 0)
    attr = mesh.color_attributes.active_color or mesh.color_attributes[0]
    return np.array(attr.data[0].color[:3], dtype=np.float64)  # linear


# --- shader swaps: same look, expressed as a plain Principled BSDF ---

def fix_plastic(mat):
    # A mix of Diffuse(vertex colour) with one or two anisotropic layers at
    # a sliver of strength — in effect a matte surface in the object's
    # vertex colours. Same pattern Pomni's room uses for its own "Plastic".
    bsdf = principled(mat)
    mat.node_tree.links.new(color_attribute(mat).outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.5


def fix_wood(mat):
    # Image -> Hue/Saturation/Value -> Base Color: bake the adjustment into
    # the image itself (identical shape to Pomni's "Wood", reused for
    # "Light Wood" here too).
    hs = find(mat, 'ShaderNodeHueSaturation')
    img_node = hs.inputs['Color'].links[0].from_node
    px = read_linear(img_node.image)
    hsv_adjust(px, hs)
    replace_base_image(mat, img_node, new_image(f'{mat.name} (baked)', px))


def hsv_adjust(px, hs):
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

    hsv = rgb_to_hsv(px[..., :3])
    hsv[..., 0] = (hsv[..., 0] + hs.inputs['Hue'].default_value + 0.5) % 1
    hsv[..., 1] = np.clip(hsv[..., 1] * hs.inputs['Saturation'].default_value, 0, 1)
    hsv[..., 2] = hsv[..., 2] * hs.inputs['Value'].default_value
    t = hs.inputs['Fac'].default_value
    px[..., :3] = px[..., :3] * (1 - t) + hsv_to_rgb(hsv) * t


def fix_soft_fabric(mat):
    # DARKEN(A = vertex colour, B = carpet image). Same shape as Pomni's.
    mix = find(mat, 'ShaderNodeMix')
    fac, a, b = mix_inputs(mix)
    img_node = b.links[0].from_node
    vcol = representative_vertex_color('Soft Fabric')
    px = read_linear(img_node.image)
    t = fac.default_value
    px[..., :3] = vcol * (1 - t) + np.minimum(vcol, px[..., :3]) * t
    replace_base_image(mat, img_node, new_image('Soft Fabric (baked)', px))


def fix_dice(mat):
    # MIX(factor = image alpha, A = vertex colour, B = image) — generalised
    # from Pomni's version, which assumed A was white; here it's read for real.
    mix = find(mat, 'ShaderNodeMix')
    fac, a, b = mix_inputs(mix)
    img_node = b.links[0].from_node
    vcol = representative_vertex_color('Dice')
    px = read_linear(img_node.image)
    alpha = px[..., 3:4]
    px[..., :3] = vcol * (1 - alpha) + px[..., :3] * alpha
    px[..., 3] = 1.0
    replace_base_image(mat, img_node, new_image('Dice (baked)', px))


def fix_dark_wood_shiny(mat):
    # MIX(A = wood image, B = vertex colour).
    mix = find(mat, 'ShaderNodeMix')
    fac, a, b = mix_inputs(mix)
    img_node = a.links[0].from_node
    vcol = representative_vertex_color('Dark Wood (Shiny)')
    px = read_linear(img_node.image)
    t = fac.default_value
    px[..., :3] = px[..., :3] * (1 - t) + vcol * t
    replace_base_image(mat, img_node, new_image('Dark Wood Shiny (baked)', px))


def fix_painting_frame(mat):
    # OVERLAY(A = ash-wood image, B = vertex colour) — the 12 photo frames.
    mix = find(mat, 'ShaderNodeMix')
    fac, a, b = mix_inputs(mix)
    img_node = a.links[0].from_node
    vcol = representative_vertex_color('Painting Frame')
    px = read_linear(img_node.image)
    A = px[..., :3]
    B = np.broadcast_to(vcol, A.shape)
    overlay = np.where(A < 0.5, 2 * A * B, 1 - 2 * (1 - A) * (1 - B))
    t = fac.default_value
    px[..., :3] = A * (1 - t) + overlay * t
    replace_base_image(mat, img_node, new_image('Painting Frame (baked)', px))


def fix_wood_planks(mat):
    # ADD(A = vertex colour, B = plank image) feeding Base Color; the
    # Normal Map / Roughness image links are already exporter-friendly and
    # are left untouched.
    mix = find(mat, 'ShaderNodeMix')
    fac, a, b = mix_inputs(mix)
    img_node = b.links[0].from_node
    vcol = representative_vertex_color('Wood Planks')
    px = read_linear(img_node.image)
    t = fac.default_value
    px[..., :3] = vcol + px[..., :3] * t
    replace_base_image(mat, img_node, new_image('Wood Planks (baked)', px))


def fix_rubber(mat):
    # A generic Geometry "Color" Attribute node reads the same vertex
    # colours a Color Attribute node would, but the exporter only follows
    # the latter — swap it for one that resolves to the same values.
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(color_attribute(mat).outputs['Color'], bsdf.inputs['Base Color'])


def fix_kaufmo_icon(mat):
    # Image.Alpha -> Math(GREATER_THAN) -> Alpha is a cutout the exporter
    # can't follow; wire the image's alpha straight through and tell the
    # material to cut out at that alpha instead (glTF alphaMode: MASK).
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    img_node = find(mat, 'ShaderNodeTexImage')
    mat.node_tree.links.new(img_node.outputs['Alpha'], bsdf.inputs['Alpha'])
    mat.blend_method = 'CLIP'
    mat.alpha_threshold = 0.5


def fix_bowling_ball(mat):
    # Procedural 3D Magic Texture -> ColorRamp. Faithfully baking a solid's
    # internal 3D procedural texture needs a real UV unwrap + bake pass;
    # flattening to the ramp's middle stop keeps the ball a plausible solid
    # colour instead of exporting whatever default grey Base Color is left
    # with no image or vertex colour feeding it.
    ramp = find(mat, 'ShaderNodeValToRGB').color_ramp
    bsdf = principled(mat)
    bsdf.inputs['Base Color'].default_value = ramp.evaluate(0.5)


def fix_kaufmo_walls(mat, image_name):
    # The group behind this material layers a diamond-pattern image with a
    # height-based vertex-colour blend and (for the "w/ Drawings" variant)
    # up to three alpha-masked hung-drawing images. Faithfully reproducing
    # that needs a UV-dependent texture bake; wiring the base diamond
    # pattern straight into Base Color drops the tinting/drawings but keeps
    # the wall a real tiled pattern instead of a flat/broken colour.
    bsdf = principled(mat)
    img_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    img_node.image = bpy.data.images[image_name]
    mat.node_tree.links.new(img_node.outputs['Color'], bsdf.inputs['Base Color'])


FIXES = {
    'Plastic': fix_plastic,
    'Plant': fix_plastic,  # same Diffuse+Anisotropic matte-vertex-colour shape
    'Wood': fix_wood,
    'Light Wood': fix_wood,
    'Soft Fabric': fix_soft_fabric,
    'Dice': fix_dice,
    'Dark Wood (Shiny)': fix_dark_wood_shiny,
    'Painting Frame': fix_painting_frame,
    'Wood Planks': fix_wood_planks,
    'Rubber': fix_rubber,
    'Kaufmo': fix_kaufmo_icon,
    'Bowling Ball': fix_bowling_ball,
    'Kaufmo Walls': lambda mat: fix_kaufmo_walls(mat, 'Diamond Wall.png.001'),
    'Kaufmo Walls - Drawings': lambda mat: fix_kaufmo_walls(mat, 'Diamond Wall.png.001'),
}


for name, fix in FIXES.items():
    mat = bpy.data.materials.get(name)
    if mat is None:
        print(f'skip {name}: not in this file')
        continue
    fix(mat)
    print(f'fixed {name}')

bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    export_apply=False,
    export_vertex_color='MATERIAL',
    export_all_vertex_colors=False,
    export_cameras=False,
    export_lights=False,
)
print('exported', OUTPUT)
