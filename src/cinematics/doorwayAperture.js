import * as THREE from 'three';

/** The exported bedroom has a solid wall behind its decorative door.
 * Cut only that rectangle in temporary runtime copies, retaining UVs/materials.
 * Originals are restored when the bedroom session is disposed.
 */
export function createDoorwayAperture(room, panelBox) {
  const replacements = [];
  for (const name of ['Wall', 'Wall002']) {
    const original = room.group.getObjectByName(name);
    if (!original?.isMesh) continue;
    const source = original.geometry.index ? original.geometry.toNonIndexed() : original.geometry.clone();
    const attributes = Object.entries(source.attributes);
    const output = Object.fromEntries(attributes.map(([key]) => [key, []]));
    const vertex = i => ({ world: new THREE.Vector3().fromBufferAttribute(source.attributes.position, i).applyMatrix4(original.matrixWorld),
      values: Object.fromEntries(attributes.map(([key, attr]) => [key, Array.from({length:attr.itemSize},(_,n)=>attr.array[i*attr.itemSize+n])])) });
    const mix = (a,b,t) => ({world:a.world.clone().lerp(b.world,t), values:Object.fromEntries(attributes.map(([key])=>
      [key,a.values[key].map((value,n)=>THREE.MathUtils.lerp(value,b.values[key][n],t))]))});
    const split = (polygon, distance) => {
      const inside=[], outside=[];
      for(let i=0;i<polygon.length;i++) {
        const a=polygon[i], b=polygon[(i+1)%polygon.length], da=distance(a.world), db=distance(b.world);
        (da>=0?inside:outside).push(a);
        if((da>=0)!==(db>=0)) {const p=mix(a,b,da/(da-db));inside.push(p);outside.push(p);}
      }
      return {inside,outside};
    };
    const emit = polygon => {
      for(let i=1;i<polygon.length-1;i++) for(const v of [polygon[0],polygon[i],polygon[i+1]])
        for(const [key] of attributes) output[key].push(...v.values[key]);
    };
    const planes=[p=>p.x-panelBox.min.x,p=>panelBox.max.x-p.x,
      p=>p.y-panelBox.min.y,p=>panelBox.max.y-p.y,
      p=>p.z-(panelBox.min.z-.4),p=>panelBox.max.z+.4-p.z];
    const geometry = new THREE.BufferGeometry();
    for(let i=0;i<source.attributes.position.count;i+=3) {
      let polygon=[vertex(i),vertex(i+1),vertex(i+2)];
      const first=output.position.length/3;
      for(const plane of planes) {
        if(!polygon.length) break;
        const pieces=split(polygon,plane);emit(pieces.outside);polygon=pieces.inside;
      }
      const count=output.position.length/3-first;
      if(count) {
        const materialIndex=source.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0;
        const last=geometry.groups.at(-1);
        if(last && last.materialIndex===materialIndex && last.start+last.count===first)last.count+=count;
        else geometry.addGroup(first,count,materialIndex);
      }
    }
    for(const [key,attr] of attributes) geometry.setAttribute(key,new THREE.Float32BufferAttribute(output[key],attr.itemSize,attr.normalized));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); source.dispose();
    const replacement=original.clone(false);replacement.geometry=geometry;replacement.name=name+'CinematicAperture';
    original.parent.add(replacement);replacement.visible=false;
    replacements.push({original,replacement,entries:room.collisionMeshes.filter(e=>e.mesh===original)});
  }
  const setEnabled = enabled => {
    for(const {original,replacement,entries} of replacements) {
      original.visible=!enabled;replacement.visible=enabled;
      for(const entry of entries) {entry.mesh=enabled?replacement:original;entry.box.setFromObject(entry.mesh);
        if(entry.paddedBox)entry.paddedBox.copy(entry.box).expandByScalar(.35);}
    }
  };
  return {setEnabled};
}
