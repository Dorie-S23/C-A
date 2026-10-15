"""Export "Ribbits-Room.blend" to a GLB the game can show faithfully.

Same idea as export_dorm_hall_v7.py: the glTF exporter only understands a
Principled BSDF fed directly by an image or colour attribute, so materials
built any other way (vertex-coloured "Plastic" mix shaders, wood images
overlaid with a colour attribute, hue-shifted book covers, a procedural
mushroom cap and bowling ball) are rebuilt in memory into export-friendly
equivalents, baking the colour maths into new images where needed. It
also trims the file down for the browser: Subdivision Surface is capped at
level 1, big images are shrunk and objects that never show in a render
(the fog volume, the hidden projector sphere) are left out. The .blend
file itself is never saved or modified.

Run from the repo root:
    blender -b "public/models/character rooms/Ribbits-Room.blend" \
        --python tools/blender/export_ribbits_room.py -- \
        "public/models/character rooms/ribbits-room.glb"
"""
import sys

import bpy
import numpy as np

OUTPUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'ribbits-room.glb'

MAX_SUBSURF_LEVEL = 1    # level 2 everywhere makes the room ~3x heavier for barely visible smoothing
MAX_TEXTURE_SIZE = 1024  # longest side, in pixels

# Never seen in a render, so never exported:
#  - "Volume (Main)": a 12 m cube holding the fog volume shader. glTF has no
#    volumes, so it would come out as a giant opaque box around the room.
#  - "Sphere.001": the "(DO NOT REMOVE) Invisible Orb Projector", hidden from
#    the camera; it only exists to throw star patterns in Cycles/Eevee.
#  - "Plane.092": a rigid-body helper sheet with no material.
SKIP_OBJECTS = {'Volume (Main)', 'Sphere.001', 'Plane.092'}


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


def invert(x, fac):
    """Blender's Invert Color node."""
    return fac * (1 - x) + (1 - fac) * x


def overlay(a, b, fac):
    """Blender's Overlay mix (A = base, B = blend colour)."""
    facm = 1 - fac
    return np.where(a < 0.5, a * (facm + 2 * fac * b), 1 - (facm + 2 * fac * (1 - b)) * (1 - a))


def burn(a, b, fac):
    """Blender's Color Burn mix (A = base, B = blend colour)."""
    tmp = (1 - fac) + fac * b
    safe = np.where(tmp > 0, tmp, 1)
    return np.where(tmp > 0, np.clip(1 - (1 - a) / safe, 0, 1), 0)


