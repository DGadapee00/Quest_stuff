import type {DuelState,Unit} from './duel';
export const attackPower=(unit:Unit)=>unit.card.attack+(unit.bonus??0);
export const defensePower=(unit:Unit)=>unit.card.defense;
export interface CombatForecast {ok:boolean;message:string;power:number;resistance:number;damage:number;rawDamage:number;blocked:number;damageTo:0|1;destroyAttacker:boolean;destroyDefender:boolean;defense:boolean;negated:boolean}
export function combatForecast(state:DuelState,owner:0|1,from:number,target?:number,revealTraps=true):CombatForecast{
 const result:CombatForecast={ok:false,message:'Choose a monster that can attack.',power:0,resistance:0,damage:0,rawDamage:0,blocked:0,damageTo:(1-owner)as 0|1,destroyAttacker:false,destroyDefender:false,defense:false,negated:false};
 const attacker=state.players[owner].monsters[from],enemy=state.players[1-owner];
 if(!attacker||attacker.attacked||attacker.stance==='defense')return result;
 if(target!==undefined&&(!Number.isInteger(target)||target<0||target>2||!enemy.monsters[target])){result.message='Choose an opposing monster.';return result;}
 if(enemy.monsters.some(Boolean)&&target===undefined){result.message='Select an opposing monster to attack.';return result;}
 result.ok=true;result.power=attackPower(attacker);if(enemy.negate&&revealTraps){result.negated=true;result.message='Negate Attack ends this Battle Phase.';return result;}
 const defender=target===undefined?null:enemy.monsters[target];
 if(!defender){result.rawDamage=result.power;}
 else{
  result.defense=defender.stance==='defense';result.resistance=result.defense?defensePower(defender):attackPower(defender);
  const delta=result.power-result.resistance;
  if(result.defense){result.destroyDefender=delta>0;if(delta<0){result.damageTo=owner;result.rawDamage=-delta;}}
  else{result.destroyAttacker=delta<=0;result.destroyDefender=delta>=0;result.damageTo=delta<0?owner:(1-owner)as 0|1;result.rawDamage=Math.abs(delta);}
 }
 result.damage=result.rawDamage;
 result.message=result.destroyAttacker&&result.destroyDefender?'Equal power · both monsters fall':result.damage>0?`${result.damageTo===0?'You take':'Yami Yugi takes'} ${result.damage} damage${result.blocked?` · ${result.blocked} absorbed`:''}`:result.destroyDefender?'Break the defense · no life damage':result.blocked?'The attack is blocked':'Defense holds · no monster destroyed';
 return result;
}
