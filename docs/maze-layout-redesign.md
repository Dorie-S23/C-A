# Level 3 layout review (Step 2)

This branch changes the maze layout only. The 13 x 13 footprint, 4.5 m cell
size, spawn (-27, 0, -27), wall dimensions, lighting, pickup interactions,
exit rules and existing hazard mechanics remain in place.

`src/maze/generateMaze.js` retains its public contract. The room requests its
seeded spanning-tree layout, then `src/maze/mazeEnvironmentLayout.js` shapes
that graph before the room builds any wall, collider, trigger or collectible.

The layout pass opens a 2 x 2 entrance vestibule and chooses a remote 2 x 2
Jax chamber (9 x 9 m footprint). Jax's existing model and trigger are built
from the updated destination and adjacent approach anchors. Up to six dead-end
search pockets are reserved, with the first two holding the existing bowling
ball and mug. Up to three spaced 3 x 3 perimeter circuits provide connected
routes for future patrols; this change adds no enemies or AI.

A circuit is rejected if it reduces Jax's shortest approach below 70% of the
chosen chamber's initial distance, with a minimum of 18 cell passages. The
original entrance-to-exit path is kept, including its middle three cells used
by the working hazard. No passage on that route is closed. Visual walls and
box colliders are generated together from the final graph.

## Review locally

Use the isolated worktree's Vite server (currently port 5174):
`http://127.0.0.1:5174/?dev=1&mazeSeed=123`, then choose **Maze (raw, no intro)**.
Port 5173, if running, is the original workspace rather than this redesign.

Run `node tools/preview_maze_layout.mjs 123` from this worktree to regenerate
`artifacts/maze-layout/seed-123.svg`. The SVG includes entrance, future patrol
circuits, the existing hazard route, search pockets, both pickups, Jax and exit.
Change the final argument to review another seed. No browser or asset download
is required to create the map.

## Validation

- `npm test`: dialogue, collision, story progression, scoring, saves and maze
  tests, including final-layout invariants and repeatability across 102 seeds.
- `node tools/verify_maze_findables.mjs`: real Jax model and item interactions,
  plus seven fixed seeds (0, 1, 2, 42, 123, 12345, 4294967295) checked for swept
  player clearance through every open passage and exact wall/collider equality.
- `node node_modules/vite/bin/vite.js build`: production build.

Architecture, themed props, lighting changes, the decorative lobby arch,
Gloink AI and shaders are intentionally left for later steps.


## Step 3: circus scenery

`src/rooms/mazeEnvironment.js` adds static, room-owned scenery after Step 2
walls/colliders are built. It reads the final graph without mutating cells or
consuming the seeded RNG. Decorations are attached to closed walls or hang
above walking height. Both collectible meshes stay at their Step 2 coordinates.

The entrance has a bulb-lined arch, gathered curtain strips, striped columns
and a small painted lobby canvas. Walls use red/yellow/cream panels and gold
trim, with decorative silvered mirrors and star emblems. Three overhead
landmarks distinguish the loop intersections. Search pockets are dressed with
toy chests, blocks, shelves and curtain recesses. The distant chamber uses
purple/magenta panels, a flat stage carpet and broken-mirror scenery around
Jax's unchanged actor and trigger.

There are no extra lights, render targets, external assets or custom shaders.
The 512 x 128 label canvases share eight materials; the lobby canvas is only
512 x 256. Repeated primitives use instancing: seed 123 contains 6,783 scenery
instances in 44 batches. MeshStandardMaterial emissive colour keeps surfaces
readable under the unchanged lighting; bulbs use MeshBasicMaterial. Mirrors
are decorative panels rather than live reflections.

`node tools/review_maze_environment_browser.mjs` captures entrance, corridor,
both collectible alcoves and Jax in headless Edge at seed 123. It instruments
review cameras in the browser response only; the production game gets no
teleport or camera controls. Run the Vite worktree server on port 5174 first.
The actual screenshots are in `artifacts/maze-step3/`; open
`http://127.0.0.1:5174/artifacts/maze-step3/review.html` for the review gallery.

