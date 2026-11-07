import * as THREE from 'three';

export type CardMotion='rest'|'free'|'return'|'snap';
export const CARD_HALF=new THREE.Vector3(0.14,0.21,0.0045);
const rotationMatrix=new THREE.Matrix4(),axis=new THREE.Vector3(),turn=new THREE.Quaternion();

/** Small deterministic card simulation in meters. Inventory/rules never depend on physics. */
export class CardBody {
  readonly position=new THREE.Vector3();
  readonly rotation=new THREE.Quaternion();
  readonly velocity=new THREE.Vector3();
  readonly angularVelocity=new THREE.Vector3();
  readonly home=new THREE.Vector3();
  readonly homeRotation=new THREE.Quaternion();
  mode:CardMotion='rest';
  private accumulator=0;
  private age=0;
  onContact?: (speed:number)=>void;

  setHome(position:THREE.Vector3,rotation:THREE.Quaternion,instant=false):void {
    this.home.copy(position);this.homeRotation.copy(rotation);
    if(instant){this.position.copy(position);this.rotation.copy(rotation);this.velocity.set(0,0,0);this.mode='rest';}
    else if(this.mode==='rest'&&(this.position.distanceToSquared(position)>0.00001||Math.abs(this.rotation.dot(rotation))<0.99999))this.mode='return';
  }
  throw(position:THREE.Vector3,rotation:THREE.Quaternion,velocity:THREE.Vector3,angularVelocity:THREE.Vector3):void {
    this.position.copy(position);this.rotation.copy(rotation);this.velocity.copy(velocity).clampLength(0,6);
    this.angularVelocity.copy(angularVelocity).clampLength(0,12);this.mode='free';this.age=0;this.accumulator=0;
  }
  snap():void {this.mode='snap';this.age=0;}
  returnHome():void {this.mode='return';this.age=0;}
  update(delta:number):void {
    if(!Number.isFinite(delta)||delta<=0||this.mode==='rest')return;
    this.accumulator+=Math.min(0.06,delta);
    const step=1/120;
    for(let i=0;this.accumulator>=step&&i<8;i++){this.step(step);this.accumulator-=step;}
  }
  private extentY():number {
    rotationMatrix.makeRotationFromQuaternion(this.rotation);const e=rotationMatrix.elements;
    return Math.abs(e[1])*CARD_HALF.x+Math.abs(e[5])*CARD_HALF.y+Math.abs(e[9])*CARD_HALF.z;
  }
  private step(dt:number):void {
    this.age+=dt;
    if(this.mode==='free'){
      const bottom=this.position.y-this.extentY();
      this.velocity.y-=9.81*dt;this.velocity.multiplyScalar(Math.exp(-0.45*dt));this.position.addScaledVector(this.velocity,dt);
      const speed=this.angularVelocity.length();if(speed>0.0001){axis.copy(this.angularVelocity).multiplyScalar(1/speed);turn.setFromAxisAngle(axis,speed*dt);this.rotation.premultiply(turn).normalize();}
      this.angularVelocity.multiplyScalar(Math.exp(-1.8*dt));
      const extent=this.extentY(),onTable=Math.abs(this.position.x)<3.8&&Math.abs(this.position.z)<3.35;
      const surface=onTable&&bottom>=0.86?0.88:0.015;
      if(this.position.y-extent<surface&&this.velocity.y<0){
        const impact=-this.velocity.y;this.position.y=surface+extent;this.velocity.y=impact*0.23;
        this.velocity.x*=0.65;this.velocity.z*=0.65;this.angularVelocity.multiplyScalar(0.55);
        if(impact>0.25)this.onContact?.(impact);
      }
      // Table sides are solid below the playing surface.
      if(onTable&&this.position.y<0.87&&this.position.y>0.66){
        const dx=3.8-Math.abs(this.position.x),dz=3.35-Math.abs(this.position.z);
        if(dx<dz){const side=Math.sign(this.position.x)||1;this.position.x=side*3.815;this.velocity.x=side*Math.abs(this.velocity.x)*0.25;}
        else{const side=Math.sign(this.position.z)||1;this.position.z=side*3.365;this.velocity.z=side*Math.abs(this.velocity.z)*0.25;}
      }
      if(this.age>=0.9||this.position.y<-1||this.position.lengthSq()>225)this.returnHome();
    }else{
      const stiffness=this.mode==='snap'?190:115,damping=this.mode==='snap'?27:21;
      this.velocity.x+=(this.home.x-this.position.x)*stiffness*dt-this.velocity.x*damping*dt;
      this.velocity.y+=(this.home.y-this.position.y)*stiffness*dt-this.velocity.y*damping*dt;
      this.velocity.z+=(this.home.z-this.position.z)*stiffness*dt-this.velocity.z*damping*dt;
      this.position.addScaledVector(this.velocity,dt);this.rotation.slerp(this.homeRotation,1-Math.exp(-17*dt));
      if(this.position.distanceToSquared(this.home)<0.000004&&this.velocity.lengthSq()<0.0004&&this.rotation.angleTo(this.homeRotation)<0.002){
        this.position.copy(this.home);this.rotation.copy(this.homeRotation);this.velocity.set(0,0,0);this.mode='rest';
      }
    }
  }
}

/** Impulse separation for two airborne cards. Resting inventory cards stay anchored. */
export function collideCards(a:CardBody,b:CardBody):void {
  if(a.mode!=='free'||b.mode!=='free')return;
  axis.copy(b.position).sub(a.position);const length=axis.length(),distance=0.16;
  if(length>=distance)return;
  if(length<0.0001)axis.set(1,0,0);else axis.multiplyScalar(1/length);
  const correction=(distance-length)*0.5;a.position.addScaledVector(axis,-correction);b.position.addScaledVector(axis,correction);
  const relative=(b.velocity.x-a.velocity.x)*axis.x+(b.velocity.y-a.velocity.y)*axis.y+(b.velocity.z-a.velocity.z)*axis.z;
  if(relative<0){const impulse=-relative*0.6;a.velocity.addScaledVector(axis,-impulse);b.velocity.addScaledVector(axis,impulse);}
}
