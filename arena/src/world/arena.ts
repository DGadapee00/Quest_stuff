import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import {XRHandModelFactory} from 'three/addons/webxr/XRHandModelFactory.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {cardTexture,cardBackTexture,label,preloadCardArt} from './art';
import {CreatureModels} from './models';
import {CreatureActor} from './creature-actor';
import {YUGI_PORTRAIT_URL} from './card-images';
import {Coliseum} from './environment';
import {ArenaEffects,type Element} from './effects';
import {CardBody,collideCards} from '../physics/card-body';
import {placementFeedback} from '../game/placement';
import {attackPower} from '../game/combat';
import type {Card,DuelState,Stance} from '../game/duel';
import type {Quality} from '../ui/preferences';

export interface Hit{type:'zone'|'card'|'unit'|'action';owner?:number;index?:number;row?:'monster'|'spell';cardId?:string;action?:string}
export interface ReleaseMotion{velocity:THREE.Vector3;angularVelocity:THREE.Vector3;cancel:boolean}
interface CardVisual{mesh:THREE.Mesh;body:CardBody;location:string;retiring:number;born:number}
interface Preview{group:THREE.Group;border:THREE.LineSegments;ghost:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;text:THREE.Mesh;valid:boolean|null}
const tableRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
const tempPosition=new THREE.Vector3(),tempQuaternion=new THREE.Quaternion();

