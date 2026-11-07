import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Interaction } from '../src/input/interaction';
import { nearestCard, placementTarget, pulse } from '../src/input/targeting';
import type { Arena, Hit } from '../src/world/arena';

function card(id: string, x = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.009));
  mesh.position.x = x; mesh.userData.hit = { type: 'card', cardId: id }; mesh.updateMatrixWorld(true); return mesh;
}
function zone(x = 0, z = -2) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.025, 0.71));
  mesh.position.set(x, 0.88, z); mesh.userData.hit = { type: 'zone', owner: 0, index: 0, row: 'monster' }; mesh.updateMatrixWorld(true); return mesh;
}
function fixture() {
  const controllers = [new THREE.Group(), new THREE.Group()];
  const scene = new THREE.Scene(); controllers.forEach(c => scene.add(c));
  const xr = new THREE.EventDispatcher() as THREE.EventDispatcher<any> & { isPresenting: boolean; getSession(): undefined };
  xr.isPresenting = true; xr.getSession = () => undefined;
  const interactive: THREE.Object3D[] = [];
  const zones = [zone()]; scene.add(...zones);
  let rayHit: THREE.Object3D | undefined;
  const drops: { id: string; hit: Hit | null }[] = [];
  const previews: { valid: boolean; zone?: THREE.Mesh }[] = [];
  let accepted = true;
  const pointerEvents=new Map<string,(event:any)=>void>();
  const camera=new THREE.PerspectiveCamera(46,1,.035,100);camera.position.set(0,3,0);camera.lookAt(0,.88,-2);camera.updateMatrixWorld(true);
  const arena = {
    renderer: { xr, domElement: { addEventListener(type:string,handler:(event:any)=>void) {pointerEvents.set(type,handler);},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}) } }, camera,controllers, interactive, zones,
    raycast: () => rayHit ? { object: rayHit, distance: 2 } : undefined,
    detachCard(object: THREE.Object3D) { interactive.splice(interactive.indexOf(object), 1); },
    releaseCard(object: THREE.Object3D) { object.removeFromParent(); },
    showPlacementPreview(_key: object, zone: THREE.Mesh | undefined, _id: string, valid: boolean) { previews.push({ valid, zone }); },
    clearPlacementPreviews() {}, setControllerRay() {},
  } as unknown as Arena;
  const input = new Interaction(arena);
  input.onDrop = (id, hit) => { drops.push({ id, hit }); return accepted; };
  input.getPlacementFeedback = () => ({ ok: accepted, message: accepted ? 'Ready' : 'Blocked' });
  const fire = (controller: THREE.Object3D, type: string, data?: unknown) => controller.dispatchEvent({ type, data } as never);
  return { input, controllers, scene, interactive, zones, xr, drops, previews, fire,
    click(){const event={clientX:50,clientY:50};pointerEvents.get('pointerdown')!(event);pointerEvents.get('pointerup')!(event);},
    aimAt(object?: THREE.Object3D) { rayHit = object; }, setAccepted(value: boolean) { accepted = value; } };
}

test('near-grab uses card edges and excludes unavailable or distant cards', () => {
  const a = card('a'), b = card('b', 1);
  assert.equal(nearestCard([a, b], new THREE.Vector3(0.23, 0, 0)), a);
  assert.equal(nearestCard([a, b], new THREE.Vector3(0.5, 0, 0)), undefined);
  assert.equal(nearestCard([b], new THREE.Vector3()), undefined);
});

test('desktop clicks can select a spell target or table action in front of a field zone',()=>{
 const f=fixture();f.xr.isPresenting=false;f.input.getSelectedCard=()=> 'rush';
 const unit=new THREE.Object3D();unit.userData.hit={type:'unit',owner:0,index:1};
 const action=new THREE.Object3D();action.userData.hit={type:'action',action:'end'};
 const hits:Hit[]=[];f.input.onHit=hit=>hits.push(hit);
 f.aimAt(unit);f.click();assert.equal(hits[0].type,'unit');assert.equal(hits[0].index,1);
 f.aimAt(action);f.click();assert.equal(hits[1].action,'end');
 f.aimAt(undefined);f.click();assert.equal(hits[2].type,'zone');
});