def shrink(image):
    """Halves an image until its longest side fits MAX_TEXTURE_SIZE."""
    w, h = image.size
    scale = 1
    while max(w, h) / scale > MAX_TEXTURE_SIZE:
        scale *= 2
    if scale > 1:
        image.scale(w // scale, h // scale)


def read_linear(image):
    """RGBA float array (linear RGB, straight alpha) of a packed image.
    Non-Color images come back as their raw values, as shader nodes see them."""
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


def find(mat, idname, name=None):
    return next(n for n in mat.node_tree.nodes if n.bl_idname == idname and (name is None or n.name == name))


def by_id(node, identifier):
    return next(i for i in node.inputs if i.identifier == identifier)


def socket_value(socket):
    return np.array(socket.default_value[:3], dtype=np.float64)


def image_input(socket):
    """The image node feeding `socket`, through any reroutes."""
    node = socket.links[0].from_node
    while node.bl_idname == 'NodeReroute':
        node = node.inputs[0].links[0].from_node
    return node


def base_image_material(mat, img, roughness=None, alpha=False, alpha_clip=False):
    """Points mat's Principled BSDF Base Color straight at a (new) image node
    showing img; optionally its alpha too. With alpha_clip, the alpha goes
    through a Round node, which the exporter writes as alphaMode MASK."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if roughness is not None:
        bsdf.inputs['Roughness'].default_value = roughness
    if alpha or alpha_clip:
        if alpha_clip:
            rnd = nodes.new('ShaderNodeMath')
            rnd.operation = 'ROUND'
            links.new(tex.outputs['Alpha'], rnd.inputs[0])
            links.new(rnd.outputs['Value'], bsdf.inputs['Alpha'])
        else:
            links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    return bsdf


def objects_using(mat):
    return [o for o in bpy.data.objects
            if o.type == 'MESH' and o.name not in SKIP_OBJECTS and any(s.material == mat for s in o.material_slots)]


def color_on_material(ob, mat, layer):
    """The (flat) colour-attribute value on the faces of `ob` that use mat."""
    attr = ob.data.color_attributes.get(layer) if layer else ob.data.color_attributes.active_color
    slots = [i for i, s in enumerate(ob.material_slots) if s.material == mat]
    for poly in ob.data.polygons:
        if poly.material_index in slots:
            data = attr.data[poly.loop_start] if attr.domain == 'CORNER' else attr.data[poly.vertices[0]]
            return tuple(round(c, 4) for c in data.color[:3])
    return tuple(round(c, 4) for c in attr.data[0].color[:3])


def per_color_variants(mat, layer, bake):
    """For materials whose look depends on a colour attribute that's flat per
    object: bake one image per distinct colour, giving each colour its own
    copy of the material. `bake(variant, color)` rewires one variant."""
    by_color = {}
    for ob in objects_using(mat):
        by_color.setdefault(color_on_material(ob, mat, layer), []).append(ob)
    if not by_color:
        return
    variants = [mat] + [mat.copy() for _ in range(len(by_color) - 1)]
    for i, (variant, (color, obs)) in enumerate(zip(variants, by_color.items())):
        if i > 0:
            variant.name = f'{mat.name} {i + 1}'
            for ob in obs:
                for slot in ob.material_slots:
                    if slot.material == mat:
                        slot.material = variant
        bake(variant, np.array(color))


# --- shader swaps: same look, expressed as a plain Principled BSDF ---

def fix_plastic(mat):
    # Diffuse(vertex colour) mixed with two faint anisotropic glossy layers
    # (0.1% and 0.5%): in effect a matte surface in the object's colours.
    bsdf = principled(mat)
    mat.node_tree.links.new(color_attribute(mat).outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.5


def fix_toybox_lid(mat):
    # The same plastic, with the toybox label laid over the (flat black)
    # colour attribute by the label's alpha.
    img_node = find(mat, 'ShaderNodeTexImage')
    base = np.array(color_on_material(objects_using(mat)[0], mat, 'Color'))
    px = read_linear(img_node.image)
    a = px[..., 3:4]
    px[..., :3] = px[..., :3] * a + base * (1 - a)
    px[..., 3] = 1
    principled(mat)
    base_image_material(mat, new_image('Toybox Lid (baked)', px), roughness=0.5)


def tinted_wood(img_node, invert_fac, tint):
    """Overlay(Invert(greyscale(wood image)), tint) — the room's wood look."""
    px = read_linear(img_node.image)
    grey = invert(luminance(px[..., :3]), invert_fac)[..., None]
    px[..., :3] = overlay(grey, tint, 1.0)
    px[..., 3] = 1
    return px


def fix_overlay_wood(mat):
    """Base Color = Overlay(Invert(BW(wood)), tint). The tint is either the
    object's colour attribute (flat per object, so one bake per colour) or
    a constant colour."""
    mix = find(mat, 'ShaderNodeMix')
    inv = find(mat, 'ShaderNodeInvert')
    img_node = image_input(find(mat, 'ShaderNodeRGBToBW').inputs['Color'])
    b = by_id(mix, 'B_Color')
    fac = inv.inputs['Fac'].default_value

    def bake(variant, tint):
        node = find(variant, 'ShaderNodeTexImage', img_node.name)
        base_image_material(variant, new_image(f'{variant.name} (baked)', tinted_wood(node, fac, tint)))

    if b.is_linked:
        per_color_variants(mat, find(mat, 'ShaderNodeVertexColor').layer_name, bake)
    else:
        bake(mat, socket_value(b))


def fix_light_wood(mat):
    # Mix(wood image, flat colour attribute, 0.4).
    mix = find(mat, 'ShaderNodeMix')
    fac = by_id(mix, 'Factor_Float').default_value
    img_node = find(mat, 'ShaderNodeTexImage')
    tint = np.array(color_on_material(objects_using(mat)[0], mat, 'Color'))
    px = read_linear(img_node.image)
    px[..., :3] = px[..., :3] * (1 - fac) + tint * fac
    base_image_material(mat, new_image('Light Wood 4 (baked)', px))


def fix_textured_cloth(mat):
    # Mix(colour attribute, fabric height image, 9%): the image only adds a
    # faint texture the normal map already shows, and the colour attribute
    # carries the rug/bed patterns — so use the colour attribute directly.
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(find(mat, 'ShaderNodeVertexColor').outputs['Color'], bsdf.inputs['Base Color'])


def fix_mushroom_red(mat):
    # Overlay(height, ConstantRamp(Invert(height, 0.929))): white spots on red.
    mix = find(mat, 'ShaderNodeMix', 'Mix')
    ramp = find(mat, 'ShaderNodeValToRGB')
    inv = find(mat, 'ShaderNodeInvert')
    img_node = image_input(by_id(mix, 'A_Color'))
    px = read_linear(img_node.image)
    height = px[..., 0]
    t = invert(height, inv.inputs['Fac'].default_value)
    elements = sorted(ramp.color_ramp.elements, key=lambda e: e.position)
    colors = np.zeros(height.shape + (3,))
    for e in elements:  # CONSTANT interpolation: the last stop at or below t wins
        colors[t >= e.position] = e.color[:3]
    colors[t < elements[0].position] = elements[0].color[:3]
    px[..., :3] = overlay(height[..., None], colors, 1.0)
    px[..., 3] = 1
    bsdf = base_image_material(mat, new_image('Mushroom Red (baked)', px))
    # The normal came from two normal maps multiplied together; keep the main one.
    links = mat.node_tree.links
    normal_map = find(mat, 'ShaderNodeNormalMap')
    links.new(find(mat, 'ShaderNodeTexImage', 'Image Texture.002').outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])


