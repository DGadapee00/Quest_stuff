import type { DuelState, DuelStep } from '../game/duel';

/** Presentation time never changes rules. No timers survive reset or XR interruption. */
export class DuelPresentation {
  private steps: DuelStep[] = [];
  private final?: DuelState;
  private before?: DuelState;
  private index = 0;
  private elapsed = 0;
  private impacted = false;
  private paused = false;
  private speed=1;
  get busy(): boolean { return this.final !== undefined; }
  get owner(): 0 | 1 | undefined { return this.steps[this.index]?.event.owner; }
  onBusy: (busy: boolean) => void = () => {};
  onStep: (stage: 'start' | 'impact', step: DuelStep, before: DuelState) => void = () => {};
  onComplete: (state: DuelState) => void = () => {};

  play(initial: DuelState, steps: DuelStep[], final: DuelState): boolean {
    if (this.busy) return false;
    if (!steps.length) { this.onComplete(final); return true; }
    this.steps = steps; this.before = initial; this.final = final;
    this.index = 0; this.elapsed = 0; this.impacted = false;
    this.onBusy(true); this.start(); return true;
  }
  setSpeed(speed:number):void{this.speed=Number.isFinite(speed)?Math.max(.5,Math.min(2,speed)):1;}
  setPaused(paused: boolean): void { this.paused = paused; }
  update(delta: number): void {
    if (!this.busy || this.paused || !Number.isFinite(delta)) return;
    // Returning from a background tab must not fast-forward several attacks in one frame.
    this.elapsed += Math.min(0.1, Math.max(0, delta))*this.speed;
    const step = this.steps[this.index];
    if (step.event.type === 'attack' && !this.impacted && this.elapsed >= 0.42) {
      this.impacted = true; this.onStep('impact', step, this.before!);
      if (!this.busy) return;
    }
    const duration = step.event.type === 'attack' ? 1.1 : 0.9;
    if (this.elapsed < duration) return;
    this.before = step.state; this.index++;
    if (this.index >= this.steps.length) { this.finish(); return; }
    this.elapsed = 0; this.impacted = false; this.start();
  }
  private start(): void { this.onStep('start', this.steps[this.index], this.before!); }
  /** Settle the already-validated transaction when leaving VR. Never replay effects. */
  finish(): void {
    const final = this.final;
    if (!final) return;
    this.clear(); this.onBusy(false); this.onComplete(final);
  }
  /** Reset cancels without restoring the old duel's final snapshot. */
  cancel(): void {
    const wasBusy = this.busy; this.clear();
    if (wasBusy) this.onBusy(false);
  }
  private clear(): void {
    this.steps = []; this.final = undefined; this.before = undefined;
    this.index = 0; this.elapsed = 0; this.impacted = false;
  }
}
