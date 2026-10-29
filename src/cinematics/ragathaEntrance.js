import * as THREE from 'three';
import { createBedroomDoorHinge } from './bedroomDoor.js';
import { createRagathaBlocking } from './ragathaBlocking.js';

export const ENTRANCE_SECONDS = 4;
const RETURN_SECONDS = 1.25;
const ease = (t, a, b) => THREE.MathUtils.smootherstep(t, a, b);

/** Room-owned staged arrival. No substitute character or bedroom asset edits. */
export function createRagathaEntrance({ room, camera, resolveCamera, audio, cast, onDialogue, onComplete,
  onDoorOpening, canStartDialogue = () => true, onSkipOpening, advanceOpening }) {
  const slab = room.group.getObjectByName('Door_Slab024');
  const frame = room.group.getObjectByName('Door_Frame024');
  if (!slab || !frame) throw new Error('Bedroom entrance door is unavailable');
  room.group.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(frame).getCenter(new THREE.Vector3());
  const hinge = createBedroomDoorHinge({
    group: room.group, collisionMeshes: room.collisionMeshes, insidePoint: room.spawn,
  });

  const inward = room.spawn.clone().sub(center).setY(0);
  // The actual panel is axis-aligned: view it from inside, across its face.
  if (Math.abs(inward.z) >= Math.abs(inward.x)) inward.set(0, 0, Math.sign(inward.z) || -1);
  else inward.set(Math.sign(inward.x) || -1, 0, 0);
  const side = new THREE.Vector3().crossVectors(inward, new THREE.Vector3(0, 1, 0));
  const blocking = cast ? createRagathaBlocking(room, inward, side) : null;
  const actor = cast?.ragatha;
  if (actor) {
    actor.scale.setScalar(.9); // 1.8 m: slightly taller than the R5-compatible 1.6 m Pomni
    actor.position.copy(blocking.start);
    actor.rotation.y = Math.atan2(inward.x, inward.z);
    actor.visible = false;
    cast.setPose('idle');
  }
  const shotTarget = center.clone().addScaledVector(inward, .35); shotTarget.y = 1.45;
  const shotPosition = center.clone().addScaledVector(inward, 2.5).addScaledVector(side, -1.15);
  shotPosition.y = 1.75;
  const startPosition = camera.position.clone();
  const startTarget = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2).add(startPosition);
  let phase = 'entering', elapsed = 0, returning = 0, paused = false, completed = false;
  let releasePosition, releaseTarget;
  let stage = 'opening', stageTime = 0, routeIndex = 0, stride = 0;
  let previousPosition = actor?.position.clone();
  let exitElapsed = 0;
  let doorOpeningStarted = false;
  const coordinatedOpening = Boolean(onDoorOpening);
  function beginDoorOpening() {
    if (doorOpeningStarted) return;
    doorOpeningStarted = true; onDoorOpening?.();
  }
  const groundRay = new THREE.Raycaster();
  const bodyBox = new THREE.Box3();
  // Side-on two-shot: both characters in the foreground, doorway behind them.
  const talkTarget = blocking ? room.spawn.clone().lerp(blocking.talk,.5).setY(1.2) : null;
  const talkCamera = blocking ? center.clone().addScaledVector(inward,5.95).addScaledVector(side,.4).setY(2.2) : null;
  const exitInteraction = room.interactables?.find(i=>i.prompt()==='Exit to Hallway');
  let exitTarget;
  if (cast && exitInteraction) {
    // The swung panel is no longer across the opening. Keep the existing E
    // action hittable through the aperture without adding automatic travel.
    exitTarget=new THREE.Mesh(new THREE.PlaneGeometry(blocking.measurements.width,blocking.measurements.height),
      new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    exitTarget.name='OpenBedroomExitTarget';exitTarget.visible=false;
    exitTarget.position.copy(room.group.worldToLocal(center.clone()));
    exitTarget.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),inward);
    room.group.add(exitTarget);exitInteraction.objects.push(exitTarget);
  }
  function sound(method, ...args) {
    try { audio?.[method]?.(...args); }
    catch (error) {
      console.warn('Temporary entrance audio unavailable; continuing silently.', error);
      try { audio?.dispose?.(); } catch { /* optional audio must never block the sequence */ }
      audio = null;
    }
  }
  // The room's own door control, when it has one, so it knows where the leaf is.
  const control = room.group.userData.bedroomDoor;
  function door(amount) {
    if (control) control.hold(amount); else hinge.setOpenFraction(amount);
  }
  function view(position, target) {
    // The look target can lie inside the swinging panel's arc. Probe from
    // inside the room instead, so the panel cannot collapse the camera onto
    // that target. The camera still looks at the original doorway target.
    const collisionTarget = target.clone();
    const depth = collisionTarget.clone().sub(center).dot(inward);
    if (depth < 1.7) collisionTarget.addScaledVector(inward, 1.7 - depth);
    camera.position.copy(resolveCamera ? resolveCamera(collisionTarget, position) : position);
    camera.lookAt(target);
  }
  function beginDialogue() {
    if (phase !== 'entering' || !canStartDialogue()) return;
    if (!cast) { elapsed = ENTRANCE_SECONDS; door(1); sound('dispose'); }
    else { stage = 'greeting'; door(1); sound('pause'); cast.setPose('listen'); cast.setSpeaking(false); }
    phase = 'dialogue';
    view(cast ? talkCamera : shotPosition, cast ? talkTarget : shotTarget);
    onDialogue?.(controller.finishDialogue);
  }
  function setStage(next) { stage = next; stageTime = 0; }
  function walk(points, done) {
    const next = () => {
      if (routeIndex >= points.length) { done(); return; }
      cast.walkTo(points[routeIndex++], next);
    };
    routeIndex = 0; next();
  }
  function moveActor(dt) {
    cast.update(dt);
    actor.updateMatrixWorld(true);
    let ground = room.spawn.y;
    // Include the actual raised rug edging beneath either shoe, not just
    // the room's nominal floor. The room and avatar buffers stay unchanged.
    for (const [dx,dz] of [[0,0],[-.3,0],[.3,0],[0,-.3],[0,.3]]) {
      groundRay.set(new THREE.Vector3(actor.position.x+dx,.4,actor.position.z+dz),new THREE.Vector3(0,-1,0));
      groundRay.far=.5;
      const hit=groundRay.intersectObjects(room.collisionMeshes.map(e=>e.mesh),false)[0];
      if(hit)ground=Math.max(ground,hit.point.y);
    }
    bodyBox.makeEmpty();
    actor.traverse(o=>{if(o.isMesh&&o!==cast.collider)bodyBox.expandByObject(o);});
    actor.position.y += ground + .003 - bodyBox.min.y;
    const distance = Math.hypot(actor.position.x-previousPosition.x,actor.position.z-previousPosition.z);
    if (distance < .1) stride += distance; // skips never emit a burst of footsteps
    previousPosition.copy(actor.position);
    if (stride >= .5) { stride %= .5; sound('cue', 'step', actor.position); }
  }
  function physicalStep(dt) {
    stageTime += dt;
    if (phase === 'entering') {
      elapsed += dt;
      if (stage === 'opening') {
        if (stageTime >= .65) beginDoorOpening();
        const fraction = ease(stageTime, .65, 1.95); door(fraction);
        if (stageTime >= .65 && !actor.visible) {
          actor.visible = true; blocking.setVisible(true); blocking.aperture.setEnabled(true); sound('cue', 'creak', center);
        }
        if (stageTime >= 1.95) {
          setStage('walking-in');
          walk([blocking.threshold, blocking.talk], () => {
            cast.faceTowards(room.spawn); cast.setPose('wave'); setStage('greeting');
          });
        }
      } else if (stage === 'greeting') {
        door(1); // Keep the hallway visible throughout the greeting/conversation.
        if (stageTime >= 1.8) beginDialogue();
      }
      moveActor(dt);
      advanceOpening?.(dt);
      const approach = ease(elapsed, 0, 1.1);
      const chat = stage === 'greeting' ? ease(stageTime, 0, 1.5) : 0;
      const position = startPosition.clone().lerp(coordinatedOpening ? talkCamera : shotPosition, approach).lerp(talkCamera, chat);
      const target = startTarget.clone().lerp(coordinatedOpening ? talkTarget : shotTarget, approach).lerp(talkTarget, chat);
      view(position, target);
    } else if (phase === 'dialogue') {
      moveActor(dt); view(talkCamera, talkTarget);
    } else if (phase === 'exiting') {
      exitElapsed += dt;
      if (stage === 'turning-out') {
        door(1);
        if (stageTime >= .7) {
          setStage('walking-out');
          walk([blocking.threshold, blocking.outside, blocking.away], () => {
            actor.visible = false; beginReturn();
          });
        }
      }
      moveActor(dt);
      const blend = ease(exitElapsed, 0, 1.2);
      view(talkCamera.clone().lerp(shotPosition, blend), talkTarget.clone().lerp(shotTarget, blend));
    }
  }
  function beginReturn() {
    if (cast) sound('dispose');
    if (actor) actor.visible = false;
    door(1); // Shut again only once Ragatha's gone (see the return below).
    releasePosition = camera.position.clone();
    releaseTarget = cast ? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2).add(releasePosition) : shotTarget.clone();
    phase = 'returning'; returning = 0;
  }
  const controller = {
    get active() { return ['entering', 'dialogue', 'exiting', 'returning'].includes(phase); },
    get phase() { return phase; }, get elapsed() { return elapsed; },
    get skippable() { return phase === 'entering' || phase === 'exiting'; },
    get diagnostics() { return cast ? { stage, visible: actor.visible, position: actor.position.toArray(),
      yaw: actor.rotation.y, route: blocking.measurements, exitElapsed } : null; },
    dialogueNode(node) {
      if (!cast || phase !== 'dialogue') return;
      const speaking = node?.type === 'line' && node.speaker === 'ragatha';
      cast.setSpeaking(speaking); cast.setPose(speaking ? 'chatty' : 'listen');
    },
    setPaused(value) {
      if (!controller.active || paused === value) return;
      paused = value;
      if (phase === 'entering' || phase === 'exiting') sound(value ? 'pause' : 'resume', elapsed);
    },
    update(delta, follow) {
      if (!controller.active || paused) return;
      if (cast && phase !== 'returning') {
        // Fixed-size procedural steps keep walking/turning consistent at low FPS.
        let remaining = Math.max(0, delta);
        while (remaining > 1e-8 && phase !== 'returning') {
          const step = Math.min(1 / 60, remaining); physicalStep(step); remaining -= step;
        }
        return;
      }
      if (phase === 'entering') {
        elapsed = Math.min(ENTRANCE_SECONDS, elapsed + Math.max(0, delta));
        if (elapsed >= .65) beginDoorOpening();
        advanceOpening?.(Math.max(0, delta));
        sound('update', elapsed);
        door(ease(elapsed, .65, 1.95));
        const blend = ease(elapsed, 0, 1.1);
        view(startPosition.clone().lerp(shotPosition, blend), startTarget.clone().lerp(shotTarget, blend));
        if (elapsed >= ENTRANCE_SECONDS) beginDialogue();
      } else if (phase === 'dialogue') view(shotPosition, shotTarget);
      else if (follow) {
        returning = Math.min(RETURN_SECONDS, returning + Math.max(0, delta));
        const blend = ease(returning, 0, RETURN_SECONDS);
        door(1 - blend); // she's gone: swing it shut behind her
        view(releasePosition.clone().lerp(follow.position, blend), releaseTarget.clone().lerp(follow.target, blend));
        if (returning >= RETURN_SECONDS) {
          phase = 'done';
          // Shut, there's nothing to see beyond it (a room door control does this itself).
          if (!control && blocking) blocking.setVisible(false);
          if (!completed) { completed = true; onComplete?.(); }
        }
      }
    },
    skip() {
      if (paused) return;
      if (phase === 'entering') { beginDoorOpening(); onSkipOpening?.(); }
      if (cast && phase === 'exiting') { beginReturn(); return; }
      if (cast && phase === 'entering') {
        // Cancel the walk target by making it arrive immediately.
        actor.position.copy(blocking.talk); cast.walkTo(blocking.talk); cast.update(0);
        cast.update(.75); // settle the old stride without replaying movement/audio
        previousPosition.copy(actor.position); stride = 0;
        cast.faceTowards(room.spawn); actor.rotation.y = Math.atan2(room.spawn.x - actor.position.x, room.spawn.z - actor.position.z);
        actor.visible = true; blocking.setVisible(true); blocking.aperture.setEnabled(true); sound('pause');
        moveActor(0);
      }
      beginDialogue();
    },
    finishDialogue() {
      if (phase !== 'dialogue') return;
      if (cast) {
        phase = 'exiting'; setStage('turning-out'); stride = 0;
        cast.setSpeaking(false); cast.setPose('idle'); cast.faceTowards(blocking.threshold);
        sound('resume', elapsed); // The door is already open; no duplicate creak.
      } else beginReturn();
    },
    dispose() {
      if (phase === 'disposed') return;
      // Once it's played out the door's the room's again, wherever Pomni's left it.
      const finished = phase === 'done';
      phase = 'disposed'; sound('dispose');
      if (!finished) door(0);
      if (actor) {
        actor.visible = false;
        if (!finished) { blocking.setVisible(false); blocking.aperture.setEnabled(false); }
      }
      if(exitTarget){const index=exitInteraction.objects.indexOf(exitTarget);if(index!==-1)exitInteraction.objects.splice(index,1);}
      // No callback: leaving a room must never resurrect it or start dialogue.
    },
  };
  sound('start', 0);
  return controller;
}
