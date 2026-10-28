# Playable Level 3 visual polish

## Reference and diagnosis

All comparisons use mazeSeed 123 and the real game camera. The closest scene
to the user's description is the Golden Turn / first-loop entrance: Pomni at
(-5.4, 1.7, -3.78), grey floor stitching, red-and-gold panels and an original
collision wall end close to the right of the camera. The attachment was not
available, so views of the other two loops are included as alternatives.

The empty upper field came from 3 m walls with almost no overhead geometry
against the dark scene background. The broad hemisphere fill and near-flat
wall appliques also reduced depth. The original collision wall end cannot be
removed without violating the preserved layout; its footprint stays intact.

## Environment changes

- `src/rooms/mazeOverhead.js`: an 8 m eave / 17 m crown circus canopy with slim
  radial ribs, a distant velvet drum, suspended arched ribs and bunting, three
  deliberate sculptural loop landmarks and a chamber-sized Jax crown. Playable
  in-bounds overhead vertices stay above 4.6 m. The inside-facing canopy keeps
  the top-down inspection useful. No lights or colliders live in this module.
- `src/rooms/mazeEnvironment.js`: real bevelled arch mouldings, recessed textile
  bays, layered cornices/wainscot, curved silvered panels and pleated fabric.
  The entrance proscenium excludes wall relief that would overlap its painting.
  Warm/cool/purple textile bands follow maze depth. Toy chests have curved lids.
  Repeated primitives are spatially instanced in 18 m chunks so distant details
  can be frustum-culled instead of rendering the whole maze's ornament at once.
- `src/rooms/mazeLighting.js`: reduced broad fill, a directional theatrical key,
  grazing intersection spotlights and a focused shadow-casting patrol wash.
  Jax keeps the violet/rose treatment. At most ten direct lights and two 512px
  shadow maps; no renderer, exposure, tone mapping or other-room changes.
- `src/rooms/mazeRoom.js`: finer checker tiles with subtle seams, local
  architecture attachment, unchanged gameplay return contract.
- `src/rooms/mazeShaders.js` / `src/shaders/patrolWarning.js`: 42 cm floor bands,
  stronger contrast and eye-level repeats on closed walls of the existing active
  route, sharing the same original animated GLSL. No warnings on inactive loops.
  Jax's custom GLSL and its model/placement are preserved.

## Safety and performance

The original maze generator, final graph, Box3 colliders, spawn, pickups, Jax,
exit, hazard waypoints/radius/speed, objectives and room transitions are unchanged.
Six pre-scenery seeded snapshots still match exactly. Normal camera mechanics
are untouched. All nine capture poses match the original collider/ray solution;
the three recorded reference-loop camera positions also match directly.

Distant beads and rib cross-sections use low tessellation; overheads are merged
by material with fewer than 18 batches and 40,000 triangles. The general scene
retains its original instancing approach, with added spatial culling. Scenery
uses small room-owned canvas textures and no HDR images, live reflections,
postprocessing or new dependencies. Existing teardown disposes meshes,
materials, textures and shadow targets.

## Review

Run the isolated worktree's Vite server on port 5174. Open:

- `http://127.0.0.1:5174/artifacts/maze-polish/review.html` for actual matched
  before/after game-camera captures, including the reference corridor, both
  alternative loops, entrance, patrol and Jax.
- `http://127.0.0.1:5174/?dev=1&mazeSeed=123`, then **Maze (raw, no intro)**,
  for the playable room.

`node tools/review_maze_polish_browser.mjs --stage=after` reproduces the nine
fixed gameplay-camera captures. Original before images remain in the artifact
folder. `npm test`, `node tools/verify_maze_findables.mjs`, the WebGL shader
browser check and the production build verify the work. Nothing is committed
or pushed; the original workspace and stashes are preserved.

## Final validation

- `npm test`: 66 tests passed, plus dialogue and collision script checks.
- Real-model findable checks: 32 seeds; scenery, clearance, lighting and cleanup checks: seven fixed seeds.
- Six seeded gameplay snapshots and nine original camera-solver poses match exactly.
- Edge WebGL: seeds 123, 0 and 42 compile/link and render without errors; both shaders visibly animate; pause/resume and proximity checks pass. Three re-entries remain stable at 88 geometries / 19 textures.
- Shader pair: two additional draw calls / 3,084 triangles. Software-rendered overview median: 27.7 ms disabled / 32.3 ms enabled (12 interleaved samples per condition). This is not a lab-hardware FPS guarantee.
- Production build passes (144 modules); Vite retains its large-bundle advisory.
- Original workspace remains on `workspace/mpho` with its existing cutscene edit and all three stashes. No commits or pushes.

## Floor-marking refinement

The grey floor dashes came from `src/rooms/mazeLoopMarkings.js`, not the custom warning shader. They are replaced by sparse lilac eight-lobed rosettes with muted gold diamond centres, alternating off-centre along actual open loop edges. No direction, motion or danger semantics are attached. One merged mesh/material, vertex colours, no textures/lights/colliders. Real-seed tests check edge openness and the entire motif footprint against wall colliders.

The active custom GLSL warning remains unchanged: animated amber V-shaped bands with violet borders on the existing red hazard route, plus wall repeats. Seed-123 actual gameplay-camera captures of both types and all three future loops are at `artifacts/maze-polish/floor-markings.html`.

Broader checking exposed a prior rare-seed backdrop failure when Jax occupies a four-way cell. The decorative backdrop now uses the nearest closed chamber wall in that case; Jax and gameplay remain unchanged. Seed 187 covers that case.
