import * as THREE from 'three';

export const NEAR_GRAB_METERS = 0.13;
export const MAX_PLACEMENT_RAY_METERS = 6;
const box = new THREE.Box3();
const closest = new THREE.Vector3();
const center = new THREE.Vector3();

/** Nearest available card surface, so grabbing an edge doesn't require hitting its center. */
export function nearestCard(cards: readonly THREE.Object3D[], point: THREE.Vector3): THREE.Object3D | undefined {
  let best: THREE.Object3D | undefined;
  let bestDistance = NEAR_GRAB_METERS;
  let bestCenter = Infinity;
  for (const card of cards) {
    if (card.userData.hit?.type !== 'card') continue;
    card.updateWorldMatrix(true, false);
    box.setFromObject(card);
    box.clampPoint(point, closest);
    const distance = point.distanceTo(closest);
    const centerDistance = point.distanceTo(box.getCenter(center));
    if (distance < bestDistance || (distance === bestDistance && centerDistance < bestCenter)) {
      best = card; bestDistance = distance; bestCenter = centerDistance;
    }
  }
  return best;
}

/** Physical placement wins over distant pointing. Enemy and invalid zones remain targetable for feedback. */
export function placementTarget(
  zones: readonly THREE.Mesh[], cardPosition: THREE.Vector3 | null, ray: THREE.Raycaster,
): THREE.Mesh | undefined {
  if (cardPosition) {
    let nearest: THREE.Mesh | undefined;
    let distance = Infinity;
    for (const zone of zones) {
      zone.getWorldPosition(center);
      const dx = Math.abs(center.x - cardPosition.x), dz = Math.abs(center.z - cardPosition.z);
      const dy = Math.abs(center.y - cardPosition.y);
      if (dx <= 0.62 && dz <= 0.48 && dy <= 0.45) {
        const score = dx * dx + dz * dz + dy * dy;
        if (score < distance) { nearest = zone; distance = score; }
      }
    }
    if (nearest) return nearest;
  }
  return ray.intersectObjects([...zones], false).find(hit => hit.distance <= MAX_PLACEMENT_RAY_METERS)?.object as THREE.Mesh | undefined;
}

export interface PulseActuator { pulse(intensity: number, duration: number): Promise<boolean> }
export function pulse(actuator: PulseActuator | undefined, intensity: number, duration: number): void {
  if (!actuator) return;
  try { void actuator.pulse(Math.max(0, Math.min(1, intensity)), Math.max(0, Math.min(150, duration))).catch(() => {}); }
  catch { /* Optional hardware feedback must never prevent a move. */ }
}
