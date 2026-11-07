import {test} from 'node:test';
import './node-images';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CreatureModels,MODEL_URLS,MODEL_BUDGET,MODEL_FRAME,modelStats,validateModel} from '../src/world/models';
import {CreatureActor} from '../src/world/creature-actor';
import {CATALOG} from '../src/game/duel';
async function load(url:string){
 const bytes=await readFile(new URL(url));assert.ok(bytes.byteLength<=MODEL_BUDGET.maxBytes);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.ok(json.images.every((i:{bufferView?:number;uri?:string})=>i.bufferView!==undefined&&!i.uri),'character textures are embedded for private/offline asset reuse');
 return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer,'');
}

test('all shipped glTFs load, fit the mobile budget and contain usable idle/attack clips',async()=>{
 for(const url of Object.values(MODEL_URLS)){
  const gltf=await load(url);assert.doesNotThrow(()=>validateModel(gltf.scene));
  const stats=modelStats(gltf.scene);assert.ok(stats.meshes<=6);assert.ok(stats.texturePixels>0);assert.ok(stats.texturePixels<=MODEL_BUDGET.maxTexturePixels);
  let skinned=0;gltf.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh){skinned++;assert.ok(o.skeleton.bones.length>=5);assert.ok(o.material);}});assert.ok(skinned>0,'characters use weighted skins, not geometric stand-ins');
  for(const name of ['Idle','Attack','Hit','Defeat']){const clip=gltf.animations.find(a=>a.name===name);assert.ok(clip);assert.ok(clip.tracks.length>0);assert.ok(clip.duration>0);}
 }
});

test('templates load once, normalize to meter scale, and animate independently across clones',async()=>{
 let requests=0;const models=new CreatureModels(async url=>{requests++;return load(url);});
 await Promise.all([models.preload(),models.preload()]);assert.equal(requests,3);
 const first=models.instantiate('dragon','#ffaa66'),second=models.instantiate('dragon','#ffaa66');
 assert.equal(first.fallback,false);assert.notEqual(first.scene,second.scene);
 const frame=MODEL_FRAME.dragon,size=new THREE.Box3().setFromObject(first.scene).getSize(new THREE.Vector3());
 assert.ok(size.y<=frame.height+1e-5);assert.ok(size.x<=frame.width+1e-5);assert.ok(size.z<=frame.depth+1e-5);assert.ok(first.height>=.8);
 const wing=first.scene.getObjectByName('WingLeft')!,otherWing=second.scene.getObjectByName('WingLeft')!;
 const initial=otherWing.quaternion.clone();
 const mixer=new THREE.AnimationMixer(first.scene);mixer.clipAction(first.clips.find(c=>c.name==='Idle')!).play();mixer.update(0.5);
 assert.ok(wing.quaternion.angleTo(initial)>0.05);assert.deepEqual(otherWing.quaternion.toArray(),initial.toArray());
 mixer.stopAllAction();mixer.uncacheRoot(first.scene);
});

test('failed loads are cached and leave an immediately usable procedural creature',async()=>{
 let calls=0;const models=new CreatureModels(async()=>{calls++;throw new Error('offline');});
 const early=models.instantiate('sentinel','#aaccee');assert.equal(early.fallback,true);assert.ok(modelStats(early.scene).meshes>0);
 await models.preload();await models.preload();assert.equal(calls,3);assert.equal(models.failures.size,3);
 assert.equal(models.instantiate('sentinel','#aaccee').fallback,true);
});

test('empty or over-budget imported models are rejected',()=>{
 assert.throws(()=>validateModel(new THREE.Group()));
 const group=new THREE.Group();group.add(new THREE.Mesh(new THREE.SphereGeometry(1,128,128),new THREE.MeshStandardMaterial()));
 assert.throws(()=>validateModel(group),/budget/);
});

