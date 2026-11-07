import * as THREE from 'three';
import {CARD_IMAGES} from './card-images';
import type { Card, Kind } from '../game/duel';
const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string, glow = false) {
  const key = color + glow;
  if(!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness:0.42, metalness:0.4, emissive:glow ? color : '#000000', emissiveIntensity:glow ? 0.75 : 0}));
  const result = materials.get(key)!; result.userData.shared = true; return result;
}
const geometry = {
  crystal: new THREE.OctahedronGeometry(0.3), sphere: new THREE.IcosahedronGeometry(0.24,1),
  box: new THREE.BoxGeometry(1,1,1), cone: new THREE.ConeGeometry(0.18,0.48,5),
};
Object.values(geometry).forEach(g => {g.userData.shared = true;});
export function creature(kind: Kind, color: string): THREE.Group {
  const group = new THREE.Group();
  function part(geo: THREE.BufferGeometry, c: string, x:number,y:number,z:number, sx=1,sy=1,sz=1, glow=false) {
    const m = new THREE.Mesh(geo,material(c,glow)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); group.add(m); return m;
  }
  if(kind === 'dragon') {
    part(geometry.sphere,color,0,0.45,0,0.85,1.45,0.85);
    part(geometry.crystal,color,0,0.9,0.09,0.62,0.7,0.8).rotation.x=-0.35;
    part(geometry.cone,'#fff0cd',-0.12,1.1,0,0.4,0.6,0.4).rotation.z=0.25;
    part(geometry.cone,'#fff0cd',0.12,1.1,0,0.4,0.6,0.4).rotation.z=-0.25;
    for(const side of [-1,1]) {
      const wing = part(geometry.crystal,color,side*0.5,0.72,-0.04,1.7,0.9,0.16); wing.rotation.z=side*-0.5;
      part(geometry.cone,color,side*0.15,0.14,0.1,0.6,0.65,0.7).rotation.x=Math.PI;
      part(geometry.sphere,'#fff4b0',side*0.075,0.95,0.25,0.11,0.13,0.13,true);
    }
    part(geometry.cone,color,0,0.3,-0.32,0.65,1.6,0.65).rotation.x=-1.1;
  } else if(kind === 'sentinel') {
    part(geometry.box,color,0,0.6,0,0.38,0.46,0.24);
    part(geometry.crystal,'#d4e5ff',0,1,0,0.6,0.7,0.6);
    part(geometry.box,'#c4efff',0,1.02,0.15,0.23,0.035,0.03, true);
    for(const side of [-1,1]) {
      part(geometry.crystal,color,side*0.3,0.78,0,0.65,0.65,0.7);
      part(geometry.box,'#59759b',side*0.33,0.48,0,0.12,0.35,0.13);
      part(geometry.box,'#59759b',side*0.12,0.19,0,0.13,0.36,0.15);
    }
    part(geometry.box,'#b9edff',0.43,0.66,0.05,0.035,0.95,0.06,true).rotation.z=-0.12;
  } else {
    part(geometry.crystal,color,0,0.62,0,0.8,1.4,0.8,true);
    for(let i=0;i<5;i++) {
      const angle = i*Math.PI*2/5;
      const leaf = part(geometry.crystal,color,Math.cos(angle)*0.35,0.35,Math.sin(angle)*0.35,0.45,0.9,0.35);
      leaf.rotation.z=Math.cos(angle)*-0.8; leaf.rotation.x=Math.sin(angle)*0.8;
    }
    part(geometry.sphere,'#e9ffe5',0,0.77,0.2,0.2,0.2,0.2,true);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34,0.012,4,32),material(color,true)); halo.position.y=1.05; halo.rotation.x=Math.PI/2; group.add(halo);
  }
  return group;
}

