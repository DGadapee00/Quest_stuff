/** Node-side ImageBitmap shape adapter for GLTFLoader asset checks. Production
 * browsers decode the actual images; Blender previews verify their rendered UVs.
 * Read real PNG/JPEG headers rather than inventing texture dimensions in tests.
 */
import assert from 'node:assert/strict';
Object.assign(globalThis,{self:globalThis,createImageBitmap:async(blob:Blob)=>{
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
 if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return{width:view.getUint32(16),height:view.getUint32(20),close(){}};
 assert.equal(bytes[0],255);assert.equal(bytes[1],216,'embedded image must be PNG or JPEG');
 for(let offset=2;offset<bytes.length-8;){
  if(bytes[offset++]!==255)continue;const marker=bytes[offset++];
  if(marker===216||marker===217||marker===0)continue;
  const length=view.getUint16(offset);
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return{width:view.getUint16(offset+5),height:view.getUint16(offset+3),close(){}};
  assert.ok(length>=2);offset+=length;
 }
 throw new Error('Embedded JPEG has no valid frame header.');
}});
