import * as THREE from 'three';
import type { Card,Stance } from '../game/duel';
import { CreatureModels, type CreatureKind, type ModelInstance } from './models';

export type CreatureState='summon'|'idle'|'attack'|'hit'|'defeat';
/** An actor survives state snapshots; only its pose and animation change. */
export class CreatureActor {
  readonly root=new THREE.Group();
  readonly pick:THREE.Mesh;
  readonly ring:THREE.Mesh<THREE.TorusGeometry,THREE.MeshBasicMaterial>;
  private rig=new THREE.Group();
  private stance:Stance='attack';
  private guard:THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>;
  private model!:ModelInstance;
  private mixer?:THREE.AnimationMixer;
  private action?:THREE.AnimationAction;
  private phase:CreatureState='summon';
  private elapsed=0;
  private direction=new THREE.Vector3();
  private seed:number;
  private time=0;
  get state():CreatureState{return this.phase;}
  get defeated():boolean{return this.phase==='defeat'&&this.elapsed>=0.42;}
  get fallback():boolean{return this.model.fallback;}
  get displayHeight():number{return this.model.height;}
  releasePoint():THREE.Vector3 {
    const name=this.card.kind==='dragon'?'Jaw':this.card.kind==='sentinel'?'MMD_004041_RightHand_buki':'WeaponGrip';
    this.root.updateWorldMatrix(true,true);
    const bone=this.model.scene.getObjectByName(name);
    return bone?bone.getWorldPosition(new THREE.Vector3()):this.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.7,0));
  }

  constructor(readonly card:Card,readonly owner:0|1,readonly index:number,private models:CreatureModels) {
    this.seed=index+owner*3;
    this.root.position.set((index-1)*1.65,0.94,owner===0?0.92:-0.92);
    this.rig.rotation.y=owner===0?Math.PI:0;this.root.add(this.rig);
    this.installModel();
    this.pick=new THREE.Mesh(new THREE.BoxGeometry(1.05,1.6,0.85),new THREE.MeshBasicMaterial({visible:false}));
    this.pick.position.y=0.75;this.pick.userData.hit={type:'unit',owner,index};this.root.add(this.pick);
    this.ring=new THREE.Mesh(new THREE.TorusGeometry(0.49,0.012,4,48),new THREE.MeshBasicMaterial({color:card.color,transparent:true,opacity:0.7}));
    this.guard=new THREE.Mesh(new THREE.CircleGeometry(.45,6),new THREE.MeshBasicMaterial({color:'#8cd4ef',transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false,wireframe:true}));this.guard.position.set(0,.62,owner===0?-.32:.32);this.guard.visible=false;this.root.add(this.guard);
    this.ring.rotation.x=Math.PI/2;this.ring.position.y=-0.025;this.root.add(this.ring);
  }
  setStance(stance:Stance):void{this.stance=stance;this.guard.visible=stance==='defense';}
  private installModel():void {
    this.model=this.models.instantiate(this.card.kind as CreatureKind,this.card.color);this.rig.add(this.model.scene);this.model.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    this.mixer=this.model.clips.length?new THREE.AnimationMixer(this.model.scene):undefined;this.clip('Idle');this.mixer?.update(0);
  }
  private clip(name:string):void {
    const clip=this.model.clips.find(c=>c.name.toLowerCase()===name.toLowerCase());
    if(!clip||!this.mixer)return;
    const next=this.mixer.clipAction(clip);
    if(this.action===next&&next.isRunning())return;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.setLoop(name==='Idle'?THREE.LoopRepeat:THREE.LoopOnce,name==='Idle'?Infinity:1);
    next.clampWhenFinished=name!=='Idle';next.play();
    this.action?.crossFadeTo(next,0.12,false);this.action=next;
  }
  attack(target:THREE.Vector3):void {
    if(this.phase==='defeat')return;
    this.direction.copy(target).sub(this.root.position);this.direction.y=0;this.direction.normalize();
    this.phase='attack';this.elapsed=0;this.clip('Attack');
  }
  hit():void {if(this.phase!=='defeat'){this.phase='hit';this.elapsed=0;this.clip('Hit');}}
  defeat():void {if(this.phase!=='defeat'){this.phase='defeat';this.elapsed=0;this.clip('Defeat');}}
  update(delta:number,reduced:boolean):void {
    const dt=Math.min(0.1,Math.max(0,delta));this.elapsed+=dt;this.time+=dt;
    if(this.phase==='idle'&&this.model.fallback&&this.models.isReady(this.card.kind as CreatureKind)){
      this.disposeModel();this.installModel();
    }
    if(!reduced)this.mixer?.update(dt);
    else if(this.mixer){this.mixer.setTime(0);}
    this.rig.position.set(0,reduced||!this.model.fallback?0:Math.sin(this.time*1.5+this.seed)*0.025,0);
    this.rig.rotation.x=THREE.MathUtils.lerp(this.rig.rotation.x,this.model.fallback&&this.stance==='defense'?-.1:0,1-Math.exp(-dt*10));
    if(this.guard.visible)this.guard.material.opacity=.12+(reduced?0:Math.sin(this.time*2)*.03);
    let scale=1;
    if(this.phase==='summon'){
      const t=Math.min(1,this.elapsed/0.65);scale=reduced?1:Math.max(0.001,1-Math.pow(1-t,3));
      if(t>=1){this.phase='idle';this.elapsed=0;}
    }else if(this.phase==='attack'){
      if(!reduced){const distance=this.card.kind==='wisp'?.16:this.card.kind==='dragon'?.06:0;const travel=Math.sin(Math.PI*Math.min(1,this.elapsed/0.8))*distance;this.rig.position.x=this.direction.x*travel;this.rig.position.z=this.direction.z*travel;}
      if(this.elapsed>=0.85){this.phase='idle';this.elapsed=0;this.clip('Idle');}
    }else if(this.phase==='hit'){
      if(!reduced)this.rig.position.x=Math.sin(this.elapsed*55)*0.015*Math.max(0,1-this.elapsed/0.3);
      if(this.elapsed>=0.3){this.phase='idle';this.elapsed=0;this.clip('Idle');}
    }else if(this.phase==='defeat')scale=reduced?0.001:Math.max(0.001,1-this.elapsed/0.42);
    this.root.scale.setScalar(scale);
    this.ring.material.color.set(this.phase==='hit'?'#ff9797':this.card.color);
    this.ring.material.opacity=this.phase==='summon'?Math.max(0.3,1-this.elapsed*0.5):0.7;
  }
  private disposeModel():void {
    this.mixer?.stopAllAction();this.mixer?.uncacheRoot(this.model.scene);this.action=undefined;
    this.rig.remove(this.model.scene);this.disposeTree(this.model.scene);
  }
  private disposeTree(root:THREE.Object3D):void {
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      if(!object.geometry.userData.shared)object.geometry.dispose();
      for(const material of Array.isArray(object.material)?object.material:[object.material])if(!material.userData.shared){
        for(const value of Object.values(material))if(value instanceof THREE.Texture&&!value.userData.shared)value.dispose();
        material.dispose();
      }
      if(object instanceof THREE.SkinnedMesh)object.skeleton.dispose();
    });
  }
  dispose():void {this.mixer?.stopAllAction();this.mixer?.uncacheRoot(this.model.scene);this.disposeTree(this.root);this.root.removeFromParent();}
}
