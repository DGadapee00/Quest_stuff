import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Duel,type DuelState} from '../src/game/duel';
import {DuelPresentation} from '../src/presentation/duel-presentation';
const advance=(p:DuelPresentation,seconds:number)=>{for(let t=0;t<seconds;t+=0.05)p.update(0.05);};

test('opponent action snapshots show each hit before the new turn is presented',()=>{
 const duel=new Duel(),before=duel.state,result=duel.dispatch({type:'end'}),final=duel.state;
 assert.deepEqual(result.steps?.map(step=>step.event.type),['summon','attack','attack']);
 assert.deepEqual(result.steps?.map(step=>step.state.players[0].life),[8000,5000,2500]);
 assert.equal(result.steps?.at(-1)?.state.turn,1);assert.equal(final.turn,2);
 const p=new DuelPresentation(),cues:string[]=[];let displayed:DuelState=before;
 p.onStep=(stage,step,previous)=>{cues.push(`${stage}:${step.event.type}`);displayed=step.event.type==='attack'&&stage==='start'?previous:step.state;};
 p.onComplete=state=>{cues.push('complete');displayed=state;};
 p.play(before,result.steps!,final);assert.equal(p.busy,true);assert.equal(displayed.players[0].life,8000);
 advance(p,0.95);assert.equal(displayed.players[0].life,8000);assert.equal(displayed.turn,1);
 advance(p,0.5);assert.equal(displayed.players[0].life,5000);assert.equal(displayed.turn,1);
 advance(p,3);assert.equal(p.busy,false);assert.deepEqual(displayed,final);
 assert.deepEqual(cues,['start:summon','start:attack','impact:attack','start:attack','impact:attack','complete']);
});

test('paused or backgrounded playback does not skip impacts on resume',()=>{
 const duel=new Duel();duel.dispatch({type:'summon',cardId:duel.state.players[0].hand[0].id,zone:0});duel.dispatch({type:'battle'});
 const before=duel.state,result=duel.dispatch({type:'attack',from:0,target:1}),p=new DuelPresentation();let impacts=0;
 p.onStep=stage=>{if(stage==='impact')impacts++;};p.play(before,result.steps!,duel.state);
 p.setPaused(true);p.update(1000);assert.equal(impacts,0);assert.equal(p.busy,true);
 p.setPaused(false);p.update(1000);assert.equal(impacts,0);
 advance(p,0.4);assert.equal(impacts,1);advance(p,2);assert.equal(impacts,1);assert.equal(p.busy,false);
});

test('reset cancels old effects and old final snapshots; a new duel can play immediately',()=>{
 const duel=new Duel(),p=new DuelPresentation(),before=duel.state,result=duel.dispatch({type:'end'});let completions=0;
 p.onComplete=()=>completions++;p.play(before,result.steps!,duel.state);advance(p,0.2);p.cancel();advance(p,10);
 assert.equal(completions,0);assert.equal(p.busy,false);
 duel.dispatch({type:'reset'});const initial=duel.state;const summon=duel.dispatch({type:'summon',cardId:initial.players[0].hand[0].id,zone:0});
 assert.equal(p.play(initial,summon.steps!,duel.state),true);advance(p,2);assert.equal(completions,1);
});

test('leaving XR settles the committed result once, without replaying queued effects',()=>{
 const duel=new Duel(),p=new DuelPresentation(),before=duel.state,result=duel.dispatch({type:'end'});let starts=0,completions=0;
 p.onStep=stage=>{if(stage==='start')starts++;};p.onComplete=state=>{completions++;assert.deepEqual(state,duel.state);};
 p.play(before,result.steps!,duel.state);p.finish();p.finish();advance(p,10);
 assert.equal(starts,1);assert.equal(completions,1);assert.equal(p.busy,false);
});

test('an active transaction cannot be replaced and no-effect actions finish immediately',()=>{
 const duel=new Duel(),p=new DuelPresentation(),before=duel.state,result=duel.dispatch({type:'end'});
 p.play(before,result.steps!,duel.state);assert.equal(p.play(before,result.steps!,duel.state),false);p.cancel();
 let completed=false;p.onComplete=()=>completed=true;p.play(before,[],duel.state);assert.equal(completed,true);assert.equal(p.busy,false);
});

test('presentation snapshots and feedback events cannot mutate authoritative state',()=>{
 const duel=new Duel(),result=duel.dispatch({type:'summon',cardId:duel.state.players[0].hand[0].id,zone:0});
 result.steps![0].state.players[0].life=1;
 const event=result.steps![0].event;if(event.type==='summon')event.card.attack=99999;
 assert.equal(duel.state.players[0].life,8000);assert.equal(duel.state.players[0].monsters[0]?.card.attack,3000);
});