/** Rendering and physical presence. All gameplay authority stays in game/. */
export class Arena{
 readonly scene=new THREE.Scene();
 readonly camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.035,100);
 readonly rig=new THREE.Group();
 readonly renderer:THREE.WebGLRenderer;
 readonly controls:OrbitControls;
 readonly interactive:THREE.Object3D[]=[];
 readonly controllers:THREE.XRTargetRaySpace[]=[];
 readonly zones:THREE.Mesh[]=[];
 readonly effects=new ArenaEffects();
 private environment=new Coliseum();
 private models=new CreatureModels();
 private shadowMaterial=new THREE.MeshBasicMaterial({map:this.environment.contactShadow,transparent:true,depthWrite:false,opacity:.38});
 private units=new Map<string,{actor:CreatureActor;badge:THREE.Mesh;signature:string}>();
 private cards=new Map<string,CardVisual>();
 private held=new Set<THREE.Object3D>();
 private cardGeometry=new THREE.BoxGeometry(.28,.42,.009);
 private edgeMaterial=new THREE.MeshStandardMaterial({color:'#ad976d',roughness:.35,metalness:.8});
 private backMaterial=new THREE.MeshStandardMaterial({map:cardBackTexture(),roughness:.48,metalness:.12});
 private fronts=new Map<string,THREE.MeshPhysicalMaterial>();
 private textures=new Map<string,THREE.Texture>();
 private cardLayer=new THREE.Group();
 private clock=new THREE.Clock();
 private paused=false;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 private quality:Quality='balanced';
 private animationSpeed=1;
 private adaptive=false;
 private frameTime=0;
 private lastDrawCalls=0;
 private lastTriangles=0;
 private slowTime=0;
 private fastTime=0;
 private state?:DuelState;
 private resolvingOwner:0|1|null=null;
 private key:THREE.DirectionalLight;
 private status:THREE.Mesh;
 private worldHint:THREE.Mesh;
 private lastHint='';
 private lastStatus='';
 private feedbackLabels=new Map<string,THREE.Mesh>();
 private actionMeshes=new Map<string,THREE.Mesh>();
 private controllerVisuals=new Map<THREE.Object3D,{line:THREE.Line;tip:THREE.Mesh}>();
 private previews=new Map<object,Preview>();
 private previewLabels={valid:label('RELEASE TO PLACE','#b4f3cf'),invalid:label('CANNOT PLACE','#ff9b9b')};
 private composer?:EffectComposer;
 private inspector:THREE.Group;
 private inspectPortrait:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
 private inspectText:THREE.Mesh;
 private targeting:THREE.Line;
 private selectedAttacker:number|null=null;
 private watcher=new THREE.Group();
 private barriers:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>[]=[];
 onFrame?:(delta:number)=>void;
 onXRChange?:(active:boolean)=>void;
 onCardContact?:(position:THREE.Vector3,speed:number)=>void;
 onArtReady?:(ready:boolean)=>void;

 constructor(container:HTMLElement){
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  this.renderer.setClearColor('#06131c');this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;
  this.renderer.info.autoReset=false;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.xr.enabled=true;this.renderer.xr.setReferenceSpaceType('local-floor');this.renderer.xr.setFramebufferScaleFactor(1);this.renderer.xr.setFoveation(.8);
  container.append(this.renderer.domElement);this.scene.fog=new THREE.FogExp2('#091a24',.027);
  this.camera.position.set(0,5.6,9.4);this.rig.add(this.camera);this.scene.add(this.rig);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,1.05,0);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.minDistance=5;this.controls.maxDistance=15;this.controls.maxPolarAngle=Math.PI*.47;this.controls.update();
  this.scene.add(new THREE.HemisphereLight('#a6c8d5','#0a101c',1.35));
  this.key=new THREE.DirectionalLight('#ffe0b4',3);this.key.position.set(3,9,4);this.key.shadow.mapSize.set(1024,1024);this.key.shadow.camera.left=-5;this.key.shadow.camera.right=5;this.key.shadow.camera.top=5;this.key.shadow.camera.bottom=-5;this.key.shadow.camera.near=.5;this.key.shadow.camera.far=20;this.key.shadow.bias=-.0005;this.scene.add(this.key);
  const rim=new THREE.DirectionalLight('#7bbfc8',2.4);rim.position.set(-4,5,-6);this.scene.add(rim);
  try{const generator=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.scene.environment=generator.fromScene(room,.06).texture;this.scene.environmentIntensity=.45;room.dispose();generator.dispose();}catch{/* Environment reflection is optional on limited GPUs. */}
  this.scene.add(this.environment.group,this.effects.group,this.cardLayer);this.buildTable();this.buildField();this.buildButtons();this.buildWatcher();this.buildControllers();
  this.status=this.panel('YU-GI-OH! / PRIVATE DUEL ARENA',3.3,.38);this.status.position.set(0,2.65,-3.7);this.scene.add(this.status);
  this.worldHint=this.panel('Choose a card, then a glowing zone.',2.9,.2);this.worldHint.position.set(0,1.5,2.75);this.worldHint.rotation.x=-.2;this.scene.add(this.worldHint);
  this.inspector=new THREE.Group();this.inspector.position.set(3.08,1.8,2.2);this.inspector.rotation.y=-.25;this.inspector.visible=false;this.scene.add(this.inspector);
  const backing=new THREE.Mesh(new THREE.PlaneGeometry(.95,1.25),new THREE.MeshBasicMaterial({color:'#071721',transparent:true,opacity:.92,side:THREE.DoubleSide}));this.inspector.add(backing);
  this.inspectPortrait=new THREE.Mesh(new THREE.PlaneGeometry(.46,.69),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));this.inspectPortrait.position.set(0,.15,.01);this.inspector.add(this.inspectPortrait);
  this.inspectText=this.panel('',.9,.25);this.inspectText.position.set(0,-.4,.012);this.inspector.add(this.inspectText);
  this.targeting=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineDashedMaterial({color:'#efc88b',dashSize:.12,gapSize:.08,transparent:true,opacity:.7}));this.targeting.visible=false;this.scene.add(this.targeting);
  this.cardGeometry.clearGroups();this.cardGeometry.addGroup(0,24,0);this.cardGeometry.addGroup(24,6,1);this.cardGeometry.addGroup(30,6,2);this.cardGeometry.userData.shared=true;this.edgeMaterial.userData.shared=this.backMaterial.userData.shared=true;
  void this.models.preload();void preloadCardArt().then(ready=>this.onArtReady?.(ready));
  this.renderer.xr.addEventListener('sessionstart',()=>{this.controls.enabled=false;this.controls.autoRotate=false;this.camera.position.set(0,0,0);this.camera.rotation.set(0,0,0);this.rig.position.set(0,0,4.15);this.applyQuality();this.onXRChange?.(true);});
  this.renderer.xr.addEventListener('sessionend',()=>{this.rig.position.set(0,0,0);this.camera.position.set(0,5.6,9.4);this.controls.enabled=true;this.controls.update();this.applyQuality();this.onXRChange?.(false);});
  addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.composer?.setSize(innerWidth,innerHeight);});
  this.applyQuality();this.renderer.setAnimationLoop(()=>this.tick());
 }
 private panel(text:string,w:number,h:number,color='#c1d9d7'){
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:label(text,color),transparent:true,depthWrite:false,side:THREE.DoubleSide}));
 }
 private buildTable(){
  const stone=new THREE.MeshStandardMaterial({color:'#132c36',roughness:.48,metalness:.35}),brass=new THREE.MeshStandardMaterial({color:'#bba173',metalness:.8,roughness:.3});
  const table=new THREE.Mesh(new RoundedBoxGeometry(7.6,.16,6.7,2,.055),stone);table.position.y=.78;table.receiveShadow=true;this.scene.add(table);
  for(const x of [-3.3,3.3])for(const z of [-2.8,2.8]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.16,.28,.66,8),brass);leg.position.set(x,.35,z);this.scene.add(leg);}
  for(const x of [-3.78,3.78]){const trim=new THREE.Mesh(new THREE.BoxGeometry(.025,.1,6.55),brass);trim.position.set(x,.8,0);this.scene.add(trim);}
  for(const z of [-3.33,3.33]){const trim=new THREE.Mesh(new THREE.BoxGeometry(7.5,.1,.025),brass);trim.position.set(0,.8,z);this.scene.add(trim);}
  const sigil=new THREE.Mesh(new THREE.PlaneGeometry(5.8,5.8),new THREE.MeshBasicMaterial({map:this.environment.rune,color:'#88bcb1',transparent:true,opacity:.1,depthWrite:false}));sigil.rotation.x=-Math.PI/2;sigil.position.y=.867;this.scene.add(sigil);
  for(const owner of [0,1]){const barrier=new THREE.Mesh(new THREE.RingGeometry(.7,.73,6),new THREE.MeshBasicMaterial({color:'#9ed4eb',transparent:true,opacity:.28,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));barrier.position.set(0,1.6,owner===0?2.5:-2.5);barrier.visible=false;this.scene.add(barrier);this.barriers.push(barrier);}
  const divider=new THREE.Mesh(new THREE.BoxGeometry(6.8,.006,.012),new THREE.MeshBasicMaterial({color:'#a89260'}));divider.position.y=.876;this.scene.add(divider);
 }
 private buildField(){
  for(const owner of [0,1])for(const row of ['monster','spell']as const)for(let index=0;index<3;index++){
   const mesh=new THREE.Mesh(new RoundedBoxGeometry(1.05,.025,.71,1,.012),new THREE.MeshStandardMaterial({color:owner===0?'#163b43':'#303344',emissive:owner===0?'#214943':'#3e3551',emissiveIntensity:.3,metalness:.6,roughness:.4}));
   mesh.position.set((index-1)*1.65,.88,(owner===0?1:-1)*(row==='monster'?.92:2.05));mesh.userData.hit={type:'zone',owner,index,row}satisfies Hit;this.zones.push(mesh);this.interactive.push(mesh);this.scene.add(mesh);
   const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08,.02,.74)),new THREE.LineBasicMaterial({color:owner===0?'#7bbaa9':'#9a8aaf',transparent:true,opacity:.65}));edge.position.copy(mesh.position);this.scene.add(edge);
   const text=this.panel(`${row==='monster'?'MONSTER':'SPELL/TRAP'} / 0${index+1}`,.88,.12,owner===0?'#95bfb7':'#a69bb8');text.rotation.x=-Math.PI/2;text.position.copy(mesh.position);text.position.y+=.02;this.scene.add(text);
  }
 }
 private button(action:string,text:string,x:number,z:number,w=.73){
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,.035,.27,1,.015),new THREE.MeshStandardMaterial({color:'#29403f',emissive:'#15312e',emissiveIntensity:.4,metalness:.4,roughness:.5}));mesh.position.set(x,.96,z);mesh.userData.hit={type:'action',action}satisfies Hit;this.interactive.push(mesh);this.actionMeshes.set(action,mesh);this.scene.add(mesh);
  const t=this.panel(text,w-.04,.16,'#d4ceaf');t.rotation.x=-Math.PI/2;t.position.copy(mesh.position);t.position.y+=.024;this.scene.add(t);this.feedbackLabels.set(action,t);
 }
 private buildButtons(){
  this.button('battle','BATTLE',-.85,2.85);this.button('end','END TURN',0,2.85);this.button('stance','STANCE',.85,2.85);this.button('reset','NEW DUEL',2.65,2.85,.9);
  this.button('audio','SOUND: ON',-.68,3.17,1.05);this.button('haptics','HAPTICS: ON',.68,3.17,1.05);this.button('recenter','RECENTER',-2.65,2.85,.9);
 }
 private buildWatcher(){
  const portrait=new THREE.TextureLoader().load(YUGI_PORTRAIT_URL);portrait.colorSpace=THREE.SRGBColorSpace;
  const projection=new THREE.Sprite(new THREE.SpriteMaterial({map:portrait,color:'#deefff',transparent:true,opacity:.88,depthWrite:false,alphaTest:.02}));
  projection.scale.set(1.6,2.4,1);projection.position.y=1.65;this.watcher.add(projection);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.7,.85,.14,32),new THREE.MeshStandardMaterial({color:'#25414d',metalness:.7,roughness:.3}));pedestal.position.y=.08;
  const sigil=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.8),new THREE.MeshBasicMaterial({map:this.environment.rune,color:'#99cde7',transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));sigil.rotation.x=-Math.PI/2;sigil.position.y=.16;
  const name=this.panel('Y A M I   Y U G I',1.7,.18,'#bfd8e5');name.position.set(0,.32,.7);
  this.watcher.add(pedestal,sigil,name);this.watcher.position.set(0,0,-5.6);this.scene.add(this.watcher);
 }
 private buildControllers(){
  const factory=new XRControllerModelFactory(),hands=new XRHandModelFactory();
  for(let i=0;i<2;i++){
   const controller=this.renderer.xr.getController(i);this.rig.add(controller);this.controllers.push(controller);
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:'#9de8d0',transparent:true,opacity:.38}));line.scale.z=4;controller.add(line);
   const tip=new THREE.Mesh(new THREE.SphereGeometry(.013,8,6),new THREE.MeshBasicMaterial({color:'#b6f0d8'}));tip.position.z=-4;controller.add(tip);this.controllerVisuals.set(controller,{line,tip});
   const grip=this.renderer.xr.getControllerGrip(i);grip.add(factory.createControllerModel(grip));this.rig.add(grip);
   const hand=this.renderer.xr.getHand(i);hand.add(hands.createHandModel(hand,'spheres'));this.rig.add(hand);
  }
 }
 sync(state:DuelState){
  this.state=state;this.syncCreatures(state);
  const active=new Set<string>();
  const place=(card:Card,position:THREE.Vector3,rotation:THREE.Quaternion,location:string,hit:Hit)=>{
   active.add(card.id);let visual=this.cards.get(card.id);
   if(!visual){const mesh=this.makeCard(card),body=new CardBody();body.setHome(position,rotation,true);mesh.position.copy(position);mesh.quaternion.copy(rotation);mesh.userData.hit=hit;this.cardLayer.add(mesh);this.interactive.push(mesh);if(location.startsWith('unit:1')||location.startsWith('spell:1')){body.position.set(2.8,1.25,-3.05);body.snap();mesh.position.copy(body.position);}
    visual={mesh,body,location,retiring:-1,born:0};body.onContact=speed=>this.onCardContact?.(body.position,speed);this.cards.set(card.id,visual);}
   visual.retiring=-1;visual.mesh.userData.hit=hit;
   const materials=visual.mesh.material as THREE.Material[];materials[1]=card.trap&&location.startsWith('spell')&&state.players[hit.owner??0].negate?this.backMaterial:this.fronts.get(card.name)!;
   visual.body.setHome(position,rotation);if(visual.location!==location){visual.location=location;if(!this.held.has(visual.mesh))visual.body.snap();}
  };
  state.players.forEach((p,owner)=>{
   p.monsters.forEach((unit,index)=>{if(!unit)return;tempQuaternion.copy(tableRotation);if(unit.stance==='defense')tempQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2));place(unit.card,new THREE.Vector3((index-1)*1.65,.916,owner===0?.92:-.92),tempQuaternion,`unit:${owner}:${index}`,{type:'unit',owner,index});});
   p.spells.forEach((card,index)=>{if(card)place(card,new THREE.Vector3((index-1)*1.65,.916,owner===0?2.05:-2.05),tableRotation,`spell:${owner}:${index}`,{type:'zone',owner,index,row:'spell'});});
  });
  state.players[0].hand.forEach((card,index)=>{
   const offset=index-(state.players[0].hand.length-1)/2;tempQuaternion.setFromEuler(new THREE.Euler(-Math.PI*.33,0,-offset*.035));place(card,new THREE.Vector3(offset*.36,1.06+Math.abs(offset)*.008,3.48),tempQuaternion,'hand',{type:'card',cardId:card.id});
  });
  for(const [id,visual]of this.cards)if(!active.has(id)&&visual.retiring<0){visual.retiring=0;this.removeInteractive(visual.mesh);}
  this.refreshStatus();
 }
 private syncCreatures(state:DuelState){
  const active=new Set<string>();
  state.players.forEach((p,owner)=>p.monsters.forEach((unit,index)=>{
   if(!unit)return;active.add(unit.card.id);let visual=this.units.get(unit.card.id);
   const signature=`${attackPower(unit)}:${unit.stance}:${unit.attacked}`;
   if(!visual){const actor=new CreatureActor(unit.card,owner as 0|1,index,this.models),badge=this.panel('',1.08,.17,unit.card.color);badge.position.y=actor.displayHeight+.16;actor.root.add(badge);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.35,1.1),this.shadowMaterial);shadow.material.userData.shared=true;shadow.rotation.x=-Math.PI/2;shadow.position.y=-.04;actor.root.add(shadow);
    visual={actor,badge,signature:''};this.units.set(unit.card.id,visual);this.scene.add(actor.root);this.interactive.push(actor.pick);
   }
   visual.actor.setStance(unit.stance??'attack');
   if(visual.signature!==signature){visual.signature=signature;const mat=visual.badge.material as THREE.MeshBasicMaterial;mat.map?.dispose();mat.map=label(unit.stance==='defense'?`${unit.card.defense} DEF / GUARD`:`${attackPower(unit)} ATK${unit.attacked?' / USED':''}`,unit.card.color);mat.needsUpdate=true;}
  }));
  for(const [id,visual]of this.units)if(!active.has(id)){if(visual.actor.state!=='defeat'){const origin=visual.actor.root.position.clone().add(new THREE.Vector3(0,.6,0));this.effects.burst(origin,visual.actor.card.color,40,1.2,2.8);this.effects.shatter(origin,visual.actor.card.color);visual.actor.defeat();}this.removeInteractive(visual.actor.pick);}
 }
 private makeCard(card:Card){
  const texture=cardTexture(card);texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.textures.set(card.id,texture);
  let front=this.fronts.get(card.name);if(!front){front=new THREE.MeshPhysicalMaterial({map:texture,roughness:.43,metalness:.12,clearcoat:.7,clearcoatRoughness:.25});front.userData.shared=true;this.fronts.set(card.name,front);}
  return new THREE.Mesh(this.cardGeometry,[this.edgeMaterial,front,this.backMaterial]);
 }
 detachCard(object:THREE.Object3D){this.held.add(object);this.removeInteractive(object);}
 releaseCard(object:THREE.Object3D,motion?:ReleaseMotion){
  const id=object.userData.hit?.cardId,visual=this.cards.get(id);this.held.delete(object);this.cardLayer.attach(object);
  object.getWorldPosition(tempPosition);object.getWorldQuaternion(tempQuaternion);
  if(visual){visual.body.throw(tempPosition,tempQuaternion,motion?.velocity??new THREE.Vector3(),motion?.angularVelocity??new THREE.Vector3());if(motion?.cancel)visual.body.setHome(visual.body.home,visual.body.homeRotation,true);if(!this.interactive.includes(object))this.interactive.push(object);}
 }
 findCard(id:string){return this.cards.get(id)?.mesh;}
 resetCards(){for(const visual of this.cards.values()){this.removeInteractive(visual.mesh);visual.mesh.removeFromParent();}this.cards.clear();this.held.clear();this.textures.clear();}
 settleCards(){for(const visual of this.cards.values())if(!this.held.has(visual.mesh))visual.body.returnHome();}
 private removeInteractive(object:THREE.Object3D){const i=this.interactive.indexOf(object);if(i>=0)this.interactive.splice(i,1);}
 resetCreatures(){this.clearCombat();for(const {actor}of this.units.values()){this.removeInteractive(actor.pick);actor.dispose();}this.units.clear();}
 clearCombat(){this.effects.clear();this.targeting.visible=false;for(const barrier of this.barriers){barrier.visible=false;barrier.userData.life=0;}}
 setPresentationPaused(paused:boolean){this.paused=paused;if(paused)this.settleCards();}
 setResolving(owner:0|1|undefined){this.resolvingOwner=owner??null;this.refreshStatus();this.targeting.visible=false;for(const key of ['battle','end','stance']){const material=this.actionMeshes.get(key)?.material as THREE.MeshStandardMaterial|undefined;if(material)material.emissiveIntensity=owner===undefined?.4:.05;}}
 private refreshStatus(){
  if(!this.state)return;const s=this.state,phase=s.winner!==null?'DUEL COMPLETE':this.resolvingOwner===1?'YUGI TURN':this.resolvingOwner===0?'RESOLVING':s.phase.toUpperCase();
  const text=`${s.players[0].life} LP${s.players[0].negate?' / TRAP SET':''}  /  ${s.players[1].life} LP   /   ${phase}`;
  if(text===this.lastStatus)return;this.lastStatus=text;const mat=this.status.material as THREE.MeshBasicMaterial;mat.map?.dispose();mat.map=label(text,'#cfddca',1536,96);mat.needsUpdate=true;
 }
 setHint(text:string){if(text===this.lastHint)return;this.lastHint=text;const mat=this.worldHint.material as THREE.MeshBasicMaterial;mat.map?.dispose();mat.map=label(text,'#c5dacf',1536,96);mat.needsUpdate=true;}
 setFeedbackSettings(audio:boolean,haptics:boolean){for(const [key,value]of [['audio',audio],['haptics',haptics]]as const){const mat=this.feedbackLabels.get(key)!.material as THREE.MeshBasicMaterial;mat.map?.dispose();mat.map=label(`${key==='audio'?'SOUND':'HAPTICS'}: ${value?'ON':'OFF'}`,'#d4ceaf');mat.needsUpdate=true;}}
 inspect(card:Card|null,summary?:string){
  this.inspector.visible=!!card;if(!card)return;this.inspectPortrait.material.map=cardTexture(card);this.inspectPortrait.material.needsUpdate=true;const mat=this.inspectText.material as THREE.MeshBasicMaterial;mat.map?.dispose();mat.map=label(summary??(card.kind==='spell'?card.name:`${card.attack} ATK / ${card.defense} DEF`),card.color,1024,128);mat.needsUpdate=true;
 }
 raycast(ray:THREE.Raycaster){return ray.intersectObjects(this.interactive,false)[0];}
 highlight(card:Card|null,attacker:number|null){
  this.selectedAttacker=attacker;
  for(const zone of this.zones){const h=zone.userData.hit as Required<Hit>,valid=!!card&&!!this.state&&placementFeedback(this.state,card.id,{owner:h.owner,index:h.index,row:h.row}).ok;(zone.material as THREE.MeshStandardMaterial).emissiveIntensity=valid?1.1:.25;}
  for(const {actor}of this.units.values())actor.ring.scale.setScalar(attacker!==null&&actor.owner===0&&actor.index===attacker?1.18:1);
  if(attacker===null)this.targeting.visible=false;
 }
 target(index:number|null,color='#d4c28e'){
  if(this.selectedAttacker===null||index===null){this.targeting.visible=false;return;}
  const from=this.fieldPosition(0,this.selectedAttacker),to=this.fieldPosition(1,index),attribute=this.targeting.geometry.attributes.position;
  attribute.setXYZ(0,from.x,from.y,from.z);attribute.setXYZ(1,to.x,to.y,to.z);attribute.needsUpdate=true;this.targeting.computeLineDistances();this.targeting.geometry.computeBoundingSphere();(this.targeting.material as THREE.LineDashedMaterial).color.set(color);this.targeting.visible=true;
 }
 attack(owner:0|1,from:number,target?:number){
  const visual=[...this.units.values()].find(v=>v.actor.owner===owner&&v.actor.index===from&&v.actor.state!=='defeat'),destination=this.fieldPosition((1-owner)as 0|1,target);
  visual?.actor.attack(destination);this.effects.projectile(visual?.actor.releasePoint()??this.fieldPosition(owner,from),destination,(visual?.actor.card.kind??'dragon')as Element);
 }
 impact(owner:0|1,target?:number,kind:Element='dragon',blocked=false){const visual=[...this.units.values()].find(v=>v.actor.owner!==owner&&v.actor.index===target&&v.actor.state!=='defeat');visual?.actor.hit();this.effects.impact(this.fieldPosition((1-owner)as 0|1,target),kind,blocked);}
 pulseField(position:THREE.Vector3,color:string){const p=position.clone();p.y=.97;this.effects.ring(p,color,.8,.8);this.effects.burst(p,color,35,.8,-.2);}
 summonEffect(owner:0|1,index:number,kind:Element){this.effects.summon(this.fieldPosition(owner,index),kind);}
 announce(text:string,color='#ecdaae'){this.effects.text(new THREE.Vector3(0,2.9,.1),text,color);}
 damage(owner:0|1,value:number,blocked=0){const p=this.fieldPosition(owner);p.y=2;this.effects.text(p,value>0?`−${value.toLocaleString()}`:blocked?'NEGATED':'DEFENSE','#ffce9e');if(blocked){const barrier=this.barriers[owner];barrier.visible=true;barrier.userData.life=.65;}if(blocked)this.effects.ring(new THREE.Vector3(0,1.1,owner===0?2.55:-2.55),'#acdcff',1,.7);}
 fieldPosition(owner:0|1,index?:number,row:'monster'|'spell'='monster'){return new THREE.Vector3(index===undefined?0:(index-1)*1.65,row==='spell'?1.05:1.7,(owner===0?1:-1)*(index===undefined?3.5:row==='spell'?2.05:.92));}
 showPlacementPreview(key:object,zone:THREE.Mesh|undefined,cardId:string,valid:boolean){
  let p=this.previews.get(key);if(!zone){if(p){p.group.visible=false;p.ghost.material.map=null;}return;}
  if(!p){const group=new THREE.Group(),border=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.12,.025,.78)),new THREE.LineBasicMaterial({color:'#b4efce'})),ghost=new THREE.Mesh(new THREE.PlaneGeometry(.28,.42),new THREE.MeshBasicMaterial({transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));ghost.rotation.x=-Math.PI/2;ghost.position.y=.045;const text=this.panel('',.91,.14);text.rotation.x=-Math.PI/2;text.position.set(0,.04,.29);group.add(border,ghost,text);p={group,border,ghost,text,valid:null};this.previews.set(key,p);this.scene.add(group);}
  p.group.visible=true;p.group.position.copy(zone.position);p.group.position.y+=.06;
  if(p.valid!==valid){p.valid=valid;const color=valid?'#b4efce':'#ff9292';(p.border.material as THREE.LineBasicMaterial).color.set(color);p.ghost.material.color.set(valid?'#ffffff':color);const m=p.text.material as THREE.MeshBasicMaterial;if(m.map&&!Object.values(this.previewLabels).includes(m.map as THREE.CanvasTexture))m.map.dispose();m.map=valid?this.previewLabels.valid:this.previewLabels.invalid;m.needsUpdate=true;}
  const map=this.textures.get(cardId)??null;if(p.ghost.material.map!==map){p.ghost.material.map=map;p.ghost.material.needsUpdate=true;}
 }
 clearPlacementPreviews(){for(const p of this.previews.values()){p.group.visible=false;p.ghost.material.map=null;}}
 setControllerRay(controller:THREE.Object3D,distance:number,valid:boolean|null){const v=this.controllerVisuals.get(controller);if(!v)return;const color=valid===null?'#a6dfcc':valid?'#b4efce':'#ff9292';(v.line.material as THREE.LineBasicMaterial).color.set(color);(v.tip.material as THREE.MeshBasicMaterial).color.set(color);v.line.scale.z=Math.min(6,Math.max(.05,distance));v.tip.position.z=-v.line.scale.z;}
 recenter(){if(this.renderer.xr.isPresenting){const position=new THREE.Vector3().setFromMatrixPosition(this.renderer.xr.getCamera().matrix);this.rig.position.set(-position.x,0,4.15-position.z);}else{this.camera.position.set(0,5.6,9.4);this.controls.target.set(0,1.05,0);this.controls.update();}this.setHint('View centered. Your boundary remains in control.');}
 setMotion(reduced:boolean){this.reduced=reduced;}
 setPace(pace:number){this.animationSpeed=Number.isFinite(pace)?Math.max(.5,Math.min(2,pace)):1;}
 setQuality(value:string){this.quality=value==='cinematic'?'cinematic':value==='performance'?'performance':'balanced';this.adaptive=false;this.applyQuality();}
 private applyQuality(){
  const xr=this.renderer.xr.isPresenting,low=this.quality==='performance'||this.adaptive,cinematic=this.quality==='cinematic'&&!xr&&!low;
  if(!xr){this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:cinematic?1.8:1.5));this.renderer.xr.setFramebufferScaleFactor(low?.85:1);}this.renderer.shadowMap.enabled=cinematic;this.key.castShadow=cinematic;
  this.effects.setDetail(low?.5:1);this.environment.setDetail(low?.5:1);
  if(cinematic&&!this.composer){this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.38,.45,1.1));this.composer.addPass(new OutputPass());}
  if(!xr)this.composer?.setSize(innerWidth,innerHeight);
 }
 private tick(){
  const raw=this.clock.getDelta(),dt=Math.min(.05,raw);if(!this.renderer.xr.isPresenting)this.controls.update();this.onFrame?.(raw);
  if(!this.paused){
   this.environment.update(dt,this.reduced);this.effects.update(dt*this.animationSpeed,this.reduced);for(const barrier of this.barriers)if(barrier.visible){barrier.userData.life-=dt;barrier.material.opacity=Math.max(0,barrier.userData.life)*.6;if(barrier.userData.life<=0)barrier.visible=false;}this.watcher.rotation.y=this.reduced?0:Math.sin(this.clock.elapsedTime*.25)*.04;
   for(const [id,{actor,badge}]of this.units){actor.update(dt*this.animationSpeed,this.reduced);badge.position.y=actor.displayHeight+.16;if(actor.defeated){actor.dispose();this.units.delete(id);}}
   const flying:CardBody[]=[];
   for(const [id,v]of this.cards){if(this.held.has(v.mesh))continue;v.body.update(dt);v.mesh.position.copy(v.body.position);v.mesh.quaternion.copy(v.body.rotation);v.born+=dt;
    if(v.retiring>=0){v.retiring+=dt;v.mesh.scale.setScalar(Math.max(.001,1-v.retiring/.3));if(v.retiring>=.3){v.mesh.removeFromParent();this.cards.delete(id);this.textures.delete(id);}}
    else{v.mesh.scale.setScalar(this.reduced?1:Math.min(1,.75+v.born*2));if(v.body.mode==='free')flying.push(v.body);}
   }
   for(let i=0;i<flying.length;i++)for(let j=i+1;j<flying.length;j++)collideCards(flying[i],flying[j]);
  }
  this.effects.setViewport(this.renderer.xr.isPresenting?1400:innerHeight*this.renderer.getPixelRatio());
  const target=this.renderer.xr.isPresenting?1/72:1/60;this.frameTime=THREE.MathUtils.lerp(this.frameTime||raw,Math.min(.1,raw),.025);
  if(raw<.15){if(this.frameTime>target*1.35){this.slowTime+=dt;this.fastTime=0;}else if(this.frameTime<target*1.1){this.fastTime+=dt;this.slowTime=0;}
   if(this.slowTime>3&&!this.adaptive){this.adaptive=true;this.applyQuality();this.slowTime=0;}if(this.fastTime>12&&this.adaptive){this.adaptive=false;this.applyQuality();this.fastTime=0;}}
  this.renderer.info.reset();
  if(this.quality==='cinematic'&&!this.renderer.xr.isPresenting&&!this.adaptive&&this.composer)this.composer.render();else this.renderer.render(this.scene,this.camera);
  this.lastDrawCalls=this.renderer.info.render.calls;this.lastTriangles=this.renderer.info.render.triangles;
 }
 get stats(){return{drawCalls:this.lastDrawCalls,triangles:this.lastTriangles,quality:this.adaptive?'adaptive performance':this.quality,frameTime:this.frameTime*1000,particles:this.effects.activeParticles};}
}
