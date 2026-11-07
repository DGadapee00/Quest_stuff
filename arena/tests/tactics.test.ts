import{test}from'node:test';import assert from'node:assert/strict';
import{Duel,CATALOG,type Unit}from'../src/game/duel';import{combatForecast,attackPower}from'../src/game/combat';import{placementFeedback}from'../src/game/placement';
const unit=(index:number,stance:'attack'|'defense'='attack'):Unit=>({card:{...CATALOG[index],id:'unit-'+index},attacked:false,stance,bonus:0});
function summon(d:Duel,name:string,zone=0){const card=d.state.players[0].hand.find(c=>c.name===name);assert.ok(card);assert.equal(d.dispatch({type:'summon',cardId:card.id,zone}).ok,true);}
function cast(d:Duel,name:string,target?:number){const card=d.state.players[0].hand.find(c=>c.name===name);assert.ok(card);return d.dispatch({type:'cast',cardId:card.id,zone:0,target});}
function reachCounterTrap(){
 const d=new Duel();summon(d,'Dark Magician');d.dispatch({type:'stance',zone:0});assert.equal(cast(d,'Dian Keto the Cure Master').ok,true);d.dispatch({type:'end'});
 summon(d,'Blue-Eyes White Dragon');d.dispatch({type:'battle'});d.dispatch({type:'attack',from:0,target:0});d.dispatch({type:'end'});
 assert.equal(d.state.winner,null);assert.ok(d.state.players[0].hand.some(c=>c.name==='Negate Attack'));return d;
}
test('catalog uses verified Yu-Gi-Oh names, passcodes and printed monster statistics',()=>{
 assert.deepEqual(CATALOG.slice(0,3).map(c=>[c.name,c.passcode,c.attack,c.defense,c.level]),[
 ['Blue-Eyes White Dragon',89631139,3000,2500,8],['Dark Magician',46986414,2500,2100,7],['Celtic Guardian',91152256,1400,1200,4],]);
});
test('defense resolves ATK versus DEF without destroying a weaker attacker',()=>{
 const state=new Duel().state;state.players[0].monsters[0]=unit(2);state.players[1].monsters[1]=unit(1,'defense');
 let f=combatForecast(state,0,0,1);assert.equal(f.damage,700);assert.equal(f.damageTo,0);assert.equal(f.destroyAttacker,false);assert.equal(f.destroyDefender,false);
 state.players[0].monsters[0]!.bonus=800;f=combatForecast(state,0,0,1);assert.equal(f.damage,0);assert.equal(f.destroyDefender,true);
 state.players[0].monsters[0]!.bonus=700;f=combatForecast(state,0,0,1);assert.equal(f.damage,0);assert.equal(f.destroyDefender,false);
});
test('Negate Attack protects monsters and hidden-trap forecasts do not reveal it',()=>{
 const state=new Duel().state;state.players[0].monsters[0]=unit(0);state.players[1].negate=true;
 const actual=combatForecast(state,0,0,1),publicView=combatForecast(state,0,0,1,false);
 assert.equal(actual.negated,true);assert.equal(actual.damage,0);assert.equal(actual.destroyDefender,false);assert.equal(publicView.negated,false);assert.equal(publicView.damage,500);
});
test('stance changes are validated once in the main phase and defenders cannot attack',()=>{
 const d=new Duel();summon(d,'Dark Magician');assert.equal(d.dispatch({type:'stance',zone:0}).ok,true);assert.equal(d.state.players[0].monsters[0]!.stance,'defense');assert.equal(d.dispatch({type:'stance',zone:0}).ok,false);
 d.dispatch({type:'battle'});assert.equal(d.dispatch({type:'attack',from:0,target:1}).ok,false);const before=d.state;assert.equal(d.dispatch({type:'stance',zone:-1}).ok,false);assert.deepEqual(d.state,before);
});
test('set Negate Attack stops the first opposing attack and the remainder of that Battle Phase',()=>{
 const d=reachCounterTrap();summon(d,'Blue-Eyes White Dragon');const before=d.state;
 assert.equal(cast(d,'Negate Attack').ok,true);assert.equal(d.state.players[0].negate,true);
 const result=d.dispatch({type:'end'});assert.equal(result.events!.filter(e=>e.type==='attack').length,1);
 assert.equal(d.state.players[0].life,before.players[0].life);assert.equal(d.state.players[0].negate,false);assert.ok(d.state.players[0].monsters[0]);assert.equal(d.state.players[1].monsters.filter(Boolean).length,3);
});
test('Rush Recklessly affects one selected monster by 700 ATK and expires at turn end',()=>{
 const d=new Duel({seed:4});summon(d,'Blue-Eyes White Dragon');d.dispatch({type:'battle'});d.dispatch({type:'attack',from:0,target:1});d.dispatch({type:'end'});
 summon(d,'Dark Magician',1);d.dispatch({type:'battle'});d.dispatch({type:'attack',from:1});d.dispatch({type:'end'});
 assert.equal(d.state.winner,null);assert.ok(d.state.players[0].hand.some(c=>c.name==='Rush Recklessly'));
 summon(d,'Celtic Guardian');
 const before=d.state;const card=before.players[0].hand.find(c=>c.name==='Rush Recklessly')!;
 assert.equal(d.dispatch({type:'cast',cardId:card.id,zone:0}).ok,false);assert.deepEqual(d.state,before);
 assert.equal(cast(d,'Rush Recklessly',1).ok,true);assert.equal(attackPower(d.state.players[0].monsters[0]!),1400);assert.equal(attackPower(d.state.players[0].monsters[1]!),3200);
 const end=d.dispatch({type:'end'});assert.equal(end.steps![0].state.players[0].monsters[1]!.bonus,0,'bonus expires before the opponent acts');
 assert.ok(d.state.players[0].monsters.every(u=>!u||u.bonus===0));
});
test('seeded decks are repeatable and difficulty survives explicit reset',()=>{
 const a=new Duel({seed:712,difficulty:'warden'}),b=new Duel({seed:712,difficulty:'warden'}),c=new Duel({seed:941});assert.deepEqual(a.state.players,b.state.players);assert.notDeepEqual(a.state.players[0].deck,c.state.players[0].deck);a.dispatch({type:'reset'});assert.equal(a.state.difficulty,'warden');a.dispatch({type:'reset',difficulty:'training'});assert.equal(a.state.difficulty,'training');
});
test('seeded tactical duels can be completed and Yami Yugi can be beaten legally',()=>{
 let wins=0;
 for(const seed of[1,17,91,323,912,7711,11223,88199]){
  const d=new Duel({difficulty:'warden',seed});
  for(let turn=0;turn<30&&d.state.winner===null;turn++){
   let s=d.state,p=s.players[0];const card=p.hand.filter(c=>c.kind!=='spell').sort((a,b)=>b.attack-a.attack)[0],zone=p.monsters.findIndex(u=>!u);
   if(card&&zone>=0)assert.equal(d.dispatch({type:'summon',cardId:card.id,zone}).ok,true);
   s=d.state;p=s.players[0];const target=p.monsters.map((u,index)=>({u,index})).filter(t=>t.u).sort((a,b)=>attackPower(b.u!)-attackPower(a.u!))[0]?.index;
   const spell=p.hand.find(c=>c.effect==='surge'&&target!==undefined)??p.hand.find(c=>c.effect==='heal'&&p.life<=7000)??p.hand.find(c=>c.effect==='ward'&&!p.negate);
   if(spell)assert.equal(d.dispatch({type:'cast',cardId:spell.id,zone:p.spells.findIndex(c=>!c),target:spell.effect==='surge'?target:undefined}).ok,true);
   d.dispatch({type:'battle'});
   for(let from=0;from<3&&d.state.winner===null;from++){
    s=d.state;const u=s.players[0].monsters[from];if(!u||u.attacked||u.stance==='defense')continue;
    const options=s.players[1].monsters.map((u,target)=>({u,target})).filter(t=>t.u).map(t=>({target:t.target,f:combatForecast(s,0,from,t.target)})).sort((a,b)=>(Number(b.f.destroyDefender)*3000+b.f.damage-Number(b.f.destroyAttacker)*3000)-(Number(a.f.destroyDefender)*3000+a.f.damage-Number(a.f.destroyAttacker)*3000));
    if(!options.length)assert.equal(d.dispatch({type:'attack',from}).ok,true);else if(!options[0].f.destroyAttacker||options[0].f.destroyDefender)assert.equal(d.dispatch({type:'attack',from,target:options[0].target}).ok,true);
   }
   if(d.state.winner===null)d.dispatch({type:'end'});
  }
  assert.notEqual(d.state.winner,null);if(d.state.winner===0)wins++;
 }
 assert.ok(wins>0);
});
