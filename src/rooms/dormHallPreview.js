import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const DORM_PREVIEW_URL = './models/world/dorm-hall-v7.glb';
export const DORM_PREVIEW_POSITION = Object.freeze([-38.7556795329, -.0060309172, 6.9378740627]);
const DOOR_Z = -40.156523583456874;
// Clip at the bedroom's exterior wall/floor edge: no second floor underneath it.
const REGION = new THREE.Box3(new THREE.Vector3(3.325169447809458 - DORM_PREVIEW_POSITION[2], -.1, DOOR_Z - 12),
  new THREE.Vector3(3.9, 7.5, DOOR_Z + 12));
const EXCLUDED = new Set(['Door_Slab068', 'Plane_36', 'Plane_37', 'Pomni', 'Door_Frame068']);

function resources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}
function release(unused, retained = { geometries: new Set(), materials: new Set(), textures: new Set() }) {
  const images = new Set([...retained.textures].map(t => t.source?.data));
  const closed = new Set();
  for (const g of unused.geometries) if (!retained.geometries.has(g)) { g.disposeBoundsTree?.(); g.dispose(); }
  for (const m of unused.materials) if (!retained.materials.has(m)) m.dispose();
  for (const t of unused.textures) if (!retained.textures.has(t)) {
    t.dispose();
    const image = t.source?.data;
    if (!images.has(image) && !closed.has(image)) { image?.close?.(); closed.add(image); }
  }
}

/** Crop only runtime geometry, retaining the original node transforms and UVs. */
function cropMesh(mesh) {
  const source = mesh.geometry;
  const attributes = Object.entries(source.attributes);
  const output = Object.fromEntries(attributes.map(([key]) => [key, []]));
  const geometry = new THREE.BufferGeometry();
  const index = source.index;
  const vertex = i => ({
    p: new THREE.Vector3().fromBufferAttribute(source.attributes.position, i).applyMatrix4(mesh.matrixWorld),
    values: Object.fromEntries(attributes.map(([key, a]) => [key, Array.from({length: a.itemSize}, (_, n) => a.getComponent(i, n))])),
  });
  const mix = (a,b,t) => ({p:a.p.clone().lerp(b.p,t), values:Object.fromEntries(attributes.map(([key]) =>
    [key, a.values[key].map((v,n) => THREE.MathUtils.lerp(v,b.values[key][n],t))]))});
  const planes = [p=>p.x-REGION.min.x,p=>REGION.max.x-p.x,p=>p.z-REGION.min.z,p=>REGION.max.z-p.z];
  const count = index?.count ?? source.attributes.position.count;
  for (let i=0;i<count;i+=3) {
    let poly=[0,1,2].map(n=>vertex(index ? index.getX(i+n) : i+n));
    for (const distance of planes) {
      const result=[];
      for(let n=0;n<poly.length;n++) {
        const a=poly[n],b=poly[(n+1)%poly.length],da=distance(a.p),db=distance(b.p);
        if(da>=0)result.push(a);
        if((da>=0)!==(db>=0))result.push(mix(a,b,da/(da-db)));
      }
      poly=result;if(!poly.length)break;
    }
    const start=output.position.length/3;
    for(let n=1;n<poly.length-1;n++) for(const v of [poly[0],poly[n],poly[n+1]])
      for(const [key] of attributes)output[key].push(...v.values[key]);
    const emitted=output.position.length/3-start;
    if(emitted) {
      const material=source.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0;
      const last=geometry.groups.at(-1);
      if(last&&last.materialIndex===material&&last.start+last.count===start)last.count+=emitted;
      else geometry.addGroup(start,emitted,material);
    }
  }
  if(!output.position.length) {geometry.dispose();return null;}
  for(const [key] of attributes)geometry.setAttribute(key,new THREE.Float32BufferAttribute(output[key],source.attributes[key].itemSize));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

/** Takes exclusive ownership of a freshly parsed GLTF; no cross-room GPU cache. */
export function createDormHallPreview(gltf, timing = {}) {
  const buildStart=performance.now(), root=gltf.scene, original=resources(root);
  root.updateMatrixWorld(true);
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o)});
  let sourceTriangles=0;
  for(const mesh of meshes)sourceTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
  for(const mesh of meshes) {
    const box=new THREE.Box3().setFromObject(mesh);
    let excluded=false;for(let o=mesh;o&&o!==root;o=o.parent)if(EXCLUDED.has(o.name))excluded=true;
    if(excluded||!REGION.intersectsBox(box)) {mesh.removeFromParent();continue;}
    if(!REGION.containsBox(box)) {
      const cropped=cropMesh(mesh);
      if(!cropped){mesh.removeFromParent();continue;}
      mesh.geometry=cropped;
    }
    // The view adds no lights or shadow passes; bedroom mirrors remain enabled.
    mesh.castShadow=false;mesh.receiveShadow=true;
  }
  // Empty source groups can retain duplicate door names despite having no meshes.
  const empty=[];root.traverse(o=>{if(EXCLUDED.has(o.name))empty.push(o)});empty.forEach(o=>o.removeFromParent());
  const groups=[];root.traverse(o=>{if(o!==root&&!o.isMesh)groups.push(o)});
  groups.reverse().forEach(o=>{if(!o.children.length)o.removeFromParent()});
  const retained=resources(root);release(original,retained);
  const group=new THREE.Group();group.name='DormHallPreview';group.rotation.y=-Math.PI/2;
  group.position.fromArray(DORM_PREVIEW_POSITION);group.add(root);group.visible=false;group.updateMatrixWorld(true);
  const previewMeshes=[];group.traverse(o=>{if(o.isMesh)previewMeshes.push(o)});
  const metrics={...timing,sourceTriangles,meshes:previewMeshes.length,
    triangles:previewMeshes.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),
    textures:retained.textures.size,buildMilliseconds:performance.now()-buildStart};
  let disposed=false;
  const controller={group,meshes:previewMeshes,metrics,
    setVisible(value){if(!disposed)group.visible=value;},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();release(retained);},
  };
  if(metrics.triangles>80000||!previewMeshes.length){controller.dispose();throw new Error('Hall preview exceeds its geometry budget');}
  return controller;
}

/** HTTP cache is reused by fetch; scene resources are owned by this room only. */
export async function loadDormHallPreview() {
  const start=performance.now(),abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),12000);
  let gltf;
  try {
    const url=new URL(DORM_PREVIEW_URL,document.baseURI);
    const response=await fetch(url,{signal:abort.signal});
    if(!response.ok)throw new Error('Hall preview HTTP '+response.status);
    const data=await response.arrayBuffer(),downloadEnd=performance.now();
    gltf=await new GLTFLoader().parseAsync(data,new URL('.',url).href);
    const parsed=performance.now();
    if(abort.signal.aborted){release(resources(gltf.scene));throw new Error('Hall preview load exceeded 12 seconds');}
    const preview=createDormHallPreview(gltf,{sourceBytes:data.byteLength,
      downloadMilliseconds:downloadEnd-start,parseMilliseconds:parsed-downloadEnd});
    preview.metrics.loadMilliseconds=performance.now()-start;
    if(preview.metrics.loadMilliseconds>12000){preview.dispose();throw new Error('Hall preview preparation exceeded 12 seconds');}
    const transfer=performance.getEntriesByName?.(url.href)?.at(-1);
    preview.metrics.transferBytes=transfer?.transferSize ?? null;
    return preview;
  } finally {clearTimeout(timeout);}
}
