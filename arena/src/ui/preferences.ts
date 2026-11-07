export type Quality='balanced'|'performance'|'cinematic';
export interface Preferences{quality:Quality;motion:boolean;audio:boolean;haptics:boolean;ambience:boolean;difficulty:'training'|'warden';pace:number;telemetry:boolean;volume:number}
export const DEFAULT_PREFERENCES:Preferences={quality:'balanced',motion:false,audio:true,haptics:true,ambience:true,difficulty:'warden',pace:1,telemetry:false,volume:.65};
export interface Profile{wins:number;losses:number;bestTurns:number|null}
export const EMPTY_PROFILE:Profile={wins:0,losses:0,bestTurns:null};
export function readPreferences(storage:Pick<Storage,'getItem'>|undefined):Preferences{
 try{const p=JSON.parse(storage?.getItem('rift.preferences.v1')??'{}');return{
 quality:['balanced','performance','cinematic'].includes(p.quality)?p.quality:'balanced',
 motion:typeof p.motion==='boolean'?p.motion:false,audio:typeof p.audio==='boolean'?p.audio:true,haptics:typeof p.haptics==='boolean'?p.haptics:true,
 ambience:typeof p.ambience==='boolean'?p.ambience:true,difficulty:p.difficulty==='training'?'training':'warden',pace:[.8,1,1.5].includes(p.pace)?p.pace:1,telemetry:p.telemetry===true,volume:typeof p.volume==='number'&&Number.isFinite(p.volume)?Math.max(0,Math.min(1,p.volume)):.65,
 };}catch{return{...DEFAULT_PREFERENCES};}
}
export function readProfile(storage:Pick<Storage,'getItem'>|undefined):Profile{
 try{const p=JSON.parse(storage?.getItem('rift.profile.v1')??'{}'),safe=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<1e7?n:0;return{wins:safe(p.wins),losses:safe(p.losses),bestTurns:safe(p.bestTurns)||null};}catch{return{...EMPTY_PROFILE};}
}
export function saveLocal(storage:Pick<Storage,'setItem'>|undefined,key:string,value:unknown):void{try{storage?.setItem(key,JSON.stringify(value));}catch{/* Private mode may disallow persistence. The duel still works. */}}
