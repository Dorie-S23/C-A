import assert from 'node:assert/strict';
import { createControlsTutorial } from './src/game/controlsTutorial.js';
import { createTutorialHUD } from './src/ui/tutorialHUD.js';

const t = createControlsTutorial();
t.move(5, true); t.look(3); t.interact();
assert.deepEqual(t.hints(), []); assert.equal(t.state.moved, false);
t.enterRoom('dorm'); assert.equal(t.state.complete, false);
console.log('PASS Inputs and room previews cannot unlock tutorial before successful dialogue');
t.unlock();
assert.deepEqual(t.hints(), ['move', 'look']);
for (let i = 0; i < 10000; i++) t.hints();
assert.deepEqual(t.hints(), ['move', 'look']);
t.move(0, true); t.move(NaN, true); t.look(NaN);
assert.equal(t.state.moved, false); assert.equal(t.state.looked, false);
t.move(.4, true); assert.deepEqual(t.hints(), ['look']); assert.equal(t.state.ran, false);
t.look(.06); t.look(-.06); assert.deepEqual(t.hints(), ['run']);
t.move(.2, false); assert.equal(t.state.ran, false);
t.move(.2, true); t.move(.21, true); assert.deepEqual(t.hints(), []);
console.log('PASS Actual movement/look thresholds, no timer advancement, run follows demonstrated basics');
assert.deepEqual(t.hints(true), ['interact']);
t.interact(); assert.deepEqual(t.hints(true), []);
t.enterRoom('dorm'); assert.equal(t.state.complete, true);
t.enterRoom('pomni'); t.unlock(); assert.deepEqual(t.hints(), []);
console.log('PASS Existing E can dismiss contextual hint; Dorm entry finishes without bedroom replay');
t.reset(); t.unlock(); assert.deepEqual(t.hints(true), ['interact']);
t.enterRoom('dorm'); assert.equal(t.state.complete, true); assert.equal(t.state.ran, false);
console.log('PASS Door takes priority; movement/look/run are optional for leaving');
t.reset(); t.unlock(); t.dismiss(); t.enterRoom('pomni'); assert.deepEqual(t.hints(true), []);
t.move(10, true); assert.equal(t.state.moved, false);
t.reset(); assert.equal(t.state.dismissed, false); assert.equal(t.state.unlocked, false);
t.unlock(); assert.deepEqual(t.hints(), ['move', 'look']);
console.log('PASS Dismiss persists across room loads, reset clears it for a new run');

globalThis.document = { createElement: () => ({ textContent: '' }) };
const lines = { children: [], replaceChildren(...children) { this.children = children; } };
const root = { hidden: false, querySelector: () => lines };
const hud = createTutorialHUD({ tutorial: t, root });
const gameplay = { session:true, room:{}, ready:true, locked:true,
  paused:false, cinematic:false, dialogue:false, menu:false };
hud.update(gameplay, false); assert.equal(root.hidden, false);
assert.deepEqual(lines.children.map(l => l.textContent), ['WASD — Move', 'Mouse — Look around']);
for (const [key, value] of Object.entries({session:false, room:null, ready:false, locked:false,
  paused:true, cinematic:true, dialogue:true, menu:true})) {
  hud.update({...gameplay, [key]:value}, false); assert.equal(root.hidden, true, key);
  assert.equal(t.state.moved, false);
}
hud.update(gameplay, true); assert.equal(lines.children[0].textContent, 'Press E — Interact');
hud.hide(); assert.equal(root.hidden, true);
hud.update(gameplay, false); assert.equal(root.hidden, false);
t.dismiss(); hud.update(gameplay, false); assert.equal(root.hidden, true);
console.log('PASS HUD labels, contextual priority and shared overlay/loading/dialogue visibility policy');
delete globalThis.document;
