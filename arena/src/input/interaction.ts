import * as THREE from 'three';
import { Arena, type Hit } from '../world/arena';
import type { PlacementFeedback } from '../game/placement';
import { nearestCard, placementTarget, pulse, type PulseActuator } from './targeting';

type GrabButton = 'trigger' | 'grip';
interface Held { object: THREE.Object3D; cardId: string; button: GrabButton; near:boolean; last:THREE.Vector3; rotation:THREE.Quaternion; velocity:THREE.Vector3; angular:THREE.Vector3 }

/** Both controllers own independent grab/preview state. All moves still go through the rules. */
export class Interaction {
  private ray = new THREE.Raycaster();
  private matrix = new THREE.Matrix4();
  private point = new THREE.Vector3();
  private sample=new THREE.Vector3();
  private localGrip=new THREE.Vector3(0,-.015,-.18);
  private inverseRotation=new THREE.Quaternion();
  private held = new Map<THREE.Object3D, Held>();
  private sources = new Map<THREE.Object3D, XRInputSource>();
  private hoverKeys = new Map<THREE.Object3D, string>();
  private pointer = new THREE.Vector2();
  private pointerInside = false;
  private pointerFeedbackKey = '';
  private pointerKey = {};
  private haptics = true;
  private hoverHitKey='';
  private orientation=new THREE.Quaternion();
  private deltaRotation=new THREE.Quaternion();
  private angularAxis=new THREE.Vector3();
  private targetRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.25,0,0));
  private session?: XRSession;

  canGrab: () => boolean = () => true;
  onHover:(hit:Hit|null)=>void=()=>{};
  onHit: (hit: Hit) => void = () => {};
  onGrab: (cardId: string) => void = () => {};
  onDrop: (cardId: string, zone: Hit | null) => boolean = () => false;
  onGesture: () => void = () => {};
  onPreview: (feedback: PlacementFeedback) => void = () => {};
  getSelectedCard: () => string | null = () => null;
  getPlacementFeedback: (cardId: string, hit: Hit) => PlacementFeedback = () => ({ ok: false, message: 'Choose a matching field zone.' });

  constructor(private arena: Arena) {
    const canvas = arena.renderer.domElement;
    let down = { x: 0, y: 0 };
    const setPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      this.pointerInside = true;
    };
    canvas.addEventListener('pointermove', setPointer);
    canvas.addEventListener('pointerleave', () => { this.pointerInside = false; this.hoverHitKey='';this.onHover(null); this.arena.showPlacementPreview(this.pointerKey, undefined, '', false); });
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', e => {
      if (arena.renderer.xr.isPresenting || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return;
      this.onGesture(); setPointer(e); this.ray.setFromCamera(this.pointer, arena.camera);
      const selected = this.getSelectedCard();
      const first = arena.raycast(this.ray)?.object.userData.hit as Hit | undefined;
      const zone = selected ? placementTarget(arena.zones, null, this.ray) : undefined;
      // A monster or table button in front of a zone remains selectable, including
      // when choosing Rush Recklessly's target with a card already selected.
      const hit = first?.type === 'unit' || first?.type === 'action' ? first : zone?.userData.hit ?? first;
      if (hit) this.onHit(hit);
    });
    for (const controller of arena.controllers) {
      controller.addEventListener('connected', e => { this.sources.set(controller, e.data); });
      controller.addEventListener('selectstart', () => this.grab(controller, 'trigger'));
      controller.addEventListener('squeezestart', () => this.grab(controller, 'grip'));
      controller.addEventListener('selectend', () => this.release(controller, 'trigger'));
      controller.addEventListener('squeezeend', () => this.release(controller, 'grip'));
      controller.addEventListener('disconnected', () => { this.sources.delete(controller); this.release(controller, undefined, true); });
    }
    arena.renderer.xr.addEventListener('sessionstart', () => {
      this.pointerInside = false; arena.clearPlacementPreviews();
      this.session = arena.renderer.xr.getSession() ?? undefined;
      this.session?.addEventListener('visibilitychange', this.onVisibility);
    });
    arena.renderer.xr.addEventListener('sessionend', () => {
      this.session?.removeEventListener('visibilitychange', this.onVisibility); this.session = undefined;
      this.cancelAll(); this.sources.clear();
    });
  }

  private onVisibility = () => { if (this.session?.visibilityState === 'hidden') this.cancelAll(); };

  isHeld(cardId: string): boolean { return [...this.held.values()].some(held => held.cardId === cardId); }

  feedback(strength:number,duration=55):void{for(const controller of this.arena.controllers)this.vibrate(controller,strength,duration);}

  setHaptics(enabled: boolean): void { this.haptics = enabled; }

  private vibrate(controller: THREE.Object3D, strength: number, duration: number): void {
    if (!this.haptics) return;
    const gamepad = this.sources.get(controller)?.gamepad as (Gamepad & { hapticActuators?: PulseActuator[] }) | undefined;
    pulse(gamepad?.hapticActuators?.[0], strength, duration);
  }

  private aim(controller: THREE.Object3D): void {
    controller.updateWorldMatrix(true, false); this.matrix.extractRotation(controller.matrixWorld);
    this.ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.ray.ray.direction.set(0, 0, -1).applyMatrix4(this.matrix);
  }

  private grab(controller: THREE.Object3D, button: GrabButton): void {
    this.onGesture();
    if (this.held.has(controller)) return;
    this.aim(controller);
    const near = this.canGrab() ? nearestCard(this.arena.interactive, this.ray.ray.origin) : undefined;
    const result = near ? undefined : this.arena.raycast(this.ray);
    const object = near ?? result?.object;
    const hit = object?.userData.hit as Hit | undefined;
    if (!object || !hit) return;
    if (hit.type === 'card') {
      if (!this.canGrab()) return;
      this.arena.detachCard(object); controller.attach(object);
      object.getWorldPosition(this.point);object.getWorldQuaternion(this.orientation);
      this.held.set(controller, { object, cardId: hit.cardId!, button,near:!!near,last:this.point.clone(),rotation:this.orientation.clone(),velocity:new THREE.Vector3(),angular:new THREE.Vector3() });
      this.onGrab(hit.cardId!); this.vibrate(controller, 0.28, 35);
    } else if (button === 'trigger') {
      this.onHit(hit); this.vibrate(controller, 0.16, 25);
    }
  }

  private target(controller: THREE.Object3D, held: Held): THREE.Mesh | undefined {
    this.aim(controller); held.object.getWorldPosition(this.point);
    return placementTarget(this.arena.zones, this.point, this.ray);
  }

  private release(controller: THREE.Object3D, button?: GrabButton, cancel = false): void {
    const held = this.held.get(controller);
    if (!held || (!cancel && button !== held.button)) return;
    // Re-evaluate against the latest state and pose at release; the preview never authorizes a move.
    const zone = cancel ? undefined : this.target(controller, held);
    this.held.delete(controller); this.hoverKeys.delete(controller);
    this.arena.showPlacementPreview(controller, undefined, '', false);
    this.arena.releaseCard(held.object,{velocity:held.velocity,angularVelocity:held.angular,cancel});
    const accepted = this.onDrop(held.cardId, zone?.userData.hit ?? null);
    if (!cancel) this.vibrate(controller, accepted ? 0.55 : 0.16, accepted ? 65 : 110);
  }

  cancelAll(): void {
    for (const controller of this.held.keys()) this.release(controller, undefined, true);
    this.hoverKeys.clear(); this.arena.clearPlacementPreviews();
  }

  update(delta=1/72): void {
    const dt=Math.min(.05,Math.max(.001,delta));
    if (!this.arena.renderer.xr.isPresenting) {
      const selected = this.getSelectedCard();
      if(this.pointerInside){this.ray.setFromCamera(this.pointer,this.arena.camera);const hit=this.arena.raycast(this.ray)?.object.userData.hit as Hit|undefined;const key=JSON.stringify(hit??null);if(key!==this.hoverHitKey){this.hoverHitKey=key;this.onHover(hit??null);}}
      if (selected && this.pointerInside) {
        this.ray.setFromCamera(this.pointer, this.arena.camera);
        const zone = placementTarget(this.arena.zones, null, this.ray);
        const feedback = zone ? this.getPlacementFeedback(selected, zone.userData.hit) : undefined;
        this.arena.showPlacementPreview(this.pointerKey, zone, selected, feedback?.ok ?? false);
        const key = `${selected}:${zone?.uuid ?? ''}:${feedback?.message ?? ''}`;
        if (key !== this.pointerFeedbackKey) {
          this.pointerFeedbackKey = key;
          if (feedback) this.onPreview(feedback);
        }
      } else {
        this.pointerFeedbackKey = '';
        this.arena.showPlacementPreview(this.pointerKey, undefined, '', false);
      }
      return;
    }
    for (const controller of this.arena.controllers) {
      if (!controller.visible) { this.release(controller, undefined, true); continue; }
      this.aim(controller);
      const held = this.held.get(controller);
      if (held) {
        if(!held.near){held.object.position.lerp(this.localGrip,1-Math.exp(-20*dt));held.object.quaternion.slerp(this.targetRotation,1-Math.exp(-18*dt));}
        held.object.getWorldPosition(this.point);held.object.getWorldQuaternion(this.orientation);
        held.velocity.lerp(this.sample.copy(this.point).sub(held.last).multiplyScalar(1/dt).clampLength(0,6),.4);
        this.deltaRotation.copy(this.orientation).multiply(this.inverseRotation.copy(held.rotation).invert());
        if(this.deltaRotation.w<0){this.deltaRotation.x*=-1;this.deltaRotation.y*=-1;this.deltaRotation.z*=-1;this.deltaRotation.w*=-1;}
        const angle=2*Math.acos(THREE.MathUtils.clamp(this.deltaRotation.w,-1,1)),s=Math.sqrt(Math.max(0,1-this.deltaRotation.w*this.deltaRotation.w));
        if(s>.0001){this.angularAxis.set(this.deltaRotation.x/s,this.deltaRotation.y/s,this.deltaRotation.z/s);held.angular.copy(this.angularAxis).multiplyScalar(angle/dt).clampLength(0,12);}
        held.last.copy(this.point);held.rotation.copy(this.orientation);
        const zone = this.target(controller, held);
        const feedback = zone ? this.getPlacementFeedback(held.cardId, zone.userData.hit) : { ok: false, message: 'Move over a field zone, or point at one, then release.' };
        const key = `${zone?.uuid ?? 'none'}:${feedback.ok}:${feedback.message}`;
        if (key !== this.hoverKeys.get(controller)) {
          this.hoverKeys.set(controller, key); this.onPreview(feedback);
          if (zone && feedback.ok) this.vibrate(controller, 0.12, 22);
        }
        this.arena.showPlacementPreview(controller, zone, held.cardId, feedback.ok);
        this.arena.setControllerRay(controller, this.arena.raycast(this.ray)?.distance ?? 4, zone ? feedback.ok : null);
      } else {
        const near = nearestCard(this.arena.interactive, this.ray.ray.origin);
        const hit = this.arena.raycast(this.ray);
        const key = near?.uuid ?? hit?.object.uuid ?? '';
        if (key !== this.hoverKeys.get(controller)) {
          this.hoverKeys.set(controller, key);
          if (near || hit?.object.userData.hit?.type === 'card') this.vibrate(controller, 0.08, 18);
          this.onHover((near?.userData.hit??hit?.object.userData.hit??null)as Hit|null);
        }
        this.arena.setControllerRay(controller, near ? this.ray.ray.origin.distanceTo(near.getWorldPosition(this.point)) : hit?.distance ?? 4, null);
      }
    }
  }
}
