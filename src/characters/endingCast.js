import * as THREE from 'three';
import { createCharacterPerformance } from '../cinematics/characterPerformance.js';
import { disposeObjectResources } from '../rooms/assetLifecycle.js';
import { loadPomni } from './pomni.js';
import { loadJax } from './jax.js';
import { loadRibbit } from './ribbit.js';
import { loadKaufmoTalk } from './kaufmoTalk.js';
import { loadCaine } from './caine.js';
import { loadRagatha } from './ragatha.js';
import { loadKinger } from './kinger.js';
import { loadGangle } from './gangle.js';
import { loadZooble } from './zooble.js';

const DEFAULT_LOADERS = {
  pomni: loadPomni, jax: loadJax, ribbit: loadRibbit, kaufmo: loadKaufmoTalk,
  caine: loadCaine, ragatha: loadRagatha, kinger: loadKinger,
  gangle: loadGangle, zooble: loadZooble,
};
const ROOT_KEYS = {
  pomni: 'pomni', jax: 'jax', ribbit: 'ribbit', kaufmo: 'kaufmo', caine: 'caine',
  ragatha: 'ragatha', kinger: 'kinger', gangle: 'gangle', zooble: 'zooble',
};

function nativeAdapter(key, api, stage) {
  const native = {
    update: key === 'pomni' ? null : api.update,
    breathing: Boolean(api.update),
    turns: Boolean(api.faceTowards),
    faceTowards: api.faceTowards,
    dispose: api.dispose,
  };
  if (key === 'ragatha') {
    native.headLook = true;
    native.lookTowards = point => api.lookTowards(point);
    native.moveTo = (point, { speed, onArrive }) => api.moveTo(point, { speed, onArrive });
    native.cancelMotion = api.stopMovement;
    native.onAction = action => api.setPose(action === 'gesture:wave' ? 'wave'
      : action === 'comfort' || action.startsWith('react:') ? 'worried' : 'idle');
  } else if (key === 'kaufmo') {
    native.onAction = action => {
      api.setListening(false);
      api.setSpeaking(false);
      if (action === 'walk' || action === 'run') api.setActivity('walk');
      else if (action === 'clutch') api.setActivity('clutch');
      else {
        api.setActivity(null);
        api.setPose(action === 'comfort' ? 'sad' : action.startsWith('react:') ? 'shocked' : 'neutral');
      }
    };
  } else if (key === 'caine') {
    native.headLook = true;
    native.lookTowards = point => api.turnTowards(point);
    native.onAction = action => api.setPose(action === 'comfort' ? 'worried'
      : action.startsWith('react:') ? 'shocked' : 'happy');
  } else if (key === 'ribbit') {
    native.onAction = action => {
      if (action === 'idle' || action === 'walk' || action === 'run') api.setPose('standing');
      api.setDistress(action.startsWith('react:') ? 1 : 0);
    };
  } else if (key === 'jax') {
    native.moveTo = (point, { speed, style, onArrive }) => {
      const from = api.jax.position.clone();
      const duration = Math.max(0.01, from.distanceTo(point) / speed);
      api.playPassBy(from, point, duration, { style: style === 'run' ? 'run' : 'sly', stay: true });
      native.arrived = onArrive;
    };
    native.isMoving = () => {
      if (api.isRunning()) return true;
      const arrived = native.arrived;
      native.arrived = null;
      arrived?.(true);
      return false;
    };
    native.onAction = action => {
      if (action === 'idle') api.setDistressed(false);
    };
  } else if (key === 'pomni') {
    native.headLook = true;
    native.lookTowards = point => stage?.lookWithHead(point);
    native.moveTo = (point, { speed, onArrive }) => {
      if (!stage) { onArrive(false); return; }
      stage.walkTo([point], { speed }).then(onArrive);
    };
    native.cancelMotion = () => stage?.reset();
    native.onAction = action => {
      if (action === 'gesture:wave') void stage?.gesture('handOver');
    };
  }
  return native;
}

function makeActor(key, api, { owned = true, stage = null } = {}) {
  const root = api[ROOT_KEYS[key]];
  if (!root) throw new Error(`${key} loader returned no 3D root`);
  const rig = api.rig ? { ...api.rig } : {};
  if (key === 'kinger') rig.prop = api.pillow;
  const performance = createCharacterPerformance({ root, rig, native: nativeAdapter(key, api, stage) });
  return { key, api, root, performance, owned };
}

/**
 * Loads one room-owned ending ensemble. Pomni may be supplied by the player;
 * in that case she is indexed but neither cloned nor disposed with the room.
 */
export async function loadEndingCast({
  endingVariant = 'saved', pomni = null, stage = null, loaders = {}, onProgress,
} = {}) {
  const variant = endingVariant === 'bittersweet' ? 'bittersweet' : 'saved';
  const source = { ...DEFAULT_LOADERS, ...loaders };
  const keys = ['ribbit', 'kaufmo', 'caine', 'ragatha', 'kinger', 'gangle', 'zooble'];
  if (variant === 'saved') keys.push('jax');
  if (!pomni) keys.push('pomni');
  let completed = 0;
  const jobs = keys.map(key => Promise.resolve().then(() => source[key]()).then(api => {
    completed++;
    onProgress?.(completed / keys.length, key);
    return makeActor(key, api);
  }));
  const results = await Promise.allSettled(jobs);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) {
    for (const result of results) if (result.status === 'fulfilled') {
      result.value.performance.dispose();
      disposeObjectResources(result.value.root);
    }
    throw failed.reason;
  }

  const actors = new Map(results.map(result => [result.value.key, result.value]));
  if (pomni) actors.set('pomni', makeActor('pomni', { pomni }, { owned: false, stage }));
  const ensemble = new THREE.Group();
  ensemble.name = 'WayOutEnsembleStaging';
  ensemble.visible = false;
  for (const actor of actors.values()) {
    if (actor.key !== 'jax' && actor.key !== 'pomni') ensemble.add(actor.root);
  }
  actors.get('kinger')?.performance.clutch();
  let disposed = false;

  return {
    variant, actors, ensemble,
    jaxApi: actors.get('jax')?.api ?? null,
    update(deltaSeconds) {
      if (disposed) return;
      for (const actor of actors.values()) actor.performance.update(deltaSeconds);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const actor of actors.values()) actor.performance.dispose();
      actors.clear();
    },
    get diagnostics() {
      return {
        variant, disposed, members: [...actors.keys()],
        actions: Object.fromEntries([...actors].map(([key, actor]) => [key, actor.performance.diagnostics])),
      };
    },
  };
}
