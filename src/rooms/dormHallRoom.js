import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { createCurtainPortal, createDoorPortal, createDoorConnection } from './portals.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { attachRoomBehindDoor, sill } from './connectRooms.js';
import { ICONS } from '../ui/portraitIcons.js';
import { loadJax } from '../characters/jax.js';
import { loadRibbit } from '../characters/ribbit.js';
import { hallwayGatheringPlan } from '../cutscenes/hallwayGatheringCutscene.js';

// Exported from "Dorm Hall V7.blend" by tools/blender/export_dorm_hall_v7.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
const DORM_HALL_URL = './models/world/dorm-hall-v7.glb';

// Just inside the main hallway, in front of the curtained entrance arch,
// looking down the hall (-Z). The three hallways are far apart, so the
// loader's centroid guess would land in the empty space between them.
const SPAWN = { x: 0, z: -1.5 };

// The entrance arch's curtain: it opens toward -Z (into the hallway) and
// leads back out to the Circus Lobby.
const ENTRANCE_CURTAIN = 'Plane036';

// The bedroom doors that lead somewhere (shut until Pomni opens them — see
// makeDoorOpenable): each character's own door, the one
// with their icon on it, so the hallway, its minimap and the story (Level 1
// knocks on Ribbit's door) all agree. Found by matching each icon decal in
// the hall to its nearest door. The glTF export carries these as "Door
// Frame.068" etc; three.js's GLTFLoader sanitizes node names (spaces go,
// the disambiguating dot is stripped), so they come out as below. All three
// are on the main hallway's left wall.
const ROOM_DOORS = [
  { frame: 'Door_Frame068', slab: 'Door_Slab068', icon: 'Pomni', to: 'pomni' },   // z ≈ -40
  { frame: 'Door_Frame087', slab: 'Door_Slab087', icon: 'Kaufmo', to: 'kaufmo' }, // z ≈ -95
  { frame: 'Door_Frame089', slab: 'Door_Slab089', icon: 'Ribbit', to: 'ribbit' }, // z ≈ -110
];
// The main hallway runs along -Z down x = 0. Doors swing into it, and
// arrivals stand in it, straight out from the door: aiming at the hall's
// spawn instead (far behind, back at the entrance) would point almost
// along the wall for doors this far down.
const HALL_CENTRE_X = 0;

// Door icon decals repainted with the character's dialogue portrait (same
// ~1.19 aspect as the decal quads), so the door matches who you talk to.
const DIALOGUE_ICON_DOORS = ['Kaufmo', 'Ribbit'];

// Rooms physically built onto the hall behind their door (see
// connectRooms.js) instead of reached through a portal and a loading
// screen: open the door and the room is right there. Each needs a loader
// with an `embedded` mode that leaves its own door out and reports its
// doorway. The WALK_IN_ROOMS aren't these either.
const CONNECTED_ROOMS = {};
// Rooms whose door opens onto the real room, which main.js loads in the
// background, shows behind the open door and swaps in as Pomni walks
// through (see walkIntoRoom there): no portal, no loading screen.
const WALK_IN_ROOMS = new Set(['pomni', 'kaufmo', 'ribbit']);
// How close (metres from the doorway) a connected room keeps its mirrors
// reflecting and its shadows updating while Pomni's out in the hall with
// the door open. Each of those re-renders the whole scene, hall and all,
// and from further off the room is barely a few pixels.
const VIEW_RANGE = 15;
const ARRIVAL_DISTANCE = 1.8; // matches portals.js's door arrivals

// Level 2 into 3 (levels/level3Hallway.js): Pomni steps out of Kaufmo's
// room to find Jax down the hall by Ribbit's door, back turned, and he
// bolts back up it past her, on the route the hall gathering staged
// (cutscenes/hallwayGatheringCutscene.js hallwayGatheringPlan). Ribbit comes
// up from her own door's end and stops beside her.
const RIBBIT_MARK = { x: -0.2, z: -96.5 };

/**
 * @param {{ from?: string, items?: object, travel?: Function, jaxHallway?: boolean }} [options]
 *   jaxHallway: load Jax and Ribbit for the hall scene that starts Level 3
 */
