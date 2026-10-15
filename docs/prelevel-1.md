# Pre-Level 1 opening

Start the Vite server with `npm run dev`, open `http://127.0.0.1:5173/`, and
choose **Play** for a new story run. Room previews are available in Options;
they do not start the story or award objectives. The existing developer-mode
option and `?dev=1` room picker remain available.

Pomni sleeps for five seconds, hears three knocks, wakes using the frozen R5
animation, and says “Come in.” Acknowledge with Space or a click. Ragatha enters,
waves, and starts the existing morning dialogue. The camera frames both characters
and the open doorway. After the conversation, Ragatha leaves; the door stays open.
Click the game to capture the mouse when needed. WASD moves, the mouse looks,
Shift runs, and E interacts. Use E at the open bedroom doorway to enter Dorm Hall.
Find Caine activates only after successful morning dialogue; talking to Caine
with E advances the objective to Find Ribbit. X dismisses the contextual tips.
Returning to the bedroom does not replay the opening. New Game resets the run.

Escape pauses the cinematic or cancels dialogue. Cancelling the morning dialogue
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
