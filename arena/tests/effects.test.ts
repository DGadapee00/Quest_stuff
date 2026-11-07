import{test}from'node:test';import assert from'node:assert/strict';import * as T from'three';import{ArenaEffects}from'../src/world/effects';
function canvasDocument(t:{after(fn:()=>void):void}){
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},fillText(){}})})}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');});
}
test('combat emitters stay bounded after many simultaneous effects and release transient geometry',t=>{
 canvasDocument(t);const effects=new ArenaEffects(),baseline=effects.group.children.length;
 for(let i=0;i<100;i++){effects.burst(new T.Vector3(0,1,0),'#ffaa88',80);effects.shatter(new T.Vector3(0,1.5,0),'#99ddaa');effects.projectile(new T.Vector3(0,1,1),new T.Vector3(0,1,-1),'dragon');effects.ring(new T.Vector3(0,1,0),'#aaffdd');effects.text(new T.Vector3(0,2,0),'400');}
 assert.ok(effects.activeParticles<=480);assert.ok(effects.activeShards<=72);assert.ok(effects.group.children.length<=baseline+12);
 for(let i=0;i<60;i++)effects.update(.05);assert.equal(effects.activeParticles,0);assert.equal(effects.activeShards,0);assert.equal(effects.group.children.length,baseline);
 effects.clear();assert.equal(effects.activeParticles,0);assert.equal(effects.activeShards,0);
});
test('reduced motion keeps particles spatially stable while still completing effects',t=>{
 canvasDocument(t);const effects=new ArenaEffects();effects.burst(new T.Vector3(1,2,3),'#ffaa88',1);
 const points=effects.group.children.find(o=>o instanceof T.Points)as T.Points;const before=Array.from(points.geometry.attributes.position.array);
 effects.update(.05,true);assert.deepEqual(Array.from(points.geometry.attributes.position.array),before);
 for(let i=0;i<30;i++)effects.update(.05,true);assert.equal(effects.activeParticles,0);
});