Scenery checks in `tools/verify_maze_findables.mjs` cover seven fixed seeds,
including all open passages with a 1.6 m wide clear lane, unobstructed pickup
sightlines, wall/collider equality, pickup callbacks and unchanged triggers.
Six exact snapshots captured before Step 3 also match after decoration.


## Step 4: room-local lighting and materials

`src/rooms/mazeLighting.js` owns the maze's new rig: a readable hemisphere
fill, one golden entrance wash, up to three depth-tinted intersection accents,
two warm collectible focus lights, a violet rim and a rose spotlight at Jax.
There are at most eight direct lights plus the hemisphere; Jax's pre-existing
character light and the game's shared ambient remain unchanged. Only the Jax
spotlight casts shadows, at 512 x 512. This replaces the old central 1024px
point-light cube shadow (six faces). All targets live in the room group.

No renderer, exposure, tone mapping, postprocessing or other-room settings
change. Gold and silver have more selective highlights; cloth/panels are matte
and less emissive, while bulbs remain readable. Scenery receives shadows but
its thousands of instances do not cast them; walls and actors still can.
The floor has a restrained satin finish. Floor/wall materials and the checker
canvas are now created per room visit, making disposal independent between
visits. The lighting group also has an idempotent standalone dispose method.

Reproduce the matched captures with Vite running on port 5174:
`node tools/review_maze_environment_browser.mjs --output=artifacts/maze-step4/after --player-height --with-player`.
The five BEFORE screenshots were captured before changing lighting/materials,
at the same seed and 1.7 m camera height. The sixth AFTER screenshot uses the
normal gameplay camera with Pomni visible. Review them together at
`http://127.0.0.1:5174/artifacts/maze-step4/review.html`.

Validation: all 59 suite tests, seven fixed-seed scenery/lighting checks,
six exact pre-scenery gameplay snapshots, production build and browser captures.
Additional checks bound the direct/shadow light counts, ensure Jax's spotlight
target follows his seed's anchor, exercise shadow cleanup twice, and verify
that repeated room visits do not share floor textures or scenery materials.


## Step 5: custom GLSL overlays

`src/shaders/patrolWarning.js` and `src/shaders/jaxDigitalCracks.js` contain
the original vertex/fragment GLSL and their ShaderMaterial factories.
`src/rooms/mazeShaders.js` merges four narrow patrol strips and four decorative
Jax surfaces into two meshes. `mazeRoom.js` updates them from its existing
pause-guarded room update. There are no additional lights, textures, collision
meshes, dependencies or global renderer changes.

The instant review tour now includes **Animated patrol warning**. Shader
proximity uses Pomni's position in the game and the camera position in the
standalone tour. A detailed CGV write-up is in `docs/maze-shaders-devlog.md`.
Actual original captures, matched overlay-off/overlay-on screenshots and the
WebGL report live under `artifacts/maze-step5/`. Open
`http://127.0.0.1:5174/artifacts/maze-step5/review.html` to compare them.

Re-entry verification also found a pre-existing shared shadow-uniform texture
retention issue. `src/rooms/mazeShadowDepth.js` gives the opaque Jax shadow pass
its own disposable built-in depth material without altering visible materials,
geometry or light settings. This keeps repeated visits' GPU resource counts
stable. Shader materials/geometries dispose through the standard room path.


## Patrol-warning visibility refinement

The active GLSL strips are now 32 cm wide, with a darker translucent backing,
stronger warm-gold chevrons, violet edge lines and about 3.4x faster motion.
They remain exclusively on the existing hazard route. Separate static pale-sage
stitching marks each future loop without arrowheads or danger animation.
`src/rooms/mazeLoopMarkings.js` owns that lightweight floor decoration. No
collision, seed, actor, lighting or Jax GLSL source changed.

The actual gameplay screenshots and short before/after recordings are at
`http://127.0.0.1:5174/artifacts/patrol-refinement/review.html`.
Use **Play comparison** to synchronize the four-second loops, or open the
instant tour's **Animated patrol warning** stop to see the current version.
Nothing has been committed or pushed.
