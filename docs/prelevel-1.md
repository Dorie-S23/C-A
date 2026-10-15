# Pre-Level 1 opening

Start the Vite server with `npm run dev`, open `http://127.0.0.1:5173/`, and
choose **Play** for a new story run. Room previews are available in Options;
they do not start the story or award objectives. The existing developer-mode
option and `?dev=1` room picker remain available.

Pomni sleeps for five seconds, hears three knocks, and wakes using the frozen R5
animation. She holds the seated pose for her self-directed remark and "Come in."
Acknowledge both with Space or a click. As Ragatha opens the door and enters,
Pomni resumes the same animation and stands. Ragatha waves and starts the
remaining morning dialogue. The camera frames both characters
and the open doorway. After the conversation, Ragatha leaves; the door stays open.
Click the game to capture the mouse when needed. WASD moves, the mouse looks,
Shift runs, and E interacts. Use E at the open bedroom doorway to enter Dorm Hall.
Find Caine activates only after successful morning dialogue; talking to Caine
with E advances the objective to Find Ribbit. X dismisses the contextual tips.
Returning to the bedroom does not replay the opening. New Game resets the run.

P pauses/resumes the cinematic, including seated dialogue. Escape pauses the cinematic or cancels dialogue. Cancelling the morning dialogue
does not award an objective; T retries it during bedroom gameplay. Skip opening
preserves the final blanket state and continues to the invitation/entrance.

## Assets and runtime ownership

- `public/models/cinematics/pomni-sleep-wake-r5.glb` is the frozen cinematic export.
  Its original 7.5-second animation is not stretched: only the sleep section is
  held/repeated before resuming at the authored waking marker, 1.4 seconds.
- Original bedroom, Pomni, and Ragatha models remain unchanged. Ragatha uses the
  existing character module's procedural animation, not new skeletal walk clips.
- The source bedroom wall is solid behind its decorative door. Runtime-only
  wall copies create an aperture and a small bounded vestibule. These persist
  while the door remains open and are disposed with the bedroom session.
- The hinge is measured from the actual handle and panel, moving the whole slab.
  An invisible target retains the original E-to-hallway action through the opening.
- Snoring, knocks, creak and footsteps are temporary synthesized audio cues.
  Movement drives Ragatha's footsteps; the staged schedule is not played as well.
- Blender working projects, frozen development revisions, backups, renders and
  generated test artifacts stay local and are excluded from Git. The runtime GLB
  and portable asset-hash fixture are included.

## Verification

Run existing dialogue/collision checks with `npm test`. Additional checks:

```sh
node _verify_bedroom_lighting.mjs
node _verify_pomni_opening.mjs
node _verify_opening_audio.mjs
node _verify_ragatha_entrance.mjs
node _verify_objectives.mjs
node _verify_caine_interaction.mjs
node _verify_controls_tutorial.mjs
node tools/verify_pomni_door.mjs
node tools/verify_ragatha_geometry.mjs
npm run build
```

With Vite running, `node tools/verify_ragatha_door_open_browser.mjs` checks the
conversation framing, open departure, restored objective/controls and one-E
hallway travel. It uses installed Edge Chromium by default; set `CGV_BROWSER_PATH`
to another Chromium executable if needed. Browser tools write ignored artifacts.
`tools/verify_pomni_opening_browser.mjs` contains broader opening/tutorial/Caine
coverage; transient entrance-phase waits can time out on overloaded headless runs.

Known limits: the source door jamb/header contacts the slab during part of its
swing; the fully-open door clears the room, and Ragatha waits for that clearance.
The live morning retains the text-only Jax beat; a physical Jax pass-by is not
integrated here. Native Chrome pointer capture and audible balance still require
interactive review. The production bundle currently triggers Vite's size warning.

## Seated invitation choreography

The frozen R5 source report identifies Sitting at frame 119 (3.933333 seconds,
30 fps, first frame at zero); provenance and all authoring markers are recorded
in `tools/fixtures/pomni-r5-timing.json`. The GLB is unchanged. After five seconds
of breathing/snoring, the three knock buffers play at 5, 5.22 and 5.44 seconds.
Waking resumes at 5.6 seconds, after the last knock buffer ends.

A new story run holds both the cinematic skeleton and blanket mixer at Sitting.
The existing full "Another day..." self-directed remark is reused there, followed
by "Come in." Space first finishes typewriter text, then advances the line. The
morning script resumes at `ragathaMorningGreeting` so the remark is not repeated;
dialogue previews retain the original complete script.

Acknowledging the invitation starts the door entrance. The first actual door
opening resumes the R5 clip at normal speed. Ragatha and Pomni share simulation
steps; the camera widens to show their simultaneous movement. Gameplay Pomni is
hidden until the cinematic actor is removed at the completed standing/idle pose.
Ragatha's greeting waits for both characters to finish positioning.

P pauses dialogue typing/input as well as animation and audio. Cancelling either
seated line settles Pomni/blanket, blends to gameplay, and offers T to retry the
morning conversation without awarding Find Caine or unlocking tutorial tips.
Skipping R5 before the seated hold retains the standing invitation/entrance path.
New Game resets the sequence; room re-entry retains the settled cover.

