import * as THREE from 'three';

function stoneTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d')!;
  c.fillStyle='#172632';c.fillRect(0,0,512,512);let seed=1239;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(let i=0;i<18000;i++){const v=Math.floor(30+random()*30);c.fillStyle=`rgba(${v},${v+12},${v+20},.18)`;c.fillRect(random()*512,random()*512,1+random()*3,1+random()*2);}
  c.strokeStyle='#73919a1a';c.lineWidth=1;
  for(let i=0;i<14;i++){c.beginPath();let x=random()*512,y=random()*512;c.moveTo(x,y);for(let j=0;j<5;j++){x+=(random()-.5)*100;y+=(random()-.5)*90;c.lineTo(x,y);}c.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(5,5);return texture;
}
export function runeTexture():THREE.CanvasTexture{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d')!;c.translate(256,256);c.strokeStyle='#b2f3e6';c.lineWidth=2;
 for(const radius of [173,192,224]){c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.stroke();}
 for(let i=0;i<32;i++){c.save();c.rotate(i*Math.PI/16);c.beginPath();c.moveTo(0,-210);c.lineTo(0,-222);c.moveTo(-5,-204);c.lineTo(5,-204);c.stroke();c.restore();}
 for(let i=0;i<6;i++){c.save();c.rotate(i*Math.PI/3);c.beginPath();c.moveTo(0,-160);c.lineTo(140,80);c.lineTo(-140,80);c.closePath();c.stroke();c.restore();}
 c.beginPath();c.arc(0,0,55,0,Math.PI*2);c.stroke();const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function shadowTexture():THREE.CanvasTexture{
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!,g=ctx.createRadialGradient(64,64,5,64,64,64);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}

export class Coliseum {
  readonly group=new THREE.Group();
  readonly rune=runeTexture();
  readonly contactShadow=shadowTexture();
  private time=0;
  private portal=new THREE.Group();
  private crystal:THREE.Mesh;
  private sky:THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
  private flames:THREE.InstancedMesh;
  private embers:THREE.Points;
  private matrix=new THREE.Matrix4();
  private dummy=new THREE.Object3D();
  constructor(){
    const stone=new THREE.MeshStandardMaterial({color:'#8397a0',map:stoneTexture(),roughness:.86,metalness:.12});
    const brass=new THREE.MeshStandardMaterial({color:'#9f8153',roughness:.34,metalness:.85});
    const dark=new THREE.MeshStandardMaterial({color:'#111f2b',roughness:.54,metalness:.5});
    const glow=new THREE.MeshBasicMaterial({color:'#73cbbc',toneMapped:false});
    const floor=new THREE.Mesh(new THREE.CylinderGeometry(10.5,11,.5,96),stone);floor.position.y=-.27;floor.receiveShadow=true;this.group.add(floor);
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.CylinderGeometry(11.2+i*.7,11.3+i*.7,.15,96),dark);ring.position.y=-.48-i*.16;this.group.add(ring);}
    const tile=new THREE.BoxGeometry(.65,.04,1.1),tiles=new THREE.InstancedMesh(tile,brass,64);
    for(let i=0;i<64;i++){const a=i*Math.PI/32;this.dummy.position.set(Math.sin(a)*9.75,.015,Math.cos(a)*9.75);this.dummy.rotation.set(0,a,0);this.dummy.updateMatrix();tiles.setMatrixAt(i,this.dummy.matrix);}this.group.add(tiles);
    for(const radius of [5.9,6.04,9.2]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.013,4,128),glow);ring.rotation.x=-Math.PI/2;ring.position.y=.012;this.group.add(ring);}
    const pillars=new THREE.InstancedMesh(new THREE.CylinderGeometry(.32,.43,5.5,10),stone,16);
    const bands=new THREE.InstancedMesh(new THREE.CylinderGeometry(.52,.52,.17,10),brass,48);
    const insets=new THREE.InstancedMesh(new THREE.BoxGeometry(.045,3.8,.075),glow,16);
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8,x=Math.sin(a)*9,z=Math.cos(a)*9;
      this.dummy.position.set(x,2.75,z);this.dummy.rotation.set(0,a,0);this.dummy.updateMatrix();pillars.setMatrixAt(i,this.dummy.matrix);
      for(let j=0;j<3;j++){this.dummy.position.y=[.3,4.5,5.42][j];this.dummy.updateMatrix();bands.setMatrixAt(i*3+j,this.dummy.matrix);}
      this.dummy.position.set(x-Math.sin(a)*.36,2.8,z-Math.cos(a)*.36);this.dummy.updateMatrix();insets.setMatrixAt(i,this.dummy.matrix);
    }
    pillars.castShadow=pillars.receiveShadow=true;this.group.add(pillars,bands,insets);
    const arcs=new THREE.InstancedMesh(new THREE.TorusGeometry(1.72,.12,6,30,Math.PI),stone,16);
    for(let i=0;i<16;i++){const a=(i+.5)*Math.PI/8;this.dummy.position.set(Math.sin(a)*8.82,4.1,Math.cos(a)*8.82);this.dummy.rotation.set(0,a,0);this.dummy.updateMatrix();arcs.setMatrixAt(i,this.dummy.matrix);}this.group.add(arcs);
    const plinths=new THREE.InstancedMesh(new THREE.CylinderGeometry(.44,.57,.7,8),dark,4);
    this.flames=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18,1),new THREE.MeshBasicMaterial({color:'#ffb565',toneMapped:false}),4);
    for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;this.dummy.position.set(Math.sin(a)*6.8,.35,Math.cos(a)*6.8);this.dummy.rotation.set(0,a,0);this.dummy.updateMatrix();plinths.setMatrixAt(i,this.dummy.matrix);this.dummy.position.y=1;this.dummy.updateMatrix();this.flames.setMatrixAt(i,this.dummy.matrix);}this.group.add(plinths,this.flames);
    for(const radius of [1.8,2.05,2.23]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.023,5,96),new THREE.MeshBasicMaterial({color:'#a8ad80',transparent:true,opacity:.75,toneMapped:false}));this.portal.add(ring);}
    this.crystal=new THREE.Mesh(new THREE.IcosahedronGeometry(.5,0),new THREE.MeshStandardMaterial({color:'#bce7e1',emissive:'#3b8e88',emissiveIntensity:.8,metalness:.8,roughness:.24}));this.portal.add(this.crystal);this.portal.position.set(0,5.4,-9);this.group.add(this.portal);
    const aperture=new THREE.Mesh(new THREE.PlaneGeometry(3.5,3.5),new THREE.MeshBasicMaterial({map:this.rune,color:'#8ed7c9',transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false}));this.portal.add(aperture);
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(45,32,20),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{time:{value:0}},vertexShader:`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 p;uniform float time;void main(){vec3 d=normalize(p);float h=clamp(d.y*.6+.35,0.,1.);vec3 c=mix(vec3(.025,.055,.075),vec3(.006,.012,.035),h);float a=sin(d.x*8.+d.z*4.+time*.035)*.08+.27;float band=exp(-pow((d.y-a)*12.,2.));c+=band*vec3(.012,.07,.065)*(.5+.5*sin(d.z*7.+d.x*5.));gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}));this.group.add(this.sky);
    const positions=new Float32Array(360*3);let seed=8971;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
    for(let i=0;i<360;i++){const a=random()*Math.PI*2,r=12+random()*20;positions[i*3]=Math.cos(a)*r;positions[i*3+1]=3+random()*22;positions[i*3+2]=Math.sin(a)*r;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.embers=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#b0d1ce',size:.035,sizeAttenuation:true,transparent:true,opacity:.65,depthWrite:false}));this.group.add(this.embers);
  }
  update(delta:number,reduced:boolean){
    if(reduced)return;this.time+=Math.min(.05,delta);this.sky.material.uniforms.time.value=this.time;
    this.crystal.rotation.y=this.time*.16;this.crystal.rotation.z=Math.sin(this.time*.3)*.1;this.portal.rotation.z=Math.sin(this.time*.1)*.04;
    for(let i=0;i<4;i++){this.flames.getMatrixAt(i,this.matrix);this.matrix.decompose(this.dummy.position,this.dummy.quaternion,this.dummy.scale);this.dummy.scale.set(.8,1.1+Math.sin(this.time*3+i)*.16,.8);this.dummy.rotation.y=this.time*.5+i;this.dummy.updateMatrix();this.flames.setMatrixAt(i,this.dummy.matrix);}this.flames.instanceMatrix.needsUpdate=true;
    this.embers.rotation.y=this.time*.0015;
  }
  setDetail(detail:number){this.embers.geometry.setDrawRange(0,detail<1?160:360);}
}
