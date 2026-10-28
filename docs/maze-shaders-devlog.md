# Level 3: original GLSL shader devlog

## Animated patrol warning

Source: `src/shaders/patrolWarning.js` (vertex and fragment GLSL plus its
`THREE.ShaderMaterial` factory).

We preserved the checkerboard and placed four 32 cm decorative strips beside
the existing hazard path. The vertex shader passes UVs through the usual
model-view-projection transform. In the fragment shader, a scrolling fractional
phase combines UV.y, world-length scaling, `uTime`, and the absolute distance
from the strip centre to construct repeating chevrons. Smooth thresholds and
screen-space derivatives soften their edges. Low alpha, fading ends and a thin
border keep the floor readable. The colour mixes amber and violet slowly rather
than flashing. The pattern moves about 0.58 metres per second.

## Jax's digital cracks

Source: `src/shaders/jaxDigitalCracks.js` (original vertex and fragment GLSL
plus its `THREE.ShaderMaterial` factory).

Four separate overlays cover the decorative mirror panels and narrow curtain
edges behind Jax. The fragment shader compares the nearest two procedural
cell sites in a 3 x 3 neighbourhood. Their distance difference traces an
angular fracture network. Quantized rows interrupt the seams, while a slow
travelling band and breathing phase modulate violet/magenta intensity.

The vertex shader adds a small normal ripple and vertical drift, faded at the
UV edges. Maximum displacement is below 12 mm and only affects these visual
overlays: Jax's model, walls, collision boxes and interaction trigger remain
unchanged. A `uNear` uniform increases intensity slightly between 14 m and 3 m
from Jax, using smoothstep distance falloff and exponential temporal smoothing.

## Integration and ownership

`src/rooms/mazeShaders.js` creates two merged overlay meshes: two extra draw
calls and 3,080 triangles when both effects are visible. Both materials are
real custom `ShaderMaterial` instances, use no texture samplers, and cast no
shadows. Transparent blending with depth writes disabled preserves the scene
beneath them. Three's output colour-space chunks match the existing renderer.

`src/rooms/mazeRoom.js` calls `shaderEffects.update(deltaSeconds, playerPosition)`
from its existing room update. The game's pause guard stops that update, so
there is no wall-clock catch-up on resume. Time and proximity start fresh on
room re-entry. The existing room teardown releases both geometries and both
materials; the controller also provides an idempotent standalone dispose.
No dependencies, lights, renderer settings, objectives, timers, placements,
collision rules or enemy behaviour are changed by the effects.

## Review and checks

Open `http://127.0.0.1:5174/maze-review.html?mazeSeed=123` and choose **Animated
patrol warning** or **Jax chamber**. The review tour uses camera distance as the
proximity input; the playable game uses Pomni's position.

`node --test _verify_maze_shaders.mjs` checks time/proximity behaviour, overlay
budgets, disposal and fresh state. `node tools/verify_maze_shaders_browser.mjs`
checks actual WebGL compilation, visible pixels and animation, pause/resume,
proximity, multiple seeds, room re-entry and rendering cost. It generates
matched before/after PNGs at a 1.7 m review-camera height. Original pre-shader
captures are retained separately under `artifacts/maze-step5/before/`.


### Re-entry shadow-cache finding

The WebGL re-entry test exposed an existing r169 shared shadow-material
uniform retaining a disposed Jax texture, then uploading its closed bitmap
again on the next visit. `src/rooms/mazeShadowDepth.js` gives the maze's opaque
Jax shadow pass a visit-owned MeshDepthMaterial. Normal mesh teardown disposes
it once. This is the built-in depth pass, not another custom GLSL effect; Jax's
visible materials, mesh, placement and light setup stay unchanged.


### Initial Step 5 validation

- All 63 suite tests and the production build pass (the existing bundle-size
  warning remains).
- Real WebGL compilation/linking, pixel rendering and animation pass in Edge
  on seeds 123, 0 and 42, with no shader/runtime errors.
- The real pointer-lock pause handler freezes both shader clocks and proximity;
  resume advances from that time without wall-clock catch-up.
- Three consecutive re-entries release all four shader resources, reset their
  uniforms and keep GPU counts at 65 geometries / 17 textures in this test.
- Both overlays together add exactly two draw calls and 3,080 triangles, with
  no added textures or lights. Twelve interleaved samples per configuration
  measured a 5.1 ms median both off and on under software SwiftShader. These
  are a local comparison, not a hardware frame-rate prediction.
- Six seeded gameplay snapshots still exactly match the Step 2 baseline.


### Patrol visibility refinement

The original 22 cm, 48%-alpha warning was too faint at normal camera height.
The refined strip is 32 cm wide, with a restrained plum backing (24% alpha),
90%-alpha broad gold chevrons and a violet edge. Its unwrapped UV phase has
more stable derivative anti-aliasing. The pattern now moves at about 0.58 m/s,
roughly 3.4 times the original speed, without flashing or HDR/bloom changes.

`src/rooms/mazeLoopMarkings.js` separately adds static pale-sage stitches around
each future loop. There are no arrowheads, warning colours, timers or animated
uniforms on those inlays. They are one merged mesh/material (576 triangles for
three loops), disposed by ordinary room teardown. The active warning remains
confined to the existing red hazard route. Jax's shader, lighting and layout
sources were hash-checked unchanged; all six seeded gameplay snapshots match.

`node tools/review_patrol_refinement_browser.mjs --stage=after` captures the
actual first-person 1.7 m camera, normal third-person camera and all three
future loops. Its short WebM records explicit native WebGL frames using the
same four-second game-update sequence as the before recording. Review the
videos and screenshots at
`http://127.0.0.1:5174/artifacts/patrol-refinement/review.html`.


Refinement validation: all 64 suite tests, real-model pickup/corridor checks,
the production build and real WebGL checks on seeds 123, 0 and 42 pass. Pause,
proximity and three consecutive re-entries pass with stable counts of 66 GPU
geometries and 17 textures (one extra geometry for the neutral inlays). The
comparison page was tested in Edge: both clips decode at 880 x 624 and are
normalized to four-second synchronized loops. First-person screenshots use the
actual 1.7 m gameplay camera; the third-person screenshot includes Pomni.