export function loadDormHallRoom(onProgress, { from, items, travel, jaxHallway } = {}) {
  const connected = Object.entries(CONNECTED_ROOMS).map(([key, load]) =>
    load(null, { items, embedded: true }).then((guest) => [key, guest]));
  return Promise.all([
    loadRoomModel(DORM_HALL_URL, onProgress, { spawnAt: SPAWN }),
    Promise.all(connected),
    jaxHallway ? Promise.all([loadJax(), loadRibbit()]) : null,
  ]).then(([room, guests, cast]) => {
    const guestRooms = Object.fromEntries(guests);
    // The door handles and light fittings are real metals.
    room.environment = true;
    useDialogueIcons(room.group);
    const entrance = createCurtainPortal(room.group, ENTRANCE_CURTAIN, -1, 'tadc');
    const portals = entrance ? [entrance] : [];

    // Where Pomni arrives from her room by the old E trip — measured off
    // the door panel now, while it's still shut.
    const bedroom = createDoorConnection(room, {
      doorName: 'Plane_36', detailNames: ['Door_Frame068', 'Plane_37', 'Pomni'],
      to: 'pomni', prompt: "Enter Pomni's Room", travel,
    });

    room.hallDoors = {};
    room.walkInDoorways = {};
    room.mapMarkers = [];
    const joins = [];
    let arrival = null;
    let outsideKaufmo = null; // where she steps out of his room, for the Jax hall scene
    for (const { frame, slab, icon, to } of ROOM_DOORS) {
      const frameObject = room.group.getObjectByName(frame);
      if (!frameObject) continue;
      const centre = new THREE.Box3().setFromObject(frameObject).getCenter(new THREE.Vector3());
      const inFront = new THREE.Vector3(HALL_CENTRE_X, centre.y, centre.z);
      // Pomni's swings into her room instead, on the same jamb her room's
      // own door hangs from (its knob's at the other edge), so it's the
      // same door from either side.
      if (to === 'pomni') mirrorLeaf(room.group.getObjectByName(slab));
      const swingToward = to === 'pomni' ? new THREE.Vector3(2 * centre.x - HALL_CENTRE_X, centre.y, centre.z) : inFront;
      const door = openHingedDoor(room.group, frame, slab, swingToward, room.collisionMeshes);
      if (!door) continue;
      const guest = guestRooms[to];
      const doorway = guest?.doorway;
      // A walk-in door opens onto the room itself, and a connected room's
      // doorway just leads into it: neither needs a portal.
      const walkIn = WALK_IN_ROOMS.has(to);
      const portal = doorway || walkIn ? null : createDoorPortal(room.group, door.frameBox, inFront, to);
      if (portal) portals.push(portal);
      // Shut until Pomni walks up and opens it; the character's icon swings with it.
      const control = makeDoorOpenable(room, door, { portal, attach: [room.group.getObjectByName(icon)] });
      room.hallDoors[to] = { portal, control, shut: () => control.lock(), open: () => control.open() };
      if (walkIn) {
        // Hidden while the room behind is shown from inside it: the room's
        // own door is the one in this doorway then.
        const parts = [frameObject, door.slab.parent];
        room.walkInDoorways[to] = walkInDoorway(door.frameBox, inFront, control, parts);
      }

      // Pomni's has its marker and arrival below (createDoorConnection).
      if (doorway || (walkIn && to !== 'pomni')) {
        const intoHall = new THREE.Vector3(Math.sign(HALL_CENTRE_X - centre.x), 0, 0);
        // Where she stands on stepping out of Kaufmo's room: Level 3's hall
        // scene starts there (addJaxHallway).
        if (to === 'kaufmo') outsideKaufmo = sill(door.frameBox).addScaledVector(intoHall, ARRIVAL_DISTANCE);
        if (doorway) joins.push({ guest, control, hostDoor: { frameBox: door.frameBox, intoRoom: intoHall }, doorway });
        room.mapMarkers.push({ to, box: door.frameBox });
        // Back from the room played on its own (the room picker / a
        // dialogue preview): out in the hall by its door, which is open.
        if (from === to) {
          arrival = sill(door.frameBox).addScaledVector(intoHall, ARRIVAL_DISTANCE);
          // Facing on out into the hall, the way she was walking (yaw 0
          // faces -Z, so facing direction d is atan2(-d.x, -d.z)).
          room.spawnFacing = Math.atan2(-intoHall.x, -intoHall.z);
          control.open({ immediate: true });
        }
      }
    }
    const doorControls = Object.values(room.hallDoors).map((d) => d.control);
    room.interactables = [...(room.interactables ?? []), ...doorControls.map((c) => c.interactable)];
    room.update = (deltaSeconds) => {
      for (const control of doorControls) control.update(deltaSeconds);
    };

    for (const { guest, control, hostDoor, doorway } of joins) {
      const { bounds } = attachRoomBehindDoor(room, guest, hostDoor, doorway);
      onlyRenderWhenSeen(room, guest, control, bounds, sill(hostDoor.frameBox));
    }

    room.portals = portals;
    if (arrival) {
      room.spawn = arrival;
    } else {
      // Arrive at whichever portal leads back to wherever the player came from.
      const portalArrival = portals.find((portal) => portal.to === from);
      if (portalArrival) {
        room.spawn = portalArrival.arrival.spawn;
        room.spawnFacing = portalArrival.arrival.facing;
      }
    }

    // No Caine waiting here: in the story he swoops in once Pomni's had a
    // look around (main.js's triggerCaineArrival).
    room.pomniDoorway = room.walkInDoorways.pomni;
    // No portal or hallDoors entry for this one, so mark it for the minimap.
    const bedroomFrame = room.group.getObjectByName('Door_Frame068');
    if (bedroomFrame) room.mapMarkers.push({ to: 'pomni', box: new THREE.Box3().setFromObject(bedroomFrame) });
    if (from === 'pomni') {
      room.spawn = bedroom.arrival.spawn;
      room.spawnFacing = bedroom.arrival.facing;
    }
    // His room's a walk-in now (no portal), so its doorway gives her mark.
    outsideKaufmo ??= portals.find((portal) => portal.to === 'kaufmo')?.arrival.spawn ?? null;
    if (cast && outsideKaufmo) addJaxHallway(room, cast, outsideKaufmo);
    return room;
  });
}

