"""Read frozen R5 timeline markers only; never save or export Blender data."""
import bpy, json, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'assets-src/animation-development/pomni-sleep-wake-v1/refinement-r5/Pomni_Hand_Blanket_R5.blend'
digest=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False)
scene=bpy.context.scene
report={'source_sha256':digest,'fps':scene.render.fps,'markers':[{'name':m.name,'frame':m.frame,'clip_time':(m.frame-1)/scene.render.fps} for m in scene.timeline_markers]}
assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
(root/'artifacts/pomni-opening/r5-timing-markers.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
