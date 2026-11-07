/** Geometry/skeleton bridge for the documented Duel Links COLLADA source files.
 * Texture processing and authored poses/clips live in convert-duel-links.py.
 * Requires the privately downloaded source folders documented in README.md.
 */
import * as T from 'three';
import {DOMParser} from 'linkedom';
import {ColladaLoader} from 'three/addons/loaders/ColladaLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
globalThis.DOMParser=DOMParser;
globalThis.FileReader=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.();}};
// The bridge exports geometry only; Blender loads the original PNGs explicitly.
T.TextureLoader.prototype.load=function(path){const texture=new T.Texture();texture.name=path;texture.userData.source=path;return texture;};
const manager=new T.LoadingManager();
manager.addHandler(/.*/, {path:'',setPath(path){this.path=path;return this;},setCrossOrigin(){return this;},load(path){const t=new T.Texture();t.name=path;t.userData.source=path;return t;}});
await mkdir('work',{recursive:true});
for(const [kind,path] of [['dragon','blue-eyes-duel-links/Blue-Eyes White Dragon/MMD_004007.dae'],['mage','dark-magician-duel-links/Dark Magician/MMD_004041.dae']]){
 const xml=await readFile('work/model-research/'+path,'utf8');const root=new ColladaLoader(manager).parse(xml,'').scene;root.updateMatrixWorld(true);
 const data={bones:[],meshes:[],materials:{}};
 const flipped=new Set();
 root.traverse(o=>{
  if(o.isBone)data.bones.push({name:o.name,parent:o.parent?.name,position:o.position.toArray(),worldPosition:o.getWorldPosition(new T.Vector3()).toArray(),rotation:o.quaternion.toArray()});
  if(o.isMesh){data.meshes.push({name:o.name,triangles:(o.geometry.index?.count??o.geometry.attributes.position.count)/3,bones:o.skeleton?.bones.length,bounds:new T.Box3().setFromObject(o).getSize(new T.Vector3()).toArray()});
   // GLTFExporter normally flips browser-loaded image pixels. This geometry-only
   // bridge has no images, so invert V here to preserve the original COLLADA UVs
   // when Blender imports the glTF and reconnects the untouched source textures.
   if(!flipped.has(o.geometry)){const uv=o.geometry.getAttribute('uv');if(uv)for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));flipped.add(o.geometry);}
   const mats=Array.isArray(o.material)?o.material:[o.material];
   for(const m of mats){if(data.materials[m.name])continue;const maps={};for(const [key,value] of Object.entries(m))if(value?.isTexture){maps[key]=value.userData.source??value.name;m[key]=null;}data.materials[m.name]={maps,color:m.color.toArray()};m.userData.sourceMaps=maps;m.opacity=1;m.transparent=false;}
  }
 });
 const out=await new GLTFExporter().parseAsync(root,{binary:true});
 await writeFile(`work/${kind}-intermediate.glb`,Buffer.from(out));await writeFile(`work/${kind}-import.json`,JSON.stringify(data,null,2));
 console.log(kind,JSON.stringify(data));
}
