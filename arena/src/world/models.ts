import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { creature } from './art';
import type { Kind } from '../game/duel';

export type CreatureKind = Exclude<Kind, 'spell'>;
export const MODEL_URLS: Record<CreatureKind,string> = {
  dragon: new URL('../assets/models/blue-eyes-white-dragon.glb', import.meta.url).href,
  sentinel: new URL('../assets/models/dark-magician.glb', import.meta.url).href,
  wisp: new URL('../assets/models/celtic-guardian.glb', import.meta.url).href,
};
export const MODEL_BUDGET = { maxBytes:1024*1024, maxTriangles:8000, maxMeshes:12, maxTexturePixels:1024*1024 };
export const MODEL_FRAME:Record<CreatureKind,{height:number;width:number;depth:number}>={
  dragon:{height:1.5,width:2.4,depth:3},sentinel:{height:1.45,width:1.5,depth:1.5},wisp:{height:1.65,width:1.7,depth:1.7},
};
export interface ModelInstance { scene:THREE.Group; clips:THREE.AnimationClip[]; fallback:boolean;height:number }
export interface ModelStats { triangles:number; meshes:number; texturePixels:number }

export function modelStats(scene:THREE.Object3D):ModelStats {
  let triangles=0, meshes=0, texturePixels=0;
  const textures=new Set<THREE.Texture>();
  scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position?.count??0)/3;
    for(const material of Array.isArray(object.material)?object.material:[object.material])
      for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
  });
  for(const texture of textures){const image=texture.source.data;texturePixels+=(image?.width??0)*(image?.height??0);}
  return {triangles,meshes,texturePixels};
}
export function validateModel(scene:THREE.Object3D):void {
  const stats=modelStats(scene), bounds=new THREE.Box3().setFromObject(scene), size=bounds.getSize(new THREE.Vector3());
  if(!stats.meshes||!Number.isFinite(size.length())||size.y<=0)throw new Error('Model has no usable geometry.');
  if(stats.triangles>MODEL_BUDGET.maxTriangles||stats.meshes>MODEL_BUDGET.maxMeshes||stats.texturePixels>MODEL_BUDGET.maxTexturePixels)
    throw new Error('Model exceeds the arena asset budget.');
}
async function loadModel(url:string):Promise<GLTF> {
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw new Error(`Model request failed: ${response.status}`);
    if(Number(response.headers.get('content-length'))>MODEL_BUDGET.maxBytes)throw new Error('Model file exceeds budget.');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>MODEL_BUDGET.maxBytes)throw new Error('Model file exceeds budget.');
    return await new GLTFLoader().parseAsync(bytes,new URL('.',url).href);
  } finally {clearTimeout(timeout);}
}

/** Three cached templates, independent animation mixers per creature, immediate fallback on failure. */
export class CreatureModels {
  private templates=new Map<CreatureKind,GLTF>();
  private pending?:Promise<void>;
  readonly failures=new Map<CreatureKind,string>();
  constructor(private load:(url:string)=>Promise<GLTF>=loadModel) {}
  preload():Promise<void> {
    this.pending??=Promise.all((Object.entries(MODEL_URLS) as [CreatureKind,string][]).map(async([kind,url])=>{
      try {
        const gltf=await this.load(url);validateModel(gltf.scene);
        gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.userData.shared=true;for(const m of Array.isArray(o.material)?o.material:[o.material])m.userData.shared=true;}});
        this.templates.set(kind,gltf);
      } catch(error) {this.failures.set(kind,error instanceof Error?error.message:'Model unavailable.');}
    })).then(()=>{});
    return this.pending;
  }
  isReady(kind:CreatureKind):boolean {return this.templates.has(kind);}
  instantiate(kind:CreatureKind,color:string):ModelInstance {
    const template=this.templates.get(kind);
    if(!template)return {scene:creature(kind,color),clips:[],fallback:true,height:1.2};
    const scene=clone(template.scene) as THREE.Group;
    // Size a skinned character in its authored guard pose, not its unposed bind
    // skeleton. This keeps spread wings and a raised staff inside the field.
    const pose=new THREE.AnimationMixer(scene),idle=template.animations.find(c=>c.name==='Idle');
    if(idle){pose.clipAction(idle).play();pose.update(0);}
    scene.updateMatrixWorld(true);scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.computeBoundingBox();});
    const bounds=new THREE.Box3().setFromObject(scene),center=bounds.getCenter(new THREE.Vector3());
    const size=bounds.getSize(new THREE.Vector3()),frame=MODEL_FRAME[kind];
    const scale=Math.min(frame.height/size.y,frame.width/size.x,frame.depth/size.z);
    pose.stopAllAction();pose.uncacheRoot(scene);
    scene.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
    const root=new THREE.Group();root.add(scene);root.scale.setScalar(scale);
    return {scene:root,clips:template.animations,fallback:false,height:size.y*scale};
  }
}
