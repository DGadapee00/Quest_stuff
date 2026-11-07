import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {CardBody,collideCards} from '../src/physics/card-body';
const flat=new T.Quaternion().setFromEuler(new T.Euler(-Math.PI/2,0,0));
const step=(body:CardBody,seconds:number,dt=1/120)=>{for(let t=0;t<seconds;t+=dt)body.update(dt);};
function body(){const b=new CardBody();b.setHome(new T.Vector3(0,1.06,3.48),flat,true);return b;}

test('thrown card collides with the playing surface without tunneling',()=>{
 const b=body();let contact=0;b.onContact=()=>contact++;
 b.throw(new T.Vector3(0,1.4,0),flat,new T.Vector3(.3,-4,0),new T.Vector3());
 step(b,.2);assert.ok(b.position.y>=.88);assert.ok(contact>=1);assert.equal(b.mode,'free');
});
test('a dropped card off the table contacts the floor and always returns to its hand',()=>{
 const b=body();b.throw(new T.Vector3(4,.5,1),flat,new T.Vector3(1,-2,0),new T.Vector3(2,3,1));
 for(let i=0;i<100;i++){b.update(1/120);assert.ok(b.position.y>=.015);}
 step(b,4);assert.equal(b.mode,'rest');assert.ok(b.position.distanceTo(b.home)<.001);assert.ok(b.rotation.angleTo(b.homeRotation)<.001);
});
test('legal placement spring settles exactly with finite energy',()=>{
 const b=body();b.throw(new T.Vector3(1,1.5,1),flat,new T.Vector3(4,2,1),new T.Vector3(3,4,2));
 b.setHome(new T.Vector3(1.65,.916,.92),flat);b.snap();step(b,3);
 assert.equal(b.mode,'rest');assert.ok(b.position.distanceTo(b.home)<.001);assert.equal(b.velocity.length(),0);
});
test('changing stance rotates a resting card even when its field position is unchanged',()=>{
 const b=body(),position=b.position.clone(),defense=flat.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2));
 b.setHome(position,defense);assert.equal(b.mode,'return');b.update(1/120);
 assert.ok(b.rotation.angleTo(defense)>0.1,'stance rotation eases rather than jumping in one frame');
 step(b,2);assert.equal(b.mode,'rest');assert.ok(b.position.distanceTo(position)<1e-6);assert.ok(b.rotation.angleTo(defense)<0.001);
});
test('fixed-step motion agrees across 60 and 120 Hz and ignores non-finite deltas',()=>{
 const a=body(),b=body();for(const x of[a,b])x.throw(new T.Vector3(0,2,0),flat,new T.Vector3(.4,0,.2),new T.Vector3());
 for(let i=0;i<30;i++)a.update(1/60);for(let i=0;i<60;i++)b.update(1/120);
 assert.ok(a.position.distanceTo(b.position)<1e-6);const position=a.position.clone();a.update(NaN);a.update(Infinity);assert.deepEqual(a.position,position);
});
test('colliding airborne cards separate and resting inventory cards are unaffected',()=>{
 const a=body(),b=body();a.throw(new T.Vector3(0,1,0),flat,new T.Vector3(1,0,0),new T.Vector3());b.throw(new T.Vector3(.05,1,0),flat,new T.Vector3(-1,0,0),new T.Vector3());
 collideCards(a,b);assert.ok(a.position.distanceTo(b.position)>=.159);assert.ok(a.velocity.x<b.velocity.x);
 b.mode='rest';const pos=b.position.clone();collideCards(a,b);assert.deepEqual(b.position,pos);
});
test('throw speed is bounded and a missing zone never loses a card',()=>{
 const b=body();b.throw(new T.Vector3(5,3,5),flat,new T.Vector3(100,30,10),new T.Vector3(100,100,0));
 assert.ok(b.velocity.length()<=6.0001);assert.ok(b.angularVelocity.length()<=12.0001);step(b,5);assert.equal(b.mode,'rest');
});