/**
 * Jax and Ribbit for the hall scene: Jax on his mark, glitching, his back
 * to Kaufmo's door (once he's run, he's hidden with his light kept in the
 * scene, dimmed, so it never changes the light count), Ribbit hidden at
 * hers until her beat. Both build their shaders with the room's (warmUp).
 * The scene hooks in through room.storyUpdate.
 */
function addJaxHallway(room, [jaxApi, ribbitApi], outsideKaufmo) {
  const { jax, jaxRun } = hallwayGatheringPlan(room);
  const marks = {
    pomni: outsideKaufmo.clone(),
    jax,
    // From his mark, straight out into the middle of the hall and up it.
    // The gathering's route hugs the left wall, brushing past every door,
    // and the middle also keeps him clear of Pomni, who's by Kaufmo's door.
    jaxRun: jaxRun.map((point, i) => (i ? point.clone().setX(HALL_CENTRE_X) : point)),
    ribbit: new THREE.Vector3(RIBBIT_MARK.x, outsideKaufmo.y, RIBBIT_MARK.z),
  };
  jaxApi.jax.position.copy(jax);
  jaxApi.jax.rotation.y = Math.atan2(jax.x - marks.pomni.x, jax.z - marks.pomni.z); // back turned
  jaxApi.setShown(true);
  jaxApi.setGlitching(true);
  ribbitApi.ribbit.position.copy(marks.ribbit);
  ribbitApi.ribbit.visible = false;
  room.group.add(jaxApi.jax, ribbitApi.ribbit);
  room.jaxHallway = { jaxApi, ribbitApi, marks };

  const warmUp = room.warmUp;
  room.warmUp = (renderer, scene, camera) => {
    warmUp?.(renderer, scene, camera);
    ribbitApi.ribbit.visible = true;
    renderer.compile(scene, camera);
    ribbitApi.ribbit.visible = false;
  };
  const update = room.update;
  room.update = (deltaSeconds, playerPosition) => {
    update?.(deltaSeconds, playerPosition);
    jaxApi.update(deltaSeconds);
    ribbitApi.update(deltaSeconds);
    room.storyUpdate?.(deltaSeconds, playerPosition);
  };
}

/**
 * Kaufmo's and Ribbit's doors carry their old "abstracted" icons (red
 * crosses over their faces); both are in the game and fine, so their decals
 * get the same 2D portrait the dialogue box shows instead.
 */
function useDialogueIcons(group) {
  const loader = new THREE.TextureLoader();
  for (const name of DIALOGUE_ICON_DOORS) {
    const decal = group.getObjectByName(name);
    const url = ICONS[name.toLowerCase()];
    if (!decal?.isMesh || !url) continue;
    const material = decal.material.clone();
    decal.material = material;
    loader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; // glTF UVs, like the baked icon it replaces
      texture.anisotropy = material.map?.anisotropy ?? 1;
      material.map = texture;
      material.needsUpdate = true;
    });
  }
}