test('physical placement takes priority over ray placement, with a six-meter reach limit', () => {
  const physical = zone(1, -2), distant = zone(0, -4);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -2.12, -4).normalize());
  assert.equal(placementTarget([physical, distant], new THREE.Vector3(1, 1.1, -2), ray), physical);
  assert.equal(placementTarget([physical, distant], null, ray), distant);
  const tooFar = zone(0, -10);
  ray.ray.direction.set(0, -2.12, -10).normalize();
  assert.equal(placementTarget([tooFar], null, ray), undefined);
});

test('trigger release does not drop a grip-held card', () => {
  const f = fixture(), a = card('a'); f.scene.add(a); f.interactive.push(a);
  f.fire(f.controllers[0], 'squeezestart'); assert.equal(f.input.isHeld('a'), true);
  f.fire(f.controllers[0], 'selectend'); assert.equal(f.drops.length, 0);
  f.fire(f.controllers[0], 'squeezeend'); assert.equal(f.drops.length, 1); assert.equal(f.input.isHeld('a'), false);
});

test('each controller can hold a separate card, but cannot steal the same held card', () => {
  const f = fixture(), a = card('a'), b = card('b', 1); f.scene.add(a, b); f.interactive.push(a, b);
  f.fire(f.controllers[0], 'selectstart');
  f.fire(f.controllers[1], 'selectstart'); assert.equal(f.input.isHeld('b'), false);
  f.controllers[1].position.x = 1; f.fire(f.controllers[1], 'squeezestart');
  assert.equal(f.input.isHeld('a'), true); assert.equal(f.input.isHeld('b'), true);
  f.fire(f.controllers[0], 'selectend'); assert.equal(f.input.isHeld('b'), true);
  f.fire(f.controllers[1], 'squeezeend'); assert.deepEqual(f.drops.map(d => d.id), ['a', 'b']);
});

test('drop uses the release pose and current legality rather than a stale valid preview', () => {
  const f = fixture(), a = card('a'); f.scene.add(a); f.interactive.push(a);
  f.fire(f.controllers[0], 'selectstart');
  f.controllers[0].position.set(0, 1, -2); f.input.update();
  assert.ok(f.previews.some(p => p.zone === f.zones[0] && p.valid));
  f.setAccepted(false); f.input.update();
  assert.ok(f.previews.some(p => p.zone === f.zones[0] && !p.valid));
  f.controllers[0].position.set(3, 1, 2); f.fire(f.controllers[0], 'selectend');
  assert.equal(f.drops[0].hit, null);
});

test('tracking loss and session end return each held card only once', () => {
  const f = fixture(), a = card('a'); f.scene.add(a); f.interactive.push(a);
  f.fire(f.controllers[0], 'selectstart'); f.controllers[0].visible = false; f.input.update();
  f.xr.dispatchEvent({ type: 'sessionend' }); f.fire(f.controllers[0], 'selectend');
  assert.deepEqual(f.drops, [{ id: 'a', hit: null }]);
});

test('haptic support is optional and promise failures are contained', async () => {
  pulse(undefined, 1, 50);
  pulse({ pulse() { throw new Error('disconnected'); } }, 1, 50);
  pulse({ pulse: () => Promise.reject(new Error('unsupported')) }, 1, 50);
  let values: number[] = [];
  pulse({ pulse: async (intensity, duration) => { values = [intensity, duration]; return true; } }, 3, 500);
  await Promise.resolve(); assert.deepEqual(values, [1, 150]);
});

test('haptic setting silences all controller pulses', () => {
  const f = fixture(), a = card('a'); f.scene.add(a); f.interactive.push(a);
  let calls = 0;
  f.fire(f.controllers[0], 'connected', { gamepad: { hapticActuators: [{ pulse: async () => { calls++; return true; } }] } });
  f.input.setHaptics(false); f.fire(f.controllers[0], 'selectstart'); f.fire(f.controllers[0], 'selectend');
  assert.equal(calls, 0);
});

test('presentation lock prevents grabbing while reset and feedback table buttons remain reachable', () => {
  const f=fixture(),a=card('a');f.scene.add(a);f.interactive.push(a);f.input.canGrab=()=>false;
  f.fire(f.controllers[0],'selectstart');assert.equal(f.input.isHeld('a'),false);
  const button=new THREE.Object3D();button.userData.hit={type:'action',action:'reset'};
  f.aimAt(button);let action='';f.input.onHit=hit=>{action=hit.action??'';};
  f.fire(f.controllers[0],'selectstart');assert.equal(action,'reset');
});