const artCache=new Map<string,{texture:THREE.CanvasTexture;card:Card}>();
const fronts=new Map<string,HTMLImageElement>();
let artLoad:Promise<boolean>|undefined;
export function preloadCardArt():Promise<boolean>{
 artLoad??=Promise.all(Object.entries(CARD_IMAGES).map(([name,urls])=>new Promise<boolean>(resolve=>{
  const image=new Image();image.onload=()=>{fronts.set(name,image);for(const entry of artCache.values())if(entry.card.name===name){drawCard(entry.texture.image,entry.card);entry.texture.needsUpdate=true;}resolve(true);};image.onerror=()=>resolve(false);image.src=urls.front;
 }))).then(results=>results.some(Boolean));return artLoad;
}
function drawCard(canvas:HTMLCanvasElement,card:Card){
  const c=canvas.getContext('2d')!,w=canvas.width,h=canvas.height;
  c.clearRect(0,0,w,h);c.fillStyle='#101b24';c.fillRect(0,0,w,h);
  const front=fronts.get(card.name);if(front){const scale=Math.min(w/front.width,h/front.height),dw=front.width*scale,dh=front.height*scale;c.drawImage(front,(w-dw)/2,(h-dh)/2,dw,dh);return;}
  const frame=c.createLinearGradient(0,0,w,h);frame.addColorStop(0,'#d5b373');frame.addColorStop(.45,'#736448');frame.addColorStop(1,'#c7a96b');
  c.strokeStyle=frame;c.lineWidth=8;c.strokeRect(8,8,w-16,h-16);c.lineWidth=1;c.strokeRect(19,19,w-38,h-38);
  const g=c.createRadialGradient(w/2,300,3,w/2,300,250);g.addColorStop(0,card.color);g.addColorStop(1,'#122534');c.fillStyle=g;c.fillRect(25,99,w-50,413);
  c.strokeStyle='#c5b47d';c.strokeRect(25,99,w-50,413);
  c.fillStyle='#e6d6b7';c.textAlign='left';c.font='600 30px serif';c.fillText(card.name,30,62,w-60);
  c.font='12px sans-serif';c.fillStyle=card.color;c.fillText(card.kind==='spell'?(card.trap?'COUNTER TRAP':'SPELL CARD'):`MONSTER / ${(card.race??card.kind).toUpperCase()}`,30,86);
  c.fillStyle='#b9c8ca';c.font='17px sans-serif';const words=card.text.split(' ');let line='',y=550;
  for(const word of words){const next=line+word+' ';if(c.measureText(next).width>w-68){c.fillText(line,34,y);line=word+' ';y+=23;}else line=next;}if(y<654)c.fillText(line,34,y);
  c.strokeStyle='#b49f6a55';c.beginPath();c.moveTo(30,672);c.lineTo(w-30,672);c.stroke();
  c.fillStyle=card.color;c.font='600 25px monospace';c.fillText(card.kind==='spell'?(card.effect==='ward'?'COUNTER TRAP':card.effect==='surge'?'+700 ATK':'GAIN / 1000'):`${card.attack} ATK  /  ${card.defense} DEF`,30,712,w-60);
  c.font='10px sans-serif';c.fillStyle='#7b8f95';c.textAlign='center';c.fillText('YU-GI-OH!  /  PRIVATE QUICK DUEL',w/2,741,w-45);
}
export function cardTexture(card:Card):THREE.CanvasTexture{
 const key=card.name;
 if(artCache.has(key))return artCache.get(key)!.texture;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=768;drawCard(canvas,card);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.userData.shared=true;artCache.set(key,{texture,card});return texture;
}
let back:THREE.CanvasTexture|undefined;
export function cardBackTexture():THREE.CanvasTexture{
 if(back)return back;const canvas=document.createElement('canvas');canvas.width=256;canvas.height=384;const c=canvas.getContext('2d')!;
 c.fillStyle='#21150e';c.fillRect(0,0,256,384);c.strokeStyle='#b69b63';c.lineWidth=4;c.strokeRect(8,8,240,368);c.lineWidth=1;c.strokeRect(17,17,222,350);c.translate(128,192);
 for(const radius of [48,72,94]){c.beginPath();c.ellipse(0,0,radius,radius*1.2,0,0,Math.PI*2);c.stroke();}
 for(let i=0;i<8;i++){c.rotate(Math.PI/4);c.beginPath();c.moveTo(0,-97);c.lineTo(42,0);c.lineTo(0,97);c.lineTo(-42,0);c.closePath();c.stroke();}
 c.fillStyle='#c6b27c';c.font='bold 20px serif';c.textAlign='center';c.fillText('YU-GI-OH!',0,7);back=new THREE.CanvasTexture(canvas);back.colorSpace=THREE.SRGBColorSpace;back.userData.shared=true;return back;
}
export function label(text: string, color='#b6d6df', width=512, height=96): THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d')!;
  c.fillStyle=color;c.font=`500 ${Math.round(height*0.36)}px monospace`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,width/2,height/2,width-20);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
