import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Duel} from '../src/game/duel';
const summon=(d:Duel,index=0,zone=0)=>d.dispatch({type:'summon',cardId:d.state.players[0].hand[index].id,zone});
test('snap placements obey one-summon limit without consuming rejected cards',()=>{
  const d=new Duel();assert.equal(summon(d).ok,true);const before=d.state;
  assert.equal(summon(d).ok,false);assert.deepEqual(d.state,before);assert.equal(before.players[0].hand.length,3);
});
test('invalid field indexes and card IDs cannot mutate the game',()=>{
  const d=new Duel(),before=d.state;
  for(const zone of [-1,3,1.5,NaN])assert.equal(summon(d,0,zone).ok,false);
  assert.equal(d.dispatch({type:'summon',cardId:'unknown',zone:0}).ok,false);assert.deepEqual(d.state,before);
});
test('spell and creature rows enforce card types',()=>{
  const d=new Duel();assert.equal(summon(d,3).ok,false);
  assert.equal(d.dispatch({type:'cast',cardId:d.state.players[0].hand[0].id,zone:0}).ok,false);
  assert.equal(d.dispatch({type:'cast',cardId:d.state.players[0].hand[3].id,zone:0}).ok,true);
  assert.equal(d.state.players[0].life,9000);assert.equal(d.state.players[0].hand.length,3);
});
test('stronger creature destroys defender and deals the difference; cannot attack twice',()=>{
  const d=new Duel();summon(d);d.dispatch({type:'battle'});
  assert.equal(d.dispatch({type:'attack',from:0,target:1}).ok,true);
  assert.equal(d.state.players[1].life,7500);assert.equal(d.state.players[1].monsters[1],null);
  assert.equal(d.dispatch({type:'attack',from:0}).ok,false);
});
test('equal ATK destroys both with no life damage',()=>{
  const d=new Duel();summon(d,1);d.dispatch({type:'battle'});d.dispatch({type:'attack',from:0,target:1});
  assert.equal(d.state.players[0].monsters[0],null);assert.equal(d.state.players[1].monsters[1],null);assert.equal(d.state.players[0].life,8000);assert.equal(d.state.players[1].life,8000);
});
test('weaker attacker is destroyed and its owner takes damage',()=>{
  const d=new Duel();summon(d,2);d.dispatch({type:'battle'});d.dispatch({type:'attack',from:0,target:1});
  assert.equal(d.state.players[0].monsters[0],null);assert.equal(d.state.players[0].life,6900);assert.ok(d.state.players[1].monsters[1]);
});
test('battle prevents summons, and enemy units prevent direct attacks',()=>{
  const d=new Duel();summon(d);assert.equal(d.dispatch({type:'attack',from:0,target:1}).ok,false);
  d.dispatch({type:'battle'});assert.equal(d.dispatch({type:'attack',from:0}).ok,false);assert.equal(d.dispatch({type:'attack',from:0,target:NaN}).ok,false);assert.equal(summon(d).ok,false);
});
test('opponent resolves, new turn draws and resets limits, spell clears',()=>{
  const d=new Duel();summon(d);d.dispatch({type:'cast',cardId:d.state.players[0].hand.find(c=>c.kind==='spell')!.id,zone:0});d.dispatch({type:'end'});
  const s=d.state;assert.equal(s.turn,2);assert.equal(s.phase,'main');assert.equal(s.players[0].summoned,false);assert.equal(s.players[0].cast,false);assert.equal(s.players[0].deck.length,11);assert.deepEqual(s.players[0].spells,[null,null,null]);
});
test('Dian Keto gains 1,000 LP and can exceed starting life',()=>{
  const d=new Duel();d.dispatch({type:'end'});const life=d.state.players[0].life;assert.ok(life<8000);
  d.dispatch({type:'cast',cardId:d.state.players[0].hand.find(c=>c.kind==='spell')!.id,zone:0});assert.equal(d.state.players[0].life,life+1000);
});
test('defeat freezes all actions except reset, which restores initial state',()=>{
  const d=new Duel();for(let i=0;i<10&&d.state.winner===null;i++)d.dispatch({type:'end'});
  assert.equal(d.state.winner,1);assert.equal(d.state.players[0].life,0);const before=d.state;
  assert.equal(d.dispatch({type:'end'}).ok,false);assert.deepEqual(d.state,before);d.dispatch({type:'reset'});assert.equal(d.state.winner,null);assert.equal(d.state.turn,1);assert.equal(d.state.players[0].life,8000);
});
test('external state snapshots cannot change the rules state',()=>{
  const d=new Duel();const s=d.state;s.players[0].life=1;s.players[0].hand.length=0;assert.equal(d.state.players[0].life,8000);assert.equal(d.state.players[0].hand.length,4);
});
