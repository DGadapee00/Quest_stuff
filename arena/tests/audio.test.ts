import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpatialAudio } from '../src/audio/spatial';

function parameter() {
  return { value: 0, setValueAtTime(value: number) { this.value = value; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}
function mockAudio(t: { after(fn: () => void): void }) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const panners: { disconnected: boolean }[] = [];
  const listener = Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'].map(key => [key, parameter()]));
  let contexts = 0;
  class Context {
    currentTime = 0; state = 'running'; destination = {}; listener = listener;
    constructor() { contexts++; }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createPanner() {
      const panner = { disconnected: false, positionX: parameter(), positionY: parameter(), positionZ: parameter(), connect() {}, disconnect() { this.disconnected = true; } };
      panners.push(panner); return panner;
    }
    createOscillator() { return { frequency: parameter(), onended: null, connect() {}, disconnect() {}, start() {}, stop() {} }; }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'AudioContext', original); else Reflect.deleteProperty(globalThis, 'AudioContext'); });
  return { listener, panners, get contexts() { return contexts; } };
}

test('muting before the first gesture creates no audio context', t => {
  const mock = mockAudio(t), audio = new SpatialAudio();
  audio.setEnabled(false); audio.unlock(); audio.play('summon', new THREE.Vector3());
  assert.equal(mock.contexts, 0);
});

test('rapid effects stay bounded and muting disconnects every active emitter', t => {
  const mock = mockAudio(t), audio = new SpatialAudio();
  for (let i = 0; i < 20; i++) audio.play('impact', new THREE.Vector3(i, 0, 0));
  assert.equal(mock.contexts, 1); assert.equal(mock.panners.filter(p => !p.disconnected).length, 8);
  audio.setEnabled(false); assert.equal(mock.panners.filter(p => !p.disconnected).length, 0);
  audio.play('summon', new THREE.Vector3()); assert.equal(mock.panners.length, 20);
});

test('headset audio includes rig translation and rotation without mutating the XR camera', t => {
  const mock = mockAudio(t), audio = new SpatialAudio(); audio.unlock();
  const rig = new THREE.Group(); rig.position.set(3, 0, 4); rig.rotation.y = Math.PI / 2; rig.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0.1, 1.6, 0.2); camera.updateMatrix();
  camera.matrixWorld.makeTranslation(123, 456, 789); const before = camera.matrixWorld.clone();
  audio.updateListener(camera, rig);
  const expected = new THREE.Vector3(0.1, 1.6, 0.2).applyMatrix4(rig.matrixWorld);
  assert.ok(Math.abs(mock.listener.positionX.value - expected.x) < 1e-8);
  assert.ok(Math.abs(mock.listener.positionY.value - expected.y) < 1e-8);
  assert.ok(Math.abs(mock.listener.positionZ.value - expected.z) < 1e-8);
  assert.ok(Math.abs(mock.listener.forwardX.value + 1) < 1e-8);
  assert.deepEqual(camera.matrixWorld, before);
});

test('unavailable audio gracefully falls back to silence', t => {
  mockAudio(t); Reflect.deleteProperty(globalThis, 'AudioContext');
  const audio = new SpatialAudio();
  assert.doesNotThrow(() => { audio.unlock(); audio.play('cast', new THREE.Vector3()); audio.updateListener(new THREE.PerspectiveCamera()); });
});