/**
 * Mirrors and shadow-casting lights are the expensive parts of a room:
 * each re-renders the whole scene (hall and all) every frame. A connected
 * room only runs them while someone could see it — Pomni is inside, or
 * near its open door. Shadows are frozen rather than switched off, since
 * toggling castShadow would recompile every material mid-walk.
 *
 * Since they start off, their shaders would otherwise first be built the
 * moment the door opens — a mirror renders into a texture, which needs its
 * own build of every material in the scene, freezing the game for seconds.
 * room.warmUp (called by main.js under the loading screen) does it then.
 */
function onlyRenderWhenSeen(room, guest, control, roomBounds, doorway) {
  const reflectors = guest.reflectors ?? [];
  const shadowLights = [];
  guest.group.traverse((child) => { if (child.isLight && child.castShadow) shadowLights.push(child); });
  if (reflectors.length === 0 && shadowLights.length === 0) return;

  const show = (seen) => {
    for (const reflector of reflectors) reflector.visible = seen;
    for (const light of shadowLights) light.shadow.autoUpdate = seen;
  };

  const update = room.update;
  room.update = (deltaSeconds, playerPosition) => {
    update?.(deltaSeconds, playerPosition);
    if (!playerPosition) return;
    show(roomBounds.containsPoint(playerPosition)
      || (control.isOpen && playerPosition.distanceTo(doorway) < VIEW_RANGE));
  };

  const warmUp = room.warmUp;
  room.warmUp = (renderer, scene, camera) => {
    warmUp?.(renderer, scene, camera);
    show(true);
    // Draws the shadow maps (and compiles their depth shaders).
    renderer.render(scene, camera);
    // Every material, as drawn into a mirror's texture. Building the
    // shaders isn't enough: the graphics driver only finishes each one the
    // first time something is actually drawn with it into that kind of
    // texture, so draw the whole scene into one — nothing culled, so
    // whatever the mirror later shows has been drawn once.
    const culled = [];
    scene.traverse((child) => {
      if (child.frustumCulled) {
        culled.push(child);
        child.frustumCulled = false;
      }
    });
    const target = renderer.getRenderTarget();
    for (const reflector of reflectors) {
      renderer.setRenderTarget(reflector.getRenderTarget());
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
    }
    renderer.setRenderTarget(target);
    for (const child of culled) child.frustumCulled = true;
    show(false);
  };
}

/** Flips a door leaf end for end across its own width, knob and all. */
function mirrorLeaf(slab) {
  if (!slab) return;
  slab.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(slab);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const flip = size.x >= size.z ? [-1, 1, 1] : [1, 1, -1];
  const world = new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z)
    .multiply(new THREE.Matrix4().makeScale(...flip))
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    .multiply(slab.matrixWorld);
  world.premultiply(slab.parent.matrixWorld.clone().invert()).decompose(slab.position, slab.quaternion, slab.scale);
  slab.updateMatrixWorld(true);
}

/**
 * A walk-in door (WALK_IN_ROOMS), opened with E like the others, as main.js
 * needs it to walk Pomni through into the room: whether it's open, where
 * it is, and when she's stepped past it. `hallSide` is any point out in the
 * hall; `parts` are the door's frame and leaf.
 */
function walkInDoorway(frameBox, hallSide, control, parts) {
  const size = frameBox.getSize(new THREE.Vector3());
  const centre = frameBox.getCenter(new THREE.Vector3());
  const axis = size.x < size.z ? 'x' : 'z';
  const wide = axis === 'x' ? 'z' : 'x';
  const inward = hallSide[axis] < centre[axis] ? 1 : -1; // into the room
  const into = new THREE.Vector3();
  into[axis] = inward;
  return {
    control,
    into,
    parts,
    /** The doorway's floor, centre. */
    sill: sill(frameBox),
    centre,
    /**
     * The hall's wall line here; her room, shown behind it, is clipped to
     * its far side. Set a little into the room: her walls sit right on the
     * line and would otherwise flicker through the hall's as thin dashes.
     * (Kaufmo's room sits wholly behind the wall as it is.)
     */
    wallPlane: new THREE.Plane(into.clone(), -centre[axis] * inward - 0.15),
    /** How far a point is past the doorway, into the room. */
    depthPast: (point) => (point[axis] - centre[axis]) * inward,
    crossed: (point) => (point[axis] - centre[axis]) * inward > 0
      && Math.abs(point[wide] - centre[wide]) < size[wide] / 2,
  };
}