def fix_flowers(mat):
    # Burn(flower image, red, factor = a constant ramp lookup), with the
    # opacity coming from a separate image: bake both into one RGBA image.
    mix = find(mat, 'ShaderNodeMix')
    ramp = find(mat, 'ShaderNodeValToRGB')
    fac = ramp.color_ramp.evaluate(ramp.inputs['Fac'].default_value)[0]
    color_node = image_input(by_id(mix, 'A_Color'))
    alpha_node = image_input(find(mat, 'ShaderNodeBsdfPrincipled').inputs['Alpha'])
    px = read_linear(color_node.image)
    opacity = read_linear(alpha_node.image)
    px[..., :3] = burn(px[..., :3], socket_value(by_id(mix, 'B_Color')), fac)
    px[..., 3] = luminance(opacity[..., :3])  # Blender feeds its colour (linear) into Alpha
    base_image_material(mat, new_image('Flowers (baked)', px), alpha_clip=True)


def fix_hue_saturation(mat):
    hs = find(mat, 'ShaderNodeHueSaturation')
    img_node = image_input(hs.inputs['Color'])
    px = read_linear(img_node.image)
    hsv = rgb_to_hsv(px[..., :3])
    hsv[..., 0] = (hsv[..., 0] + hs.inputs['Hue'].default_value + 0.5) % 1
    hsv[..., 1] = np.clip(hsv[..., 1] * hs.inputs['Saturation'].default_value, 0, 1)
    hsv[..., 2] = hsv[..., 2] * hs.inputs['Value'].default_value
    t = by_id(hs, 'Fac').default_value
    px[..., :3] = px[..., :3] * (1 - t) + hsv_to_rgb(hsv) * t
    base_image_material(mat, new_image(f'{mat.name} (baked)', px))


