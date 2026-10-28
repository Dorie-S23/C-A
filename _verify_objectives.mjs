import assert from 'node:assert/strict';
import { createObjectiveController } from './src/game/objectives.js';
import { createObjectiveHUD, shouldShowObjective } from './src/ui/objectiveHUD.js';

const objectives = createObjectiveController(); let notifications = 0;
const unsubscribe = objectives.subscribe(() => notifications++);
assert.equal(objectives.active, null);
assert.equal(objectives.activate('find-caine'), true);
assert.equal(objectives.active.title, 'Find Caine');
assert.equal(Object.isFrozen(objectives.active), true);
assert.equal(objectives.activate('find-caine'), false);
assert.equal(notifications, 2);
assert.throws(() => objectives.activate('missing'), /Unknown objective/);
assert.equal(objectives.active.id, 'find-caine');
console.log('PASS No default objective; activation is immutable, validated and idempotent');
assert.equal(objectives.complete('find-ribbit'), false);
assert.equal(objectives.complete('find-caine'), true);
assert.equal(objectives.isComplete('find-caine'), true);
assert.equal(objectives.active, null);
assert.equal(objectives.activate('find-caine'), false);
assert.equal(objectives.activate('find-ribbit'), true);
assert.equal(objectives.active.title, 'Find Ribbit');
objectives.reset();
assert.equal(objectives.active, null); assert.equal(objectives.isComplete('find-caine'), false);
unsubscribe(); const before = notifications; objectives.activate('find-caine'); assert.equal(notifications, before);
console.log('PASS Future objectives, completion, new-game reset and subscription cleanup');

const gameplay = {session:true, room:{}, ready:true, locked:true, paused:false, cinematic:false, dialogue:false, menu:false};
assert.equal(shouldShowObjective(gameplay), true);
for(const [key,value] of Object.entries({session:false,room:null,ready:false,locked:false,paused:true,cinematic:true,dialogue:true,menu:true})) {
 assert.equal(shouldShowObjective({...gameplay,[key]:value}), false, key);
}
console.log('PASS HUD policy hides during cinematics, conversations, menus, pause, loading and previews');

const title = {textContent:''}, detail = {textContent:'',hidden:false};
const classes = new Set();
const root = {hidden:false,querySelector: selector => selector.includes('title') ? title : detail,
 classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)}}};
objectives.reset(); const hud = createObjectiveHUD({objectives,root});
hud.update(gameplay); assert.equal(root.hidden, true);
objectives.activate('find-caine'); assert.equal(root.hidden, false); assert.equal(title.textContent, 'Find Caine');
assert.equal(detail.hidden, false);
hud.update({...gameplay,dialogue:true}); assert.equal(root.hidden,true);
assert.equal(objectives.active.id,'find-caine');
hud.update(gameplay,true); assert.equal(root.hidden,false); assert.ok(classes.has('objective-hud--with-minimap'));
let presentationNotifications = 0;
const stopWatching = objectives.subscribe(() => presentationNotifications++);
hud.update(gameplay, true, { title: 'Return to Kaufmo', detail: 'Deliver the photos before time runs out.' });
assert.equal(title.textContent, 'Return to Kaufmo');
assert.equal(objectives.active.id, 'find-caine');
assert.equal(presentationNotifications, 1, 'Presentation must not notify/reset objective subscribers');
hud.update(gameplay); assert.equal(title.textContent, 'Find Caine');
stopWatching();
hud.hide(); assert.equal(root.hidden,true); assert.equal(objectives.active.id,'find-caine');
hud.update(gameplay,false); assert.equal(root.hidden,false); assert.equal(classes.size,0);
objectives.reset(); assert.equal(root.hidden,true); assert.equal(title.textContent,'');
objectives.activate('find-ribbit'); assert.equal(title.textContent,'Find Ribbit'); assert.equal(detail.hidden,false);
assert.ok(detail.textContent.includes('Knock'));
hud.dispose(); assert.equal(root.hidden,true); objectives.reset(); assert.equal(title.textContent,'Find Ribbit');
console.log('PASS HUD renders active state, preserves it while hidden, avoids minimap and releases subscription');

const standaloneHUD = createObjectiveHUD({ objectives, root });
const mazePresentation = { title: 'Find Jax’s keepsakes', detail: 'Find both items, then approach Jax.' };
let standaloneNotifications = 0;
const stopStandalone = objectives.subscribe(() => standaloneNotifications++);
standaloneHUD.update(gameplay, false, mazePresentation);
assert.equal(root.hidden, false); assert.equal(title.textContent, mazePresentation.title);
assert.equal(detail.textContent, mazePresentation.detail);
assert.equal(objectives.active, null);
assert.equal(standaloneNotifications, 1, 'Maze guidance must not activate a campaign objective or reset Level 2 time');
for (const [key, value] of Object.entries({ ready: false, locked: false, paused: true, cinematic: true, dialogue: true, menu: true })) {
  standaloneHUD.update({ ...gameplay, [key]: value }, false, mazePresentation);
  assert.equal(root.hidden, true, key);
}
standaloneHUD.update(gameplay); assert.equal(root.hidden, true); assert.equal(title.textContent, '');
stopStandalone(); standaloneHUD.dispose();
console.log('PASS Standalone maze guidance respects HUD gates without changing checkpoint objectives');
