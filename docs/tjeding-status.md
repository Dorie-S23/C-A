# Tjeding: KAN-30 and KAN-48 review

Reviewed on **28 October 2026**, against local branch **dev/Tjeding**, baseline
commit **0f65682b3afd72c3a435e25be0257c90f2501004**, and the supplied Jira export
dated **28 October 2026, 16:27 SAST**. Jira itself has not been edited.

**Review complete: 16/16 browser audit checks passed, with no browser errors or
WebGL context loss.** Recommend **Done for KAN-30's regression review** and
**In Progress for KAN-48**. The abstraction effect remains an open requirement;
no functional regression was found in the reviewed failure/retry/score paths.

## What the current game actually does

The current [Ribbit script](../src/data/dialogues.js) has four choices with four
options each. The best answers are **A, B, A, A** and earn four Escape points.
Each choice has one +1 answer, two zero-point answers, and one fourth-option
Game Over branch. Ordinary zero-point answers continue the conversation; they
do not become fatal after two mistakes.

[level1Attempt.js](../src/state/level1Attempt.js) starts distress at 1. Good
answers reduce it toward zero; zero-point answers increase it, capped at 2.
A fourth-option answer sets distress to 3. Its response lines play before the
script reaches a `gameOver` beat. [runLevel1](../src/levels/level1.js) then
cancels dialogue, clears the failed attempt's Level 1 points, and shows the
script's message with **Retry Level**. Retry reloads Dorm Hall and starts the
door conversation with a fresh tally. Other levels' points are preserved.

| Fatal branch | Inputs from a fresh encounter | Exact Game Over message |
| --- | --- | --- |
| Choice 1: “Nevermind” | D | Don’t be a bum |
| Choice 2: “Yeah.” | A, D | Why would you say that? |
| Choice 3: “He is” | A, B, D | You’re being the ‘pick-me’ |
| Choice 4: “So lazy” | A, B, A, D | Genuinely what’s wrong with you? Seek help |

Live-game **Escape releases pointer lock and pauses**, retaining the current
attempt. Resume continues it. Explicit dialogue cancellation is a separate
lifecycle operation: it restores the score from before the attempt, resets
staged actions, and returns from the bedroom to Dorm Hall. **Home** abandons
the session; **New Game** clears the run's scores.

## Browser review matrix

The review uses the real browser, shipped models, dialogue UI, E interaction,
staged actions, scoring and story gates. All checks below passed in the final
corrected-fixture run or the separately identified existing browser suite.

| Check | Result | Evidence / observed behaviour |
| --- | --- | --- |
| Each of the four Game Over branches | Pass | Exact messages above; response lines precede the card; choice 1 stays outside the closed door. |
| Retry after each Game Over | Pass | Returns to the door, clears Level 1 points, retains synthetic Level 2 points, and leaves Find Ribbit active. |
| Failure cannot advance to Kaufmo | Pass | Ribbit remains incomplete, hallwayPending and kaufmoIntroduced stay false, and the hallway-start function returns false after each failure. |
| Two consecutive late failures, then a win | Pass | Failed points do not accumulate. The eventual A, B, A, A attempt earns exactly 4. |
| Rapid double choice / Retry clicks | Pass | No duplicate score or retry callback; the final synthetic total is 4 Level 1 + 2 Level 2 = 6. |
| Zero-point paths B, A, B, B and C, C, C, C | Pass | Both finish at 0 points and enable Find Kaufmo, matching the current script. |
| Escape / pointer unlock, paused input, Resume | Pass | Retains the current choice and score, blocks input while paused, then finishes normally. |
| Explicit cancellation during knock | Pass | Clears actions, preserves Find Ribbit, rolls back attempt points, and permits a fresh E interaction. |
| Explicit cancellation during room entry | Pass | Returns to Dorm Hall without advancing the story or restarting a cancelled action. |
| Explicit cancellation during seating | Pass | Cancels staged movement and permits a fresh encounter. |
| Explicit cancellation after earning a point | Pass | Rolls back the point and permits retry without advancing Kaufmo. |
| Home during a scored encounter, then New Game | Pass | Abandons callbacks and clears both levels' scores on New Game. |
| Leaving Game Over, then clicking a retained Retry element | Pass | Does not restart an abandoned session or revive the card. |
| Attempt to walk/sprint and move the camera during a choice | Pass | Player position, camera yaw/pitch, score and dialogue state remain unchanged. |
| Browser exceptions, console errors and WebGL context | Pass | No errors or lost context in the final corrected-fixture run. |
| Successful handoff, revisit and save/reload | Pass | Existing browser suite confirms 4 retained Level 1 points, win-only hallway, no replay on revisit or full page reload, and hallway cancellation cleanup. |