test('actors recover from attack/hit, keep their field anchor and defer defeat removal',()=>{
 const actor=new CreatureActor({...CATALOG[0],id:'test'},0,0,new CreatureModels());
 for(let i=0;i<20;i++)actor.update(0.05,false);assert.equal(actor.state,'idle');const anchor=actor.root.position.clone();
 actor.attack(new THREE.Vector3(0,1.7,-3));assert.equal(actor.state,'attack');
 for(let i=0;i<20;i++)actor.update(0.05,false);assert.equal(actor.state,'idle');assert.deepEqual(actor.root.position,anchor);
 actor.hit();for(let i=0;i<8;i++)actor.update(0.05,false);assert.equal(actor.state,'idle');
 actor.defeat();actor.update(0.1,false);assert.equal(actor.defeated,false);
 for(let i=0;i<8;i++)actor.update(0.05,false);assert.equal(actor.defeated,true);actor.dispose();
});

test('disposing one loaded actor preserves shared geometry for the next summon',async()=>{
 const models=new CreatureModels(load);await models.preload();const card={...CATALOG[0],id:'first'};
 const actor=new CreatureActor(card,0,0,models);let disposed=0;
 actor.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry.userData.shared)o.geometry.addEventListener('dispose',()=>disposed++);});
 actor.dispose();assert.equal(disposed,0);
 const next=new CreatureActor({...card,id:'second'},0,1,models);assert.equal(next.fallback,false);next.update(.1,false);next.dispose();
});

test('guard poses keep every textured character grounded within its field framing',async()=>{
 const models=new CreatureModels(load);await models.preload();
 for(const kind of ['dragon','sentinel','wisp']as const){
  const instance=models.instantiate(kind,'#ffffff'),mixer=new THREE.AnimationMixer(instance.scene);
  mixer.clipAction(instance.clips.find(c=>c.name==='Idle')!).play();mixer.update(0);instance.scene.updateMatrixWorld(true);
  instance.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.computeBoundingBox();});
  const bounds=new THREE.Box3().setFromObject(instance.scene),size=bounds.getSize(new THREE.Vector3()),frame=MODEL_FRAME[kind];
  assert.ok(Math.abs(bounds.min.y)<1e-4,`${kind} feet rest on its summon anchor`);
  assert.ok(size.y<=frame.height+1e-4&&size.x<=frame.width+1e-4&&size.z<=frame.depth+1e-4);
  for(const clip of instance.clips)for(const track of clip.tracks){
   assert.ok([...track.values].every(Number.isFinite));
   assert.ok(THREE.PropertyBinding.findNode(instance.scene,THREE.PropertyBinding.parseTrackName(track.name).nodeName),`${track.name} binds to this character`);
  }
  mixer.stopAllAction();mixer.uncacheRoot(instance.scene);
 }
});

test('Dark Magician keeps his feet planted while casting instead of floating or sliding',async()=>{
 const models=new CreatureModels(load);await models.preload();
 const actor=new CreatureActor({...CATALOG[1],id:'caster'},0,0,models);for(let i=0;i<20;i++)actor.update(.05,false);
 const feet=['MMD_004041_LeftFoot','MMD_004041_RightFoot'].map(name=>actor.root.getObjectByName(name)!);
 assert.ok(feet.every(Boolean));const before=feet.map(b=>b.getWorldPosition(new THREE.Vector3()));
 actor.attack(new THREE.Vector3(0,1.7,-3));for(let i=0;i<8;i++)actor.update(.05,false);
 feet.forEach((bone,index)=>assert.ok(bone.getWorldPosition(new THREE.Vector3()).distanceTo(before[index])<1e-5));
 assert.ok(actor.releasePoint().y>actor.root.position.y);actor.dispose();
});

test('disposing a summon leaves cached character textures available for another instance',async()=>{
 const models=new CreatureModels(load);await models.preload();const actor=new CreatureActor({...CATALOG[2],id:'first-skin'},0,0,models);
 const textures=new Set<THREE.Texture>();actor.root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);});
 let disposed=0;assert.ok(textures.size>0);textures.forEach(t=>t.addEventListener('dispose',()=>disposed++));actor.dispose();assert.equal(disposed,0);
 const next=models.instantiate('wisp','#ffffff');let reused=0;next.scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m))if(value instanceof THREE.Texture&&textures.has(value))reused++;});assert.ok(reused>0);
});
