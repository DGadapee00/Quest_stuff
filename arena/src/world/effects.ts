import * as THREE from 'three';

export type Element='dragon'|'sentinel'|'wisp'|'spell';
export const ELEMENT_COLOR:Record<Element,string>={dragon:'#b9e5ff',sentinel:'#b696ed',wisp:'#d0e6ac',spell:'#d1b6ff'};
const temp=new THREE.Vector3();

/** Bounded combat effects. One particle draw, reusable rings, no full-screen VR effects. */
export class ArenaEffects {
  readonly group=new THREE.Group();
  private capacity=480;
  private positions=new Float32Array(this.capacity*3);
  private colors=new Float32Array(this.capacity*3);
  private lives=new Float32Array(this.capacity);
  private velocities=new Float32Array(this.capacity*3);
  private ages=new Float32Array(this.capacity);
  private durations=new Float32Array(this.capacity);
  private gravity=new Float32Array(this.capacity);
  private cursor=0;
  private geometry=new THREE.BufferGeometry();
  private rings:{mesh:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;age:number;duration:number;scale:number;rise:number}[]=[];
  private bolts:{mesh:THREE.Mesh;trail:THREE.Line;from:THREE.Vector3;to:THREE.Vector3;age:number;duration:number;kind:Element}[]=[];
  private labels:{sprite:THREE.Sprite;age:number;position:THREE.Vector3}[]=[];
  private labelCursor=0;
  private light:THREE.PointLight;
  private lightAge=0;
  private detail=1;
  private randomSeed=4817;
  private particles:THREE.Points;
  private shards=Array.from({length:72},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),rotation:new THREE.Vector3(),age:2,duration:1}));
  private shardMesh:THREE.InstancedMesh;
  private shardCursor=0;
  private dummy=new THREE.Object3D();

  constructor(){
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3));
    this.geometry.setAttribute('life',new THREE.BufferAttribute(this.lives,1));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexColors:true,
      uniforms:{pointScale:{value:420}},vertexShader:`attribute float life; varying vec3 tint; varying float fade; uniform float pointScale;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;tint=color;fade=life;gl_PointSize=life>0.?clamp(pointScale*.035/max(.1,-p.z),1.,32.)*(.3+life):0.;}`,
      fragmentShader:`varying vec3 tint;varying float fade;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d),2.);gl_FragColor=vec4(tint*1.5,a*fade);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
    this.particles=new THREE.Points(this.geometry,material);this.particles.frustumCulled=false;this.group.add(this.particles);
    for(let i=0;i<10;i++){
      const mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,64),new THREE.MeshBasicMaterial({color:'#92eee0',side:THREE.DoubleSide,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
      mesh.rotation.x=-Math.PI/2;mesh.visible=false;this.group.add(mesh);this.rings.push({mesh,age:2,duration:1,scale:1,rise:0});
    }
    for(let i=0;i<8;i++){
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));sprite.scale.set(1.3,.325,1);sprite.visible=false;
      this.group.add(sprite);this.labels.push({sprite,age:2,position:new THREE.Vector3()});
    }
    this.shardMesh=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.045),new THREE.MeshStandardMaterial({color:'#ffffff',metalness:.55,roughness:.35}),this.shards.length);this.shardMesh.frustumCulled=false;this.shardMesh.visible=false;this.group.add(this.shardMesh);
    this.light=new THREE.PointLight('#ffc189',0,6,2);this.group.add(this.light);
  }
  private random(){this.randomSeed=(this.randomSeed*16807)%2147483647;return this.randomSeed/2147483647;}
  setDetail(value:number){this.detail=value;}
  setViewport(height:number){(this.particles.material as THREE.ShaderMaterial).uniforms.pointScale.value=height;}
  burst(position:THREE.Vector3,color:string,count=40,speed=1.4,gravity=1.6){
    const tint=new THREE.Color(color);
    for(let j=0;j<Math.round(count*this.detail);j++){
      const i=this.cursor++%this.capacity,o=i*3,theta=this.random()*Math.PI*2,z=this.random()*2-1,r=Math.sqrt(1-z*z),v=speed*(.3+this.random()*.7);
      this.positions[o]=position.x;this.positions[o+1]=position.y;this.positions[o+2]=position.z;
      this.velocities[o]=Math.cos(theta)*r*v;this.velocities[o+1]=Math.abs(z)*v+.2;this.velocities[o+2]=Math.sin(theta)*r*v;
      this.colors[o]=tint.r;this.colors[o+1]=tint.g;this.colors[o+2]=tint.b;
      this.ages[i]=0;this.durations[i]=.35+this.random()*.8;this.lives[i]=1;this.gravity[i]=gravity;
    }
  }
  ring(position:THREE.Vector3,color:string,scale=1,duration=.7,rise=0){
    const ring=this.rings.find(r=>r.age>=r.duration)??this.rings[0];ring.age=0;ring.duration=duration;ring.scale=scale;ring.rise=rise;
    ring.mesh.position.copy(position);ring.mesh.material.color.set(color);ring.mesh.visible=true;ring.mesh.scale.setScalar(.01);
  }
  summon(position:THREE.Vector3,kind:Element){
    const color=ELEMENT_COLOR[kind],base=position.clone();base.y=.965;
    this.ring(base,color,.8,1.0);this.ring(base,color,.5,.9,1.15);
    this.burst(base,color,65,.95,-.4);this.flash(position,color,3);
  }
  projectile(from:THREE.Vector3,to:THREE.Vector3,kind:Element,duration=.42){
    if(this.bolts.length>=6)this.removeBolt(0);
    const color=ELEMENT_COLOR[kind];
    const mesh=new THREE.Mesh(kind==='wisp'?new THREE.TorusGeometry(.19,.024,4,24,Math.PI*1.3):new THREE.IcosahedronGeometry(.075,1),new THREE.MeshBasicMaterial({color,toneMapped:false}));
    const trail=new THREE.Line(new THREE.BufferGeometry().setFromPoints([from,from]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.8,blending:THREE.AdditiveBlending}));
    mesh.position.copy(from);trail.frustumCulled=false;this.group.add(mesh,trail);this.bolts.push({mesh,trail,from:from.clone(),to:to.clone(),age:0,duration,kind});
  }
  impact(position:THREE.Vector3,kind:Element,blocked=false){
    const color=blocked?'#b2d7ff':ELEMENT_COLOR[kind];this.burst(position,color,blocked?35:80,blocked?1:2.2,3.2);
    const floor=position.clone();floor.y=.97;this.ring(floor,color,blocked?.55:1.2,.65);this.flash(position,color,4);
  }
  shatter(position:THREE.Vector3,color:string,count=22){
    this.shardMesh.visible=true;
    for(let i=0;i<Math.round(count*this.detail);i++){
      const index=this.shardCursor++%this.shards.length,s=this.shards[index],a=this.random()*Math.PI*2;
      s.position.copy(position);s.velocity.set(Math.cos(a)*(.4+this.random()),.7+this.random()*1.4,Math.sin(a)*(.4+this.random()));s.rotation.set(this.random()*5,this.random()*5,this.random()*5);s.age=0;s.duration=.8+this.random()*.5;
      this.shardMesh.setColorAt(index,new THREE.Color(color));
    }
    if(this.shardMesh.instanceColor)this.shardMesh.instanceColor.needsUpdate=true;
  }
  flash(position:THREE.Vector3,color:string,intensity:number){this.light.position.copy(position);this.light.color.set(color);this.light.intensity=intensity*this.detail;this.lightAge=0;}
  text(position:THREE.Vector3,text:string,color='#fff0d4'){
    const label=this.labels[this.labelCursor++%this.labels.length],texture=(label.sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas=texture.image as HTMLCanvasElement,c=canvas.getContext('2d')!;c.clearRect(0,0,512,128);
    c.textAlign='center';c.textBaseline='middle';c.font='600 72px sans-serif';c.shadowColor='#07111c';c.shadowBlur=12;c.fillStyle=color;c.fillText(text,256,64,500);texture.needsUpdate=true;
    label.position.copy(position);label.sprite.position.copy(position);label.age=0;label.sprite.visible=true;
  }
  update(delta:number,reduced=false){
    const dt=Math.min(.05,Math.max(0,delta));
    for(let i=0;i<this.capacity;i++)if(this.lives[i]>0){
      const o=i*3;this.ages[i]+=dt;this.lives[i]=Math.max(0,1-this.ages[i]/this.durations[i]);
      if(!reduced){this.velocities[o+1]-=this.gravity[i]*dt;this.positions[o]+=this.velocities[o]*dt;this.positions[o+1]+=this.velocities[o+1]*dt;this.positions[o+2]+=this.velocities[o+2]*dt;}
      if(this.positions[o+1]<.9){this.positions[o+1]=.9;this.velocities[o+1]=Math.abs(this.velocities[o+1])*.18;}
    }
    this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;this.geometry.attributes.life.needsUpdate=true;
    for(const ring of this.rings){ring.age+=dt;if(ring.age>=ring.duration){ring.mesh.visible=false;continue;}const t=ring.age/ring.duration;ring.mesh.scale.setScalar(reduced?ring.scale:Math.max(.01,ring.scale*(.25+t*.85)));ring.mesh.material.opacity=(1-t)*.7;if(!reduced)ring.mesh.position.y+=ring.rise*dt;}
    for(let i=this.bolts.length-1;i>=0;i--){const bolt=this.bolts[i];bolt.age+=dt;const t=Math.min(1,bolt.age/bolt.duration);bolt.mesh.position.lerpVectors(bolt.from,bolt.to,t);if(!reduced)bolt.mesh.position.y+=Math.sin(t*Math.PI)*.18;
      bolt.mesh.rotation.z+=dt*7;temp.lerpVectors(bolt.from,bolt.to,Math.max(0,t-.18));const a=bolt.trail.geometry.attributes.position;a.setXYZ(0,temp.x,temp.y,temp.z);a.setXYZ(1,bolt.mesh.position.x,bolt.mesh.position.y,bolt.mesh.position.z);a.needsUpdate=true;
      if(t>=1)this.removeBolt(i);
    }
    for(const label of this.labels){label.age+=dt;if(label.age>1.1){label.sprite.visible=false;continue;}label.sprite.position.copy(label.position);if(!reduced)label.sprite.position.y+=label.age*.4;(label.sprite.material as THREE.SpriteMaterial).opacity=Math.min(1,(1.1-label.age)*3);}
    let shardCount=0;
    for(let i=0;i<this.shards.length;i++){
      const shard=this.shards[i];shard.age+=dt;
      if(shard.age<shard.duration){
        shardCount++;if(!reduced){shard.velocity.y-=5.5*dt;shard.position.addScaledVector(shard.velocity,dt);shard.rotation.x+=dt*3;shard.rotation.z+=dt*2;if(shard.position.y<.93){shard.position.y=.93;shard.velocity.y=Math.abs(shard.velocity.y)*.25;shard.velocity.x*=.8;shard.velocity.z*=.8;}}
        this.dummy.position.copy(shard.position);this.dummy.rotation.set(shard.rotation.x,shard.rotation.y,shard.rotation.z);this.dummy.scale.setScalar(Math.max(.001,1-shard.age/shard.duration));
      }else this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();this.shardMesh.setMatrixAt(i,this.dummy.matrix);
    }
    this.shardMesh.visible=shardCount>0;this.shardMesh.instanceMatrix.needsUpdate=true;
    this.lightAge+=dt;this.light.intensity*=Math.exp(-dt*10);
  }
  private removeBolt(index:number){const bolt=this.bolts[index];this.group.remove(bolt.mesh,bolt.trail);bolt.mesh.geometry.dispose();(bolt.mesh.material as THREE.Material).dispose();bolt.trail.geometry.dispose();(bolt.trail.material as THREE.Material).dispose();this.bolts.splice(index,1);}
  clear(){this.lives.fill(0);this.geometry.attributes.life.needsUpdate=true;for(const ring of this.rings)ring.mesh.visible=false;for(const label of this.labels)label.sprite.visible=false;while(this.bolts.length)this.removeBolt(0);this.light.intensity=0;for(const shard of this.shards)shard.age=shard.duration;this.shardMesh.visible=false;}
  get activeShards(){return this.shards.filter(s=>s.age<s.duration).length;}
  get activeParticles(){let count=0;for(const life of this.lives)if(life>0)count++;return count;}
}
