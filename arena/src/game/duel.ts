import {placementFeedback} from './placement';
import {combatForecast,attackPower} from './combat';
/** Rules remain independent of the renderer, animations, audio and card physics. */
export type Kind='dragon'|'sentinel'|'wisp'|'spell';
export type Stance='attack'|'defense';
export type Difficulty='training'|'warden';
export type SpellEffect='heal'|'ward'|'surge';
export interface Card {id:string;name:string;kind:Kind;attack:number;defense:number;color:string;text:string;effect?:SpellEffect;passcode?:number;race?:string;attribute?:string;level?:number;trap?:boolean}
export interface Unit {card:Card;attacked:boolean;stance?:Stance;shifted?:boolean;bonus?:number}
export interface Player {life:number;hand:Card[];deck:Card[];monsters:(Unit|null)[];spells:(Card|null)[];summoned:boolean;cast:boolean;negate:boolean}
export interface DuelState {turn:number;phase:'main'|'battle';players:[Player,Player];winner:0|1|null;log:string[];revision:number;difficulty:Difficulty}
export type Action={type:'summon';cardId:string;zone:number}|{type:'cast';cardId:string;zone:number;target?:number}|{type:'stance';zone:number}|{type:'battle'}|{type:'attack';from:number;target?:number}|{type:'end'}|{type:'reset';difficulty?:Difficulty;seed?:number};
export type DuelEvent={type:'summon'|'cast';owner:0|1;zone:number;card:Card}|{type:'attack';owner:0|1;from:number;target?:number}|{type:'stance';owner:0|1;zone:number;stance:Stance};
export interface DuelStep {event:DuelEvent;state:DuelState}
export interface DispatchResult {ok:boolean;message?:string;events?:DuelEvent[];steps?:DuelStep[]}
export const CATALOG:Omit<Card,'id'>[]=[
 {name:'Blue-Eyes White Dragon',passcode:89631139,race:'Dragon',attribute:'LIGHT',level:8,kind:'dragon',attack:3000,defense:2500,color:'#b4d9f2',text:'An iconic LIGHT Dragon with overwhelming attack power. Normal Monster.'},
 {name:'Dark Magician',passcode:46986414,race:'Spellcaster',attribute:'DARK',level:7,kind:'sentinel',attack:2500,defense:2100,color:'#bb9fe3',text:'Yugi’s signature DARK Spellcaster. A powerful Normal Monster.'},
 {name:'Celtic Guardian',passcode:91152256,race:'Warrior',attribute:'EARTH',level:4,kind:'wisp',attack:1400,defense:1200,color:'#9ed59c',text:'An EARTH Warrior armed with a sword. Normal Monster.'},
 {name:'Dian Keto the Cure Master',passcode:84257640,race:'Normal',kind:'spell',effect:'heal',attack:0,defense:0,color:'#a4d3bc',text:'Gain 1,000 Life Points. Life Points can rise above the starting 8,000.'},
 {name:'Negate Attack',passcode:14315573,race:'Counter',trap:true,kind:'spell',effect:'ward',attack:0,defense:0,color:'#d599bf',text:'Set this Counter Trap. It automatically negates the next opposing attack and ends that Battle Phase.'},
 {name:'Rush Recklessly',passcode:70046172,race:'Quick-Play',kind:'spell',effect:'surge',attack:0,defense:0,color:'#a4d3bc',text:'One of your face-up monsters gains 700 ATK until this turn ends. Select a monster before placing it.'},
];
function deck(owner:number,seed:number):Card[]{
 const order=[0,1,2,3,0,4,1,5,2,3,0,1,4,2,5,3];
 if(seed){let value=Math.abs(Math.floor(seed+owner*7919))%2147483647||1;for(let i=15;i>4;i--){value=value*16807%2147483647;const j=4+value%(i-3);[order[i],order[j]]=[order[j],order[i]];}}
 return order.map((index,i)=>({...CATALOG[index],id:`${owner}-${i}`}));
}
function player(owner:number,seed:number):Player{const cards=deck(owner,seed);return{life:8000,hand:cards.splice(0,4),deck:cards,monsters:[null,null,null],spells:[null,null,null],summoned:false,cast:false,negate:false};}
export class Duel{
 private value!:DuelState;
 private events:DuelEvent[]=[];
 private steps:DuelStep[]=[];
 private listeners=new Set<(state:DuelState)=>void>();
 private difficulty:Difficulty;
 private seed:number;
 constructor(options:{difficulty?:Difficulty;seed?:number}={}){this.difficulty=options.difficulty??'training';this.seed=options.seed??0;this.reset();}
 get state():DuelState{return structuredClone(this.value);}
 subscribe(listener:(state:DuelState)=>void){this.listeners.add(listener);listener(this.state);return()=>this.listeners.delete(listener);}
 private note(message:string){this.value.log=[message,...this.value.log].slice(0,30);}
 private reset(){
  this.value={turn:1,phase:'main',players:[player(0,this.seed),player(1,this.seed)],winner:null,log:['Your turn. Summon a monster into a glowing zone.'],revision:0,difficulty:this.difficulty};
  const enemy=this.value.players[1],card=enemy.hand.splice(1,1)[0];enemy.monsters[1]={card,attacked:false,stance:'attack',bonus:0,shifted:false};
 }
 dispatch(action:Action):DispatchResult{
  this.events=[];this.steps=[];
  if(action.type==='reset'){
   if(action.difficulty)this.difficulty=action.difficulty;
   if(action.seed!==undefined&&Number.isFinite(action.seed))this.seed=action.seed;
   this.reset();this.emit();return{ok:true,events:[],steps:[]};
  }
  if(this.value.winner!==null)return{ok:false,message:'The duel is complete. Start a new duel.'};
  const p=this.value.players[0];
  if(action.type==='summon'||action.type==='cast'){
   const row=action.type==='summon'?'monster':'spell',feedback=placementFeedback(this.value,action.cardId,{owner:0,index:action.zone,row});
   if(!feedback.ok)return feedback;
   const card=p.hand.find(c=>c.id===action.cardId)!;
   if(action.type==='cast'&&card.effect==='surge'&&(action.target===undefined||!Number.isInteger(action.target)||action.target<0||action.target>2||!p.monsters[action.target]))return{ok:false,message:'Select a friendly face-up monster for Rush Recklessly.'};
   p.hand=p.hand.filter(c=>c.id!==card.id);
   if(action.type==='summon'){
    p.monsters[action.zone]={card,attacked:false,stance:'attack',shifted:false,bonus:0};p.summoned=true;this.note(`${card.name} enters the arena.`);
   }else this.cast(0,card,action.zone,action.target);
   this.record({type:action.type,owner:0,zone:action.zone,card});
  }else if(action.type==='stance'){
   if(this.value.phase!=='main')return{ok:false,message:'Change stance during the main phase.'};
   const unit=Number.isInteger(action.zone)?p.monsters[action.zone]:null;
   if(!unit)return{ok:false,message:'Select one of your monsters first.'};
   if(unit.shifted)return{ok:false,message:'That monster has already changed stance this turn.'};
   unit.stance=unit.stance==='defense'?'attack':'defense';unit.shifted=true;
   this.note(`${unit.card.name} takes ${unit.stance} stance.`);this.record({type:'stance',owner:0,zone:action.zone,stance:unit.stance});
  }else if(action.type==='battle'){
   if(this.value.phase==='battle')return{ok:false,message:'Already in battle phase.'};
   this.value.phase='battle';this.note('Battle phase. Select your monster, then an opposing monster.');
  }else if(action.type==='attack'){
   if(this.value.phase!=='battle')return{ok:false,message:'Enter battle phase first.'};
   if(!Number.isInteger(action.from)||action.from<0||action.from>2)return{ok:false,message:'Choose one of your monsters.'};
   const forecast=combatForecast(this.value,0,action.from,action.target);
   if(!forecast.ok)return{ok:false,message:forecast.message};
   this.resolveAttack(0,action.from,action.target);
  }else if(action.type==='end'){
   p.monsters.forEach(u=>{if(u)u.bonus=0;});this.opponentTurn();
   if(this.value.winner===null){
    this.value.turn++;this.value.phase='main';p.summoned=false;p.cast=false;p.spells=p.spells.map(card=>card?.trap&&p.negate?card:null);
    p.monsters.forEach(u=>{if(u){u.attacked=false;u.shifted=false;u.bonus=0;}});
    if(!p.deck.length){this.value.winner=1;this.note('Your deck is exhausted. Yami Yugi wins the duel.');}
    else{if(p.hand.length<7)p.hand.push(p.deck.shift()!);this.note(`Turn ${this.value.turn}. Your main phase.`);}
   }
  }else return{ok:false,message:'Unknown duel action.'};
  const result={ok:true,events:structuredClone(this.events),steps:structuredClone(this.steps)};this.emit();return result;
 }
 private cast(owner:0|1,card:Card,zone:number,target?:number){
  const p=this.value.players[owner];p.spells[zone]=card;p.cast=true;
  if(card.effect==='ward'){p.negate=true;this.note('A Counter Trap is set.');}
  else if(card.effect==='surge'){const unit=p.monsters[target!]!;unit.bonus=(unit.bonus??0)+700;this.note(`Rush Recklessly gives ${unit.card.name} 700 ATK for this turn.`);}
  else{const healed=1000;p.life+=healed;this.note(`Dian Keto restores ${healed} Life Points.`);}
 }
 private resolveAttack(owner:0|1,from:number,target?:number){
  const p=this.value.players[owner],enemy=this.value.players[1-owner],unit=p.monsters[from]!,other=target===undefined?null:enemy.monsters[target];
  const f=combatForecast(this.value,owner,from,target);unit.attacked=true;
  if(f.negated){enemy.negate=false;p.monsters.forEach(u=>{if(u)u.attacked=true;});this.note('Negate Attack activates. The attack is negated and the Battle Phase ends.');this.record({type:'attack',owner,from,target});return true;}
  if(f.destroyAttacker)p.monsters[from]=null;if(f.destroyDefender&&target!==undefined)enemy.monsters[target]=null;
  const damaged=this.value.players[f.damageTo];damaged.life=Math.max(0,damaged.life-f.damage);
  this.note(!other?`${unit.card.name} strikes directly for ${f.damage}.`:f.defense?`${other.card.name}: ${f.message.toLowerCase()}.`:f.destroyAttacker&&f.destroyDefender?'Equal power. Both monsters fall.':`${f.destroyDefender?unit.card.name:other.card.name} wins the clash. ${f.damage} damage${f.blocked?` · ${f.blocked} absorbed`:''}.`);
  if(enemy.life===0)this.value.winner=owner;if(p.life===0)this.value.winner=(1-owner)as 0|1;
  if(this.value.winner!==null)this.note(this.value.winner===0?'Victory. The duel is yours.':'Defeat. Prepare for a rematch.');
  this.record({type:'attack',owner,from,target});return false;
 }
 private opponentTurn(){
  const enemy=this.value.players[1],p=this.value.players[0];enemy.cast=false;enemy.spells=enemy.spells.map(card=>card?.trap&&enemy.negate?card:null);
  enemy.monsters.forEach(u=>{if(u){u.attacked=false;u.shifted=false;u.bonus=0;}});
  if(!enemy.deck.length){this.value.winner=0;this.note('Yami Yugi’s deck is exhausted. Victory is yours.');return;}
  if(enemy.hand.length<7)enemy.hand.push(enemy.deck.shift()!);
  const zone=enemy.monsters.findIndex(u=>!u);
  const monsters=enemy.hand.map((card,index)=>({card,index})).filter(c=>c.card.kind!=='spell');
  if(this.difficulty==='warden')monsters.sort((a,b)=>(b.card.attack+b.card.defense*.15)-(a.card.attack+a.card.defense*.15));
  if(zone>=0&&monsters.length){const card=enemy.hand.splice(monsters[0].index,1)[0];enemy.monsters[zone]={card,attacked:false,stance:'attack',bonus:0};this.note(`Yami Yugi summons ${card.name}.`);this.record({type:'summon',owner:1,zone,card});}
  if(this.difficulty==='warden'){
   const spell=enemy.hand.find(c=>c.effect==='heal'&&enemy.life<=7200)??enemy.hand.find(c=>c.effect==='surge'&&enemy.monsters.some(Boolean))??enemy.hand.find(c=>c.effect==='ward'&&!enemy.negate&&p.monsters.some(Boolean));
   if(spell){enemy.hand=enemy.hand.filter(c=>c.id!==spell.id);const target=enemy.monsters.map((u,index)=>({u,index})).filter(t=>t.u).sort((a,b)=>attackPower(b.u!)-attackPower(a.u!))[0]?.index;const spellZone=enemy.spells.findIndex(c=>!c);this.cast(1,spell,spellZone<0?0:spellZone,target);this.record({type:'cast',owner:1,zone:spellZone<0?0:spellZone,card:spell});}
   for(let i=0;i<3;i++){
    const unit=enemy.monsters[i];if(!unit)continue;
    const canWin=!p.monsters.some(Boolean)||p.monsters.some(u=>u&&attackPower(unit)>=(u.stance==='defense'?u.card.defense:attackPower(u)));
    const stance:Stance=canWin?'attack':'defense';if((unit.stance??'attack')!==stance){unit.stance=stance;this.note(`${unit.card.name} takes ${stance} stance.`);this.record({type:'stance',owner:1,zone:i,stance});}
   }
  }
  for(let i=0;i<3&&this.value.winner===null;i++){
   const unit=enemy.monsters[i];if(!unit||unit.stance==='defense')continue;
   const targets=p.monsters.map((u,index)=>({u,index})).filter(t=>t.u).sort((a,b)=>(a.u!.stance==='defense'?a.u!.card.defense:attackPower(a.u!))-(b.u!.stance==='defense'?b.u!.card.defense:attackPower(b.u!)));
   const target=targets[0]?.index,f=combatForecast(this.value,1,i,target);
   if(this.difficulty==='warden'&&f.destroyAttacker&&!f.destroyDefender)continue;
   if(this.resolveAttack(1,i,target))break;
  }
  enemy.monsters.forEach(u=>{if(u)u.bonus=0;});
 }
 private record(event:DuelEvent){this.events.push(event);this.steps.push({event:structuredClone(event),state:this.state});}
 private emit(){this.value.revision++;for(const listener of this.listeners)listener(this.state);}
}