Run `node _verify_opening_choreography.mjs` for focused marker, hold, synchronized
resume, disposal and skip checks. With Vite running, use
`node tools/verify_opening_choreography_browser.mjs` for the normal story path,
seated pause/cancellation, doorway travel and re-entry. It pauses a real rendered
entrance frame using P to capture concurrent movement reliably. Screenshots and
reports are written to ignored `artifacts/opening-choreography/`.

Use `node tools/verify_opening_choreography_browser.mjs --lifecycle-only` for
Skip, cancellation and a simulated failed cinematic download with morning retry.

## Bedroom view into Dorm Hall

`src/rooms/dormHallPreview.js` loads the original Dorm Hall as visual scenery,
without invoking its gameplay loader. Its wrapper uses native scale, Y rotation
`-Math.PI / 2`, and position `[-38.7556795329, -0.0060309172, 6.9378740627]`.
Original child transforms, including negative scales, are preserved. Runtime
geometry cropping retains a local section: 51 meshes, 33,279 triangles and 19
texture resources. The duplicate Pomni door, portrait and frame are excluded.
The bedroom door, reversible wall aperture, collision and E travel remain owned
by the existing systems. Ragatha's complete route cleared the retained hallway
triangles in 323 sampled poses. No hallway lights or gameplay actors are added.

The preview replaces only the visible vestibule surfaces; their collision
remains. Preview visibility follows the entrance backdrop. The player still
uses E to load the playable Dorm Hall. The door stays open after Ragatha leaves;
the isolated door review also checks closed, half-open and reclosed transforms.

Each bedroom session owns its preview geometry, materials and textures. Pruned
resources are released without disposing shared retained resources. Disposal
removes and releases the preview before generic room cleanup. Three rendered
reloads held at 313 GPU geometries and 41 textures each; this is a bounded reload
check, not a measurement of total process RAM.

Filtering does not avoid downloading/parsing the full 30,115,128-byte GLB. The
first measured local load took about 1.25 seconds (430 ms download, 467 ms parse,
353 ms preparation). Warm reloads took about 0.96-1.32 seconds. With both bedroom
mirrors, Pomni, Ragatha and the R5 blanket present, paired headless Edge tests
measured about 8 ms additional median frame time and a 12.5-13% FPS reduction.
Separate-run measurements varied considerably. Interactive Chrome performance
on the demonstration laptop still needs review.

Loading errors, a 12-second preparation budget or an oversized retained mesh
budget fall back to the original vestibule. Use `?hallPreview=0` on either the
development or production URL to explicitly select that cheaper fallback.
The retained view is a local section, not a seamless world; extreme viewpoints
beyond the tested frontal and oblique views may expose cropped ends. The small
original threshold/baseboard lip and documented door-trim swing contact remain.

Run `node _verify_dorm_hall_preview.mjs` for geometry, ownership and fallback
checks. With Vite running, run
`node tools/verify_dorm_hall_preview_browser.mjs` for rendering, E travel,
re-entry and repeated-load checks; add `--fallback-only` for a failed-download
check or `--in-game-perf-only` for paired live-conversation timing. The browser
tool defaults to installed Edge Chromium. Reports and screenshots are in
`artifacts/dorm-hall-preview/`; see its README for measured results and limits.

## Jax's live morning pass

The playable morning now splits at the existing `jaxPassByText` marker and
resumes at `afterJaxPassBy`. `src/cinematics/jaxBedroomPass.js` runs Jax across
the actual hallway preview for a 2.9-second beat, keeping the existing two-character
conversation camera fixed throughout. Dialogue progression is suspended by the existing script
segment mechanism; there is no extra acknowledgement for the wordless pass.
Ragatha's entrance and the bedroom door behaviour are unchanged.

The existing `public/models/characters/jax/jax_from_tadc.glb` is a 547,352-byte
rigged model with 60 skin joints and no baked animation clips. The pass reuses
`src/characters/jax.js`'s procedural run, adds scene-local bent-arm motion and
evaluated-skin floor alignment, and scales Jax to 2.1 m including his ears.
He runs eight metres along the real hall's length, across the doorway rather
than entering the bedroom. No Jax collider or additional light is installed.
Fast spatial footsteps reuse the documented temporary synthesized entrance
buffer; approved recorded footsteps can replace that buffer later.

Jax preloads only for a new playable bedroom session with the actual hallway
preview. Missing Jax or a disabled/failed preview retains the original text beat.
Normal completion or Skip resumes Ragatha's next line; P/Escape pauses the
cinematic. Retry after an interrupted later conversation does not replay Jax.
Home, room disposal and New Game stop the pass and its audio without invoking a
stale continuation. One-shot GPU bone textures are released at completion or
disposal; generic room cleanup retains ownership of model meshes/materials.

Run `node _verify_jax_bedroom_pass.mjs` for real-model geometry, timing, floor,
pause/skip/disposal and resource tests. With Vite running, use
`node tools/verify_jax_bedroom_browser.mjs`; screenshots and its report are in
`artifacts/jax-bedroom-pass/`. The existing bedroom doorway browser regression
also waits through this wordless interval before verifying E travel.