def fix_bowling_ball(mat):
    # A procedural Magic texture through a blue ramp: the flat middle blue.
    ramp = find(mat, 'ShaderNodeValToRGB')
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    mat.node_tree.links.remove(bsdf.inputs['Base Color'].links[0])
    bsdf.inputs['Base Color'].default_value = (*ramp.color_ramp.evaluate(0.4)[:3], 1)


def fix_number_blocks(mat):
    # Reads the colour through an Attribute node, which the exporter skips.
    bsdf = find(mat, 'ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(color_attribute(mat).outputs['Color'], bsdf.inputs['Base Color'])


def fix_door_icon(mat):
    # Ribbit's face on the door: alpha thresholded at 0 -> alpha clip.
    img = find(mat, 'ShaderNodeTexImage').image
    shrink(img)
    base_image_material(mat, img, alpha_clip=True)


def fix_star_projector(mat):
    # A dark orb whose stars are cut out by the projection image's brightness.
    img_node = find(mat, 'ShaderNodeTexImage')
    px = read_linear(img_node.image)
    alpha = luminance(px[..., :3])  # Blender feeds the colour (linear) into Alpha
    px[..., :3] = 0
    px[..., 3] = alpha
    base_image_material(mat, new_image('Star Projector (baked)', px), alpha_clip=True)


def fix_inverted_image(mat):
    # Caine's swear bar: an Invert node in front of Base Color.
    img_node = find(mat, 'ShaderNodeTexImage')
    px = read_linear(img_node.image)
    px[..., :3] = 1 - px[..., :3]
    base_image_material(mat, new_image(f'{mat.name} (baked)', px), alpha=True)


FIXES = {
    'Plastic': fix_plastic,
    'Toybox Lid': fix_toybox_lid,
    'Wood': fix_overlay_wood,
    'Tree Bark': fix_overlay_wood,
    'Inner Wood Log': fix_overlay_wood,
    'Light Wood 4': fix_light_wood,
    'Textured Cloth': fix_textured_cloth,
    'Mushroom Red': fix_mushroom_red,
    'FlowerSet001_1K-JPG_Color': fix_flowers,
    'Door Texture': fix_hue_saturation,
    'Bowling Ball': fix_bowling_ball,
    'Number Blocks': fix_number_blocks,
    'Ribbit': fix_door_icon,
    'Star Projector 2': fix_star_projector,
    'caine_swear_bar_transparent': fix_inverted_image,
}


def bytes_for_float_colors():
    """Some objects store "Color" as a float colour attribute, which the
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


for name, fix in FIXES.items():
    mat = bpy.data.materials.get(name)
    if mat is None:
        print(f'skip {name}: not in this file')
        continue
    fix(mat)
    print(f'fixed {name}')
for mat in [m for m in bpy.data.materials if m.name.startswith('Book-') and m.node_tree
            and any(n.bl_idname == 'ShaderNodeHueSaturation' for n in m.node_tree.nodes)]:
    fix_hue_saturation(mat)
    print(f'fixed {mat.name}')
bytes_for_float_colors()
cap_subdivision()
for image in bpy.data.images:
    if image.packed_file is not None and image.size[0] > 0:
        shrink(image)

# Export only what renders: select every visible-to-camera object but the skipped ones.
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.context.view_layer.objects:
    if ob.type == 'MESH' and ob.name not in SKIP_OBJECTS and ob.visible_camera and not ob.hide_render:
        ob.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    use_selection=True,
    # Apply modifiers: Solidify, Bevel, Mirror and the geometry-node props
    # only exist once applied. Subdivision was capped above to keep this small.
    export_apply=True,
    export_image_format='WEBP',
    export_vertex_color='MATERIAL',  # only where a material reads them,
    export_all_vertex_colors=False,  # and only the one it reads
    export_animations=False,
    export_cameras=False,
    export_lights=False,             # the room's lights are recreated in code (rooms/ribbitRoom.js)
)
print('exported', OUTPUT)
