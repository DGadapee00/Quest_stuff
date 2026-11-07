/** Remove redundant bind-transform animation channels, retaining authored guard
 * poses and every changing bone. Binary geometry and image data stay untouched.
 */
import {readFile,writeFile} from 'node:fs/promises';
const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
for(const name of ['blue-eyes-white-dragon','dark-magician','celtic-guardian']){
 const path=new URL(`../src/assets/models/${name}.glb`,import.meta.url),bytes=await readFile(path);
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const binOffset=20+jsonLength+8,bin=bytes.subarray(binOffset);
 const values=index=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView];if(a.componentType!==5126)return null;const n=count[a.type],stride=v.byteStride??n*4,offset=(v.byteOffset??0)+(a.byteOffset??0);return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>bin.readFloatLE(offset+i*stride+j*4)));};
 let removed=0;
 for(const animation of json.animations??[]){
  animation.channels=animation.channels.filter(channel=>{
   const sampler=animation.samplers[channel.sampler];if(sampler.interpolation==='CUBICSPLINE')return true;
   const frames=values(sampler.output);if(!frames?.length)return true;
   const fallback=channel.target.path==='rotation'?[0,0,0,1]:channel.target.path==='scale'?[1,1,1]:[0,0,0];
   const initial=json.nodes[channel.target.node][channel.target.path]??fallback;
   const redundant=frames.every(frame=>frame.every((v,i)=>Math.abs(v-initial[i])<1e-6));if(redundant)removed++;return !redundant;
  });
  const used=[...new Set(animation.channels.map(c=>c.sampler))],map=new Map(used.map((old,i)=>[old,i]));
  animation.samplers=used.map(i=>animation.samplers[i]);animation.channels.forEach(c=>c.sampler=map.get(c.sampler));
 }
 const raw=Buffer.from(JSON.stringify(json)),jsonPadded=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(jsonPadded);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonPadded.length+8+bin.length,8);header.writeUInt32LE(jsonPadded.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 const output=Buffer.concat([header,jsonPadded,binHeader,bin]);await writeFile(path,output);
 console.log(`${name}: removed ${removed} redundant channels, ${output.length} bytes`);
}
