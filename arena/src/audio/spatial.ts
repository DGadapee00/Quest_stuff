import * as THREE from 'three';

type Effect = 'summon' | 'cast' | 'launch' | 'impact' | 'card' | 'select' | 'turn' | 'victory' | 'defeat';
type Timbre='dragon'|'sentinel'|'wisp'|'spell';
interface Voice { stop(): void }

/** Bounded, synthesized positional audio: no downloads or persistent render-loop allocations. */
export class SpatialAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private enabled = true;
  private ambience=false;
  private volume=.65;
  private bed?:{sources:OscillatorNode[];gain:GainNode};
  private echo?:DelayNode;
  private voices = new Set<Voice>();
  private listenerMatrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private orientation = new THREE.Quaternion();
  private forward = new THREE.Vector3();
  private up = new THREE.Vector3();

  unlock(): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (!this.master) { this.master = this.context.createGain(); this.master.gain.value = this.volume*.7; this.master.connect(this.context.destination);
        if(typeof this.context.createDelay==='function'){this.echo=this.context.createDelay(.5);this.echo.delayTime.value=.17;const feedback=this.context.createGain();feedback.gain.value=.18;this.echo.connect(feedback);feedback.connect(this.echo);const wet=this.context.createGain();wet.gain.value=.22;this.echo.connect(wet);wet.connect(this.master);} }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      this.startBed();
    } catch { /* Silent fallback when audio is unavailable. */ }
  }

  stopAll(): void {for(const voice of [...this.voices])voice.stop();this.stopBed();}
  setVolume(value:number):void{this.volume=Math.max(0,Math.min(1,value));if(this.context&&this.master)this.master.gain.setValueAtTime(this.enabled?this.volume*.7:0,this.context.currentTime);}
  setAmbience(enabled:boolean):void{this.ambience=enabled;if(!enabled)this.stopBed();else this.startBed();}
  private startBed():void{
    const ctx=this.context;if(!ctx||!this.master||!this.enabled||!this.ambience||this.bed)return;
    const gain=ctx.createGain();gain.gain.value=.012;gain.connect(this.master);const sources:OscillatorNode[]=[];
    for(const frequency of [55,82.406,110,164.81]){const o=ctx.createOscillator();o.type='sine';o.frequency.value=frequency;o.connect(gain);o.start();sources.push(o);}
    this.bed={sources,gain};
  }
  private stopBed():void{if(!this.bed)return;for(const source of this.bed.sources){try{source.stop();}catch{}source.disconnect();}this.bed.gain.disconnect();this.bed=undefined;}


  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopAll();
    if (this.master && this.context) this.master.gain.setValueAtTime(enabled ? this.volume*.7 : 0, this.context.currentTime);
    if (enabled && this.context) this.unlock();
  }

  updateListener(camera: THREE.Camera, referenceFrame?: THREE.Object3D): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    if (referenceFrame) {
      // XR cameras have a local pose but no Object3D parent. Include the player rig
      // without calling updateWorldMatrix() on Three's internally managed XR camera.
      referenceFrame.updateWorldMatrix(true, false);
      this.listenerMatrix.multiplyMatrices(referenceFrame.matrixWorld, camera.matrix);
    } else {
      camera.updateWorldMatrix(true, false); this.listenerMatrix.copy(camera.matrixWorld);
    }
    this.position.setFromMatrixPosition(this.listenerMatrix);
    this.orientation.setFromRotationMatrix(this.listenerMatrix);
    this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
    this.up.set(0, 1, 0).applyQuaternion(this.orientation);
    const listener = ctx.listener, time = ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(this.position.x, time); listener.positionY.setValueAtTime(this.position.y, time); listener.positionZ.setValueAtTime(this.position.z, time);
      listener.forwardX.setValueAtTime(this.forward.x, time); listener.forwardY.setValueAtTime(this.forward.y, time); listener.forwardZ.setValueAtTime(this.forward.z, time);
      listener.upX.setValueAtTime(this.up.x, time); listener.upY.setValueAtTime(this.up.y, time); listener.upZ.setValueAtTime(this.up.z, time);
    } else {
      listener.setPosition(this.position.x, this.position.y, this.position.z);
      listener.setOrientation(this.forward.x, this.forward.y, this.forward.z, this.up.x, this.up.y, this.up.z);
    }
  }

  play(effect: Effect, position: THREE.Vector3, delay = 0,kind:Timbre='sentinel'): void {
    try { this.emit(effect, position, delay,kind); } catch { /* Audio errors never reject a legal move. */ }
  }

  private emit(effect: Effect, position: THREE.Vector3, delay: number,kind:Timbre): void {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx || !this.master) return;
    // Drop the oldest emitter during rapid opponent combat or repeated interactions.
    if (this.voices.size >= 8) this.voices.values().next().value?.stop();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 2;
    panner.maxDistance = 25; panner.rolloffFactor = 0.65;
    panner.positionX.value = position.x; panner.positionY.value = position.y; panner.positionZ.value = position.z;
    panner.connect(this.master);if(this.echo)panner.connect(this.echo);
    const base=kind==='dragon'?110:kind==='wisp'?330:220;
    const frequencies=effect==='summon'?[base,base*1.5,base*2]:effect==='cast'?[440,660,880]:effect==='launch'?[base*.65,base]:effect==='card'?[280,190]:effect==='select'?[660,880]:effect==='turn'?[261.6,329.6,392]:effect==='victory'?[261.6,329.6,392,523.25]:effect==='defeat'?[196,155.56,130.81]:[55,82,110];
    const start = ctx.currentTime + delay;
    const oscillators: OscillatorNode[] = [], gains: GainNode[] = [];
    let pending = frequencies.length, stopped = false;
    const voice: Voice = { stop: () => {
      if (stopped) return;
      stopped = true;
      for (const oscillator of oscillators) { oscillator.onended = null; try { oscillator.stop(); } catch {} oscillator.disconnect(); }
      gains.forEach(g => g.disconnect()); panner.disconnect(); this.voices.delete(voice);
    }};
    this.voices.add(voice);
    try { frequencies.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const short=effect==='card'||effect==='select';
      const when=start+index*(effect==='victory'?.12:.045),duration=short?.09:effect==='impact'?.32:effect==='victory'||effect==='defeat'?.85:.6;
      oscillator.type = effect === 'impact'||(effect==='launch'&&kind==='dragon') ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, when);
      if (effect === 'launch') oscillator.frequency.exponentialRampToValueAtTime(frequency * 2, when + 0.2);
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(short?.018:effect==='impact'?.09:.055, when + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
      oscillator.connect(gain); gain.connect(panner); oscillators.push(oscillator); gains.push(gain);
      oscillator.onended = () => { if (--pending === 0) voice.stop(); };
      oscillator.start(when); oscillator.stop(when + duration + 0.02);
    }); } catch { voice.stop(); }
  }
}
