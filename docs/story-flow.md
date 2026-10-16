# Story progression through Ribbit and Kaufmo

Start **Play** or **New Game** for a story session. Both clear objectives,
encounter milestones, Escape points, photos and cinematic state. Options →
Room previews and the developer mission buttons remain separate from story
progression.

The playable sequence is:

1. Pomni wakes; Ragatha enters and talks with her. Jax's hallway cutaway plays
   at the relevant dialogue beat. Completing the morning enables **Find Caine**.
2. Explore the Dorm Hall for ten seconds of active play; Caine arrives and
   speaks to Pomni. His completed warning enables
   **Find Ribbit**, with directions to the far-left bedroom. Pomni stays where
   the conversation ended.
3. At Ribbit's door, E offers **Knock on Ribbit’s door**. Normal opening and
   room travel are gated until her encounter is complete. The first choice
   plays through the closed door; consent moves the scene into her room.
4. Pomni approaches the bed before dialogue resumes. Choosing to sit waits
   for her approach and seating pose. Fixed conversation shots frame both
   characters. The four choices score at most four Escape points; poor
   choices still advance. Ribbit steadies on every path, with a more guarded
   recovery line and pose after poor support.
5. Finishing completes **Find Ribbit** and enables **Find Kaufmo**. Pomni stands,
   the conversation camera releases, and the exit opens. There is no scene
   picker in this handoff. A **Level 1 Complete** card pauses for Continue
   before free exploration resumes.
6. Leaving for Dorm Hall plays Kaufmo's hallway encounter. Its completion is
   remembered, then Pomni travels into his room for the introduction. If
   interrupted, E on Kaufmo retries the room conversation.
7. Completing the introduction enables **Find the office photos** and the
   photo counter. All three photos are in Kaufmo’s room. Early pickups are
   retained, but do not bypass his introduction. E then presents held photos. Three presented
   photos enable **Hear Kaufmo’s Theory**; his stall/payoff conversations
   resolve that objective and show **Level 2 Complete** once per run.

`src/game/storyProgress.js` owns the post-Caine milestones. Objectives and
milestones survive room changes. Ribbit's completed pose and an unscored
follow-up interaction are restored on re-entry. Re-entering cannot repeat the
scored encounter or the completed hallway encounter.

Escape during Ribbit's conversation cancels staged actions and restores the
points from before that attempt. Inside the bedroom it returns Pomni to the
hallway, where knocking retries the encounter. Leaving the session invalidates
old dialogue, movement and asset-load callbacks before room disposal.

Dialogue `onNode` hooks may return a Promise. While it is pending, advancing
or selecting is blocked and the dialogue is hidden so the action is visible.
Escape remains available. Staged movement, gestures and waits resolve `true`
on completion and `false` on cancellation. Animation and movement advance once
per frame and stop while the game is paused.

Verification:

```sh
npm test
node _verify_objectives.mjs
node _verify_caine_interaction.mjs
npm run build
```

With Vite running, `node tools/verify_dialogue_ui_browser.mjs` checks awaited
actions, current-score dialogue, cancellation and pause without model assets.
`node tools/verify_story_flow_browser.mjs` checks the opening,
Caine's arrival and warning, the story knock, cancellation during knock/entry,
Ribbit completion and revisit, Kaufmo's hallway/room transition,
hand-ins, completion cards, pause and New Game. It uses installed Edge with software rendering;
review-only browser instrumentation positions the player between encounters.
Screenshots and the report are written to ignored `artifacts/story-flow/`.

Room/cutscene cleanup releases unique geometries, skeletons, shadow targets,
textures and decoded bitmap sources. A loading-manager hook also releases the
actual embedded-image blob URLs after decoding, working around the r169
GLTFLoader cleanup path. The browser regression tracks those URLs and checks
that none remain at the end of loading.

The maze remains the existing prototype. This change does not implement its
planned memory searches, final Jax dialogue or branching ending cinematics.

Developer cutscene skipping honours awaited actions and scores each choice once.
Returning home or changing rooms cancels a pending completion card.