The two Level 2 points used in retry-isolation checks are an injected sentinel,
not a claim that the normal campaign reaches Level 1 with Level 2 points.

## Remaining defects and requirement differences

### Open implementation gap: abstraction presentation (KAN-47 / KAN-48)

**The failure/retry controller works; the shared abstraction effect is missing.**
Ribbit currently hunches, lowers her head and trembles via
[ribbit.js](../src/characters/ribbit.js). The dialogue overlay can shake and tint
red via [DialogueUI.js](../src/ui/DialogueUI.js). These distress reactions and a
Game Over card do not implement KAN-47's reusable glitch/distortion/collapse
effect, or show Ribbit actually abstracting.

Suggested issue comment / reproduction for the existing KAN-48:

> Start Level 1 and choose A, B, A, D. Advance the response lines. Game Over
> and Retry Level work, and the attempt's points are cleared, but no shared
> abstraction visual/audio sequence plays before the card. Keep this work
> open and link KAN-47. Integrate its effect without breaking retry, score
> rollback or the win-only Kaufmo gate. The D branch at choice 1 happens
> outside a closed door, so its presentation needs a specific story decision.

Owner coordination: **Tjeding** owns KAN-48 integration; **Dorsa Shahrokh** owns
KAN-47 in the supplied export. Reuse that work rather than create a competing
abstraction system.

### Requirement difference: wrong-answer count versus authored Game Over

KAN-48 says “too many wrong choices” with an undecided suggestion of **2 out
of 4**. The current script explicitly authors **one fatal fourth option per
choice**, while other wrong answers continue. This is a specification
difference, not evidence of a scoring regression. The script's Game Over
messages also do not explicitly say Ribbit abstracted.

Ask the team to reconcile the ticket with the authored script and decide
which failures should depict abstraction. Do not silently restore a two-strike
rule or label every current Game Over as a completed abstraction sequence.

### Fixed review defects: obsolete test and playtest instructions

- Before this review, `node tools/verify_level1_browser.mjs --edge` failed with
  **“unexpected extra choice”**. It selected B, A and expected **Level 1 Failed**,
  although those answers now continue. The test now selects D and expects
  **Game Over**. The existing suite subsequently passed.
- [story-flow.md](story-flow.md) described both the obsolete two-strike failure
  and Escape-to-cancel behaviour. Its Level 1 rules and manual instructions
  now describe the actual script and Escape-to-pause behaviour.
- Browser fixtures that suppress shader warm-up must return a Set from
  `renderer.compile`, because Three.js `compileAsync` iterates it. That fixture
  contract was corrected; preliminary fixture errors are not product defects.

No gameplay source, scoring threshold, dialogue wording, or failure rule was
changed during this review.

## Suggested Jira updates (copy-ready drafts)

### KAN-30 — Playtest Level 1

**Recommended status: Done for this Level 1 regression review.** Assignee:
**Tjeding**. Keep the abstraction gap linked under KAN-48/KAN-47; closing the
review does not close those implementation requirements or the Level 1 epic.

Suggested comment:

```text
Reviewed Level 1 on dev/Tjeding at baseline 0f65682 (28 Oct 2026).

Covered all four scripted Game Over branches, exact failure messages,
nonfatal zero-point paths, repeated retry, score rollback, rapid double
input, movement/camera lock, pause/resume, explicit cancellation during
knock/entry/seating and after scoring, Home/New Game, and stale Retry.
Failure leaves Find Ribbit active and cannot start Kaufmo's hallway.
Successful A/B/A/A play earns exactly 4 points; revisit/save/reload does
not duplicate points or replay the completed hallway encounter.

Updated the obsolete browser assertion and Level 1 playtest instructions.
Evidence, commands and limitations: docs/tjeding-status.md.
Final browser audit: 16/16 checks passed, with no browser errors or WebGL
context loss; targeted Level 1/story unit run: 10/10 tests passed.
Outstanding abstraction presentation remains tracked by KAN-48/KAN-47;
this review does not declare that effect implemented.
```

### KAN-48 — Ribbit abstraction fail state + restart Level 1

**Recommended status: In Progress**, not Done. Assignee: **Tjeding**.
Link dependency **KAN-47**. The export's final Status column says To Do;
its broader Status category is not evidence that this task is complete.

Suggested comment:

```text
Failure/retry logic is implemented and reviewed against the current script:
the fourth option at each choice plays its response, reaches a gameOver
beat, clears this attempt's Level 1 points and offers Retry Level.
Retry restarts at Ribbit's door. Failure does not enable Find Kaufmo,
and repeated retries do not accumulate points.

Still open: integrate the reusable abstraction presentation from KAN-47
and verify its completion/cancellation/cleanup in the failure flow.
Current distress animation, dialogue shake/tint and Game Over card are
not the shared abstraction effect.

The ticket's suggested two-wrong-answer trigger conflicts with the current
authored script. Resolve the description with the team; retain the current
rules until that decision. Choice 1 fails outside a closed door and needs
an agreed presentation. Evidence: docs/tjeding-status.md.
```

Suggested revised acceptance criteria, if the team retains the current script:

1. Each scripted fourth-option branch plays its authored responses before failure.
2. Ordinary zero-point options remain nonfatal and award no points.
3. Failure clears attempt points, preserves other levels' points, and cannot
   complete Find Ribbit or enable Kaufmo.
4. Retry starts a clean door encounter without refreshing the browser or
   duplicating points/callbacks; leaving the session invalidates pending work.
5. Integrate KAN-47's agreed visual/audio presentation, including an explicit
   decision for the closed-door failure; verify pause, cancellation and cleanup.

## Reproduction and evidence

Use separate terminals from the project root:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

```powershell
node tools/verify_level1_review_browser.mjs
node tools/verify_level1_browser.mjs --edge
node tools/verify_dialogue_ui_browser.mjs
node --test _verify_level1.mjs _verify_story_flow.mjs
node _verify_dialogue.mjs
```

The targeted Node run passed **10 tests**. Dialogue checks passed, including
enumerating all 256 four-option Level 1 answer combinations; fatal choices
terminate at their authored Game Over rather than reaching later choices.
The separate dialogue UI browser suite passed its four action/cancellation/
pause/skip checks. The existing Level 1/hallway browser suite passed.

The final new audit passed **16/16 checks**, with **zero browser exceptions or
console errors**, and no lost WebGL context. It writes snapshots and results to ignored
`artifacts/level1-review/rendered/report.json`. Screenshots include
`game-over-choice-1.png` through `game-over-choice-4.png`,
`success-four-points.png`, `pause-during-choice.png`, and
`dialogue-movement-lock.png`. Attach the generated evidence to Jira or rerun
the commands; ignored artifacts are not included in a normal Git commit.

Environment: Windows, Node **24.18.1**, headless Edge **156.0.4314.42**, Vite
on localhost, 1000 x 750 audit viewport, software WebGL at 0.3 pixel ratio.
The bridge skips the earlier opening/Caine encounters, places Pomni at the
real story door, and emulates pointer lock. Explicit cancellation uses the
dialogue API; it is not presented as the normal live Escape control.

Continuous drawing and shader warm-up are suppressed to keep software-rendered
tests practical; screenshots draw real WebGL frames on demand. Action timing,
models, interaction callbacks, UI, scoring and story progression remain real.
This review does not establish hardware frame rate, visual animation quality
under continuous rendering, browser-native pointer-lock behaviour, full
opening-to-ending campaign completion, or usability on a classmate's machine.
