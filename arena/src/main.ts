import './style.css';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import {Duel,type Action,type Card,type DuelState,type Unit} from './game/duel';
import {attackPower,combatForecast} from './game/combat';
import {placementFeedback,type PlacementFeedback} from './game/placement';
import {Arena,type Hit} from './world/arena';
import {CARD_IMAGES} from './world/card-images';
import {Interaction} from './input/interaction';
import {SpatialAudio} from './audio/spatial';
import {DuelPresentation} from './presentation/duel-presentation';
import {shell} from './ui/shell';
import {readPreferences,readProfile,saveLocal,type Preferences} from './ui/preferences';

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
$('#app').innerHTML=shell;
document.documentElement.style.setProperty('--yugi-portrait',`url("${new URL('./assets/yugioh/yami-yugi.png',import.meta.url).href}")`);
let storage:Storage|undefined;try{storage=localStorage;}catch{}
const preferences=readPreferences(storage),profile=readProfile(storage);
try{if(!storage?.getItem('rift.preferences.v1')&&matchMedia('(prefers-reduced-motion: reduce)').matches)preferences.motion=true;}catch{preferences.motion=matchMedia('(prefers-reduced-motion: reduce)').matches;}
const newSeed=()=>Math.floor(Math.random()*2147483646)+1;
const duel=new Duel({difficulty:preferences.difficulty,seed:newSeed()});
const presentation=new DuelPresentation(),audio=new SpatialAudio();
let arena:Arena,interaction:Interaction|undefined;
let latest=duel.state,selected:string|null=null,selectedUnit:number|null=null,spellTarget:number|null=null,attacker:number|null=null;
let started=false,paused=false,cueAge=3,hitAge=1,resultPlayed=false;
let round={dealt:0,taken:0,defeated:0};
let xrSession:XRSession|undefined;

function hint(message:string){$('#hint-text').textContent=message;arena?.setHint(message);}
function cue(title:string,kicker='YU-GI-OH! / DUEL ARENA'){$('#cue-title').textContent=title;$('#cue-kicker').textContent=kicker;$('#cue').classList.add('visible');cueAge=0;}
function selectedCard():Card|null{return latest.players[0].hand.find(c=>c.id===selected)??null;}
function begin(){
 if(started)return;started=true;$('#intro').hidden=true;document.body.classList.add('playing');
 if(arena)arena.controls.autoRotate=false;audio.unlock();cue('It’s time to duel.','YOUR FIRST MOVE');arena?.announce('YOUR TURN');
}
function applyPreferences(){
 audio.setEnabled(preferences.audio);audio.setAmbience(preferences.ambience);audio.setVolume(preferences.volume);presentation.setSpeed(preferences.pace);
 interaction?.setHaptics(preferences.haptics);arena?.setMotion(preferences.motion);arena?.setPace(preferences.pace);arena?.setQuality(preferences.quality);arena?.setFeedbackSettings(preferences.audio,preferences.haptics);
 $<HTMLSelectElement>('#quality').value=preferences.quality;$<HTMLSelectElement>('#difficulty').value=preferences.difficulty;$<HTMLSelectElement>('#pace').value=String(preferences.pace);
 $<HTMLInputElement>('#volume').value=String(Math.round(preferences.volume*100));
 for(const key of ['audio','ambience','haptics','motion','telemetry']as const)$<HTMLInputElement>(`#${key}`).checked=preferences[key];
 $('#performance').hidden=!preferences.telemetry;saveLocal(storage,'rift.preferences.v1',preferences);
}
function syncPause(){
 paused=document.hidden||xrSession?.visibilityState==='hidden'||!!document.querySelector('#help-dialog[open],#settings-dialog[open]');
 presentation.setPaused(paused);arena?.setPresentationPaused(paused);
 if(paused){interaction?.cancelAll();audio.stopAll();}else if(started)audio.unlock();
}
function openDialog(id:string){$<HTMLDialogElement>(id).showModal();syncPause();}
function showDetail(card:Card|null,unit?:Unit){
 $('#detail').classList.toggle('empty',!card);$('#forecast').textContent='';
 if(!card){arena?.inspect(null);return;}
 $('#detail-portrait').style.backgroundImage=`url("${CARD_IMAGES[card.name].art}")`;$('#detail-portrait').style.backgroundSize='cover';$('#detail-portrait').style.backgroundPosition='center';
 $('#detail-kind').textContent=card.kind==='spell'?`${card.trap?'TRAP':'SPELL'} / ${(card.race??'Normal').toUpperCase()}`:`${card.attribute} / LEVEL ${card.level} / ${(card.race??'MONSTER').toUpperCase()}`;
 $('#detail-name').textContent=card.name;$('#detail-stats').textContent=card.kind==='spell'?(card.effect==='ward'?'COUNTER TRAP / END BATTLE PHASE':card.effect==='surge'?'+700 ATK / ONE MONSTER':'GAIN 1,000 LIFE POINTS'):`${unit?attackPower(unit):card.attack} ATK / ${card.defense} DEF${unit?` · ${(unit.stance??'attack').toUpperCase()}`:''}`;
 $('#detail-description').textContent=card.text;arena?.inspect(card,$('#detail-stats').textContent??undefined);
}
function renderSelection(){
 document.querySelectorAll<HTMLButtonElement>('.hand-card').forEach(b=>{const active=b.dataset.id===selected;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 arena?.highlight(selectedCard(),attacker??spellTarget??selectedUnit);refreshActions();
}
function refreshActions(){
 const busy=presentation.busy,ended=latest.winner!==null,battle=$<HTMLButtonElement>('#battle');
 battle.disabled=busy||ended||latest.phase==='battle';battle.innerHTML=busy?'Resolving <span>⋯</span>':latest.phase==='battle'?'Battle phase <span>◇</span>':'Enter battle <kbd>B</kbd>';
 $<HTMLButtonElement>('#end').disabled=busy||ended;
 const unit=selectedUnit===null?null:latest.players[0].monsters[selectedUnit];
 $<HTMLButtonElement>('#stance').disabled=busy||ended||latest.phase!=='main'||!unit||!!unit.shifted;
 $('#stance').innerHTML=unit?`${unit.stance==='defense'?'Attack':'Defend'} stance <kbd>F</kbd>`:'Switch stance <kbd>F</kbd>';
 document.querySelectorAll<HTMLButtonElement>('.hand-card').forEach(b=>b.disabled=busy||ended);
 $('#phase').textContent=busy?(presentation.owner===1?'YUGI TURN':'RESOLVING'):`${latest.phase.toUpperCase()} PHASE`;
}
function dispatch(action:Action):boolean{
 if(!started)begin();audio.unlock();
 if(action.type==='reset'){
  presentation.cancel();interaction?.cancelAll();audio.stopAll();selected=null;selectedUnit=null;spellTarget=null;attacker=null;
  arena.resetCreatures();arena.resetCards();arena.clearPlacementPreviews();showDetail(null);round={dealt:0,taken:0,defeated:0};resultPlayed=false;
  document.body.classList.remove('won','hit');$('#cue').classList.remove('visible');$<HTMLDialogElement>('#result-dialog').close();
 }else if(presentation.busy||paused){hint('Let the current action resolve before your next move.');return false;}
 const before=duel.state,result=duel.dispatch(action);
 if(!result.ok){hint(result.message!);return false;}
 let previous=before;
 for(const step of result.steps??[]){if(step.event.type==='attack'){
  round.dealt+=Math.max(0,previous.players[1].life-step.state.players[1].life);round.taken+=Math.max(0,previous.players[0].life-step.state.players[0].life);
  round.defeated+=Math.max(0,previous.players[1].monsters.filter(Boolean).length-step.state.players[1].monsters.filter(Boolean).length);
 }previous=step.state;}
 presentation.play(before,result.steps??[],duel.state);return true;
}
function newDuel(){dispatch({type:'reset',difficulty:preferences.difficulty,seed:newSeed()});}
function feedback(cardId:string,hit:Hit):PlacementFeedback{
 if(presentation.busy)return{ok:false,message:'Let the current action finish.'};
 if(hit.type!=='zone'||hit.owner===undefined||hit.index===undefined||!hit.row)return{ok:false,message:'Choose a valid field zone.'};
 const check=placementFeedback(latest,cardId,{owner:hit.owner,index:hit.index,row:hit.row});
 if(check.ok&&latest.players[0].hand.find(c=>c.id===cardId)?.effect==='surge'){
  const target=rushTarget();return target===null?{ok:false,message:'Choose a friendly monster for Rush Recklessly.'}:{ok:true,message:`Release Rush Recklessly to give ${latest.players[0].monsters[target]!.card.name} +700 ATK.`};
 }
 return check;
}
function playCard(cardId:string,zone:Hit):boolean{
 const check=feedback(cardId,zone);if(!check.ok){hint(check.message);return false;}
 const card=latest.players[0].hand.find(c=>c.id===cardId)!;
 const accepted=dispatch(card.kind==='spell'?{type:'cast',cardId,zone:zone.index!,target:card.effect==='surge'?rushTarget()??undefined:undefined}:{type:'summon',cardId,zone:zone.index!});
 if(accepted){selected=null;spellTarget=null;arena.clearPlacementPreviews();renderSelection();}return accepted;
}
function selectCard(id:string){
 if(presentation.busy||latest.winner!==null||paused)return;if(!started)begin();audio.unlock();
 selected=selected===id?null:id;attacker=null;selectedUnit=null;spellTarget=selectedCard()?.effect==='surge'?bestTarget():null;showDetail(selectedCard());renderSelection();
 if(selectedCard()){audio.play('select',arena.fieldPosition(0));hint(`Place ${selectedCard()!.name}${spellTarget!==null?` targeting ${latest.players[0].monsters[spellTarget]?.card.name}`:''} in an empty ${selectedCard()!.kind==='spell'?'back-row Spell/Trap':'front-row Monster'} zone.`);}
 else hint('Choose a monster, then a glowing front-row zone.');
}
function bestTarget():number|null{const options=latest.players[0].monsters.map((u,index)=>({u,index})).filter(t=>t.u).sort((a,b)=>attackPower(b.u!)-attackPower(a.u!));return options[0]?.index??null;}
function rushTarget():number|null{return spellTarget!==null&&latest.players[0].monsters[spellTarget]?spellTarget:bestTarget();}
function changeStance(){if(selectedUnit===null){hint('Select your monster during the main phase to change its stance.');return;}dispatch({type:'stance',zone:selectedUnit});}
function handleHit(hit:Hit){
 if(hit.type==='action'){
  if(hit.action==='audio'){preferences.audio=!preferences.audio;applyPreferences();hint(`Spatial sound ${preferences.audio?'enabled':'muted'}.`);return;}
  if(hit.action==='haptics'){preferences.haptics=!preferences.haptics;applyPreferences();hint(`Controller haptics ${preferences.haptics?'enabled':'disabled'}.`);return;}
  if(hit.action==='recenter'){arena.recenter();return;}
  if(hit.action==='reset'){newDuel();return;}
 }
 if(presentation.busy||paused){hint('Let the current action finish.');return;}
 if(hit.type==='action'){
  if(hit.action==='stance')changeStance();else if(hit.action==='battle'||hit.action==='end')dispatch({type:hit.action});return;
 }
 if(hit.type==='card'){selectCard(hit.cardId!);return;}
 if(hit.type==='zone'&&selected){if(interaction?.isHeld(selected)){hint('Release the held card to place it.');return;}playCard(selected,hit);return;}
 if(hit.type==='unit'){
  if(selectedCard()?.effect==='surge'&&hit.owner===0&&latest.phase==='main'){spellTarget=hit.index??null;renderSelection();hint(`Rush Recklessly targets ${latest.players[0].monsters[spellTarget!]?.card.name}. Place it in a Spell/Trap zone.`);return;}
  const owner=hit.owner??0,index=hit.index??0,unit=latest.players[owner].monsters[index];if(!unit)return;showDetail(unit.card,unit);selected=null;
  if(latest.phase==='main'){
   selectedUnit=owner===0?index:null;attacker=null;renderSelection();hint(owner===0?`${unit.card.name} · choose attack or defense stance, or enter battle.`:'Study the opponent, then prepare your field.');return;
  }
  selectedUnit=null;
  if(owner===0){
   if(unit.stance==='defense'||unit.attacked){attacker=null;renderSelection();hint(unit.stance==='defense'?'A defending monster cannot attack.':'That monster has already attacked this turn.');return;}
   attacker=index;renderSelection();
   if(!latest.players[1].monsters.some(Boolean)){dispatch({type:'attack',from:index});attacker=null;renderSelection();}
   else hint(`${unit.card.name} is ready. Choose an opposing monster.`);
  }else if(attacker!==null){dispatch({type:'attack',from:attacker,target:index});attacker=null;renderSelection();}
  else hint('Select one of your attacking monsters first.');
 }
}
function hover(hit:Hit|null){
 if(!started||presentation.busy||paused)return;
 if(hit?.type==='card'){const card=latest.players[0].hand.find(c=>c.id===hit.cardId);if(card)showDetail(card);}
 else if(hit?.type==='unit'){
  const unit=latest.players[hit.owner??0].monsters[hit.index??0];if(unit)showDetail(unit.card,unit);
  if(attacker!==null&&hit.owner===1){const f=combatForecast(latest,0,attacker,hit.index,false);$('#forecast').textContent=f.message;arena.target(hit.index??null,f.destroyAttacker?'#f0a996':'#bce6b0');hint(f.message);return;}
 }
 if(!hit)$('#forecast').textContent='';arena.target(null);
}
function update(s:DuelState){
 latest=s;if(!selectedCard())selected=null;
 if(selectedUnit!==null&&!s.players[0].monsters[selectedUnit])selectedUnit=null;
 arena.sync(s);const[p,e]=s.players;
 $('#player-life').textContent=p.life.toLocaleString();$('#enemy-life').textContent=e.life.toLocaleString();$('#player-track').style.width=`${Math.min(100,p.life/80)}%`;$('#enemy-track').style.width=`${Math.min(100,e.life/80)}%`;
 $('#player-shield').textContent=p.negate?'◇ COUNTER TRAP SET':'';$('#enemy-shield').textContent=e.negate?'◇ SET':'';
 $('#mode-label').textContent=s.difficulty==='warden'?'PHARAOH’S CHALLENGE':'TRAINING GROUNDS';$('#turn').textContent=`TURN ${String(s.turn).padStart(2,'0')}`;
 $('#main-dot').classList.toggle('active',s.phase==='main');$('#battle-dot').classList.toggle('active',s.phase==='battle');
 $('#deck-count').textContent=String(p.deck.length);$('#hand-count').textContent=`${p.hand.length} CARDS`;$('#summon-status').textContent=p.summoned?'SUMMON USED':'SUMMON READY';
 $('#hand').innerHTML=p.hand.map((card,index)=>`<button class="hand-card ${card.kind}" style="--card-color:${card.color}" data-id="${card.id}" aria-label="${card.name}, ${card.kind==='spell'?card.text:`${card.attack} ATK, ${card.defense} DEF`}" aria-pressed="false"><img class="printed-card" src="${CARD_IMAGES[card.name].front}" alt="" draggable="false"/><span class="card-shortcut">${index+1}</span></button>`).join('');
 document.querySelectorAll<HTMLButtonElement>('.hand-card').forEach(button=>{button.onclick=()=>selectCard(button.dataset.id!);button.onmouseenter=button.onfocus=()=>{const card=p.hand.find(c=>c.id===button.dataset.id);if(card&&!presentation.busy)showDetail(card);};});
 $('#log').replaceChildren(...s.log.slice(0,4).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('#record').textContent=`${profile.wins} VICTOR${profile.wins===1?'Y':'IES'} / ${profile.losses} DEFEAT${profile.losses===1?'':'S'}`;
 refreshActions();renderSelection();
 hint(s.winner!==null?s.winner===0?'Victory. The duel is yours. Choose NEW DUEL to return.':'Yami Yugi prevails. A new duel awaits.':s.phase==='battle'?(p.monsters.some(u=>u&&!u.attacked&&u.stance!=='defense')?'Select your attacker, then choose an opposing monster.':'Your attacks are spent. End your turn.'):p.summoned?'Choose a spell, adjust your stance, or enter battle.':'Choose a monster, then a glowing front-row zone.');
}
presentation.onBusy=busy=>{
 arena.setResolving(busy?presentation.owner:undefined);
 if(busy){selected=null;attacker=null;selectedUnit=null;spellTarget=null;interaction?.cancelAll();arena.clearPlacementPreviews();renderSelection();}refreshActions();
};
presentation.onStep=(stage,step,before)=>{
 const event=step.event;arena.setResolving(event.owner);
 if(event.type==='attack'){
  const unit=before.players[event.owner].monsters[event.from]!,kind=unit.card.kind;
  if(stage==='start'){
   update(before);arena.attack(event.owner,event.from,event.target);audio.play('launch',arena.fieldPosition(event.owner,event.from),0,kind);
   cue(unit.card.name,event.owner===1?'YAMI YUGI STRIKES':'YOUR MONSTER ATTACKS');hint(`${unit.card.name} attacks${event.target===undefined?' directly':''}.`);interaction?.feedback(.12,30);
  }else{
   const f=combatForecast(before,event.owner,event.from,event.target);arena.impact(event.owner,event.target,kind,f.negated||f.blocked>0||f.defense&&!f.destroyDefender);update(step.state);
   arena.damage(f.damageTo,f.damage,f.negated?1:f.blocked);audio.play('impact',arena.fieldPosition((1-event.owner)as 0|1,event.target),0,kind);
   if(f.damage>0){cue(`−${f.damage.toLocaleString()} LIFE`,f.damageTo===0?'YOUR LIFE POINTS':'YAMI YUGI’S LIFE POINTS');if(f.damageTo===0&&!preferences.motion){document.body.classList.add('hit');hitAge=0;}}
   else cue(f.negated?'Negate Attack':f.destroyDefender?'Defense broken':'The clash resolves',f.negated?'COUNTER TRAP / BATTLE PHASE ENDS':'BATTLE PHASE');
   hint(step.state.log[0]);interaction?.feedback(f.damageTo===0?.32:.2,65);
  }
 }else if(event.type==='stance'){
  if(stage!=='start')return;update(step.state);const unit=step.state.players[event.owner].monsters[event.zone]!;
  arena.pulseField(arena.fieldPosition(event.owner,event.zone),'#b3d7e0');audio.play('select',arena.fieldPosition(event.owner,event.zone));cue(event.stance==='defense'?'Defense stance':'Attack stance',unit.card.name.toUpperCase());
 }else if(stage==='start'){
  update(step.state);const position=arena.fieldPosition(event.owner,event.zone,event.type==='cast'?'spell':'monster');
  if(event.type==='summon')arena.summonEffect(event.owner,event.zone,event.card.kind);else{arena.pulseField(position,event.card.color);const restored=step.state.players[event.owner].life-before.players[event.owner].life;arena.effects.text(position,event.card.effect==='ward'?'TRAP SET':event.card.effect==='surge'?'+700 ATK':`+${restored} LIFE`,event.card.color);}
  audio.play(event.type,position,0,event.card.kind);cue(event.owner===1&&event.card.trap?'A card is set.':event.card.name,event.card.trap?'COUNTER TRAP SET':event.owner===1?'YAMI YUGI SUMMONS':'YOUR SUMMON');arena.announce(event.owner===1&&event.card.trap?'FACE-DOWN CARD':event.card.name,event.card.color);hint(`${event.owner===1?'Yami Yugi':'You'} ${event.card.trap?'set a Counter Trap':`${event.type==='cast'?'cast':'summon'} ${event.card.name}`}.`);interaction?.feedback(.18,45);
 }
};
presentation.onComplete=state=>{
 const previousTurn=latest.turn;update(state);
 if(state.winner!==null&&!resultPlayed){
  resultPlayed=true;const win=state.winner===0;
  if(win){profile.wins++;profile.bestTurns=profile.bestTurns===null?state.turn:Math.min(profile.bestTurns,state.turn);}else profile.losses++;
  saveLocal(storage,'rift.profile.v1',profile);$('#record').textContent=`${profile.wins} VICTORIES / ${profile.losses} DEFEATS`;
  document.body.classList.toggle('won',win);cue(win?'The duel is yours.':'Yami Yugi prevails.',win?'VICTORY':'DEFEAT');arena.announce(win?'VICTORY':'DEFEAT',win?'#f3dca2':'#b9c7d6');
  audio.play(win?'victory':'defeat',arena.fieldPosition(0));interaction?.feedback(win?.5:.2,110);
  if(win)for(const index of [0,1,2])arena.effects.burst(arena.fieldPosition(0,index),'#e6cb86',90,2.5,1.8);
  $('#result-title').textContent=win?'The duel is yours.':'Yami Yugi prevails.';$('#result-kicker').textContent=win?'VICTORY / DUEL ARENA':'DEFEAT / DUEL ARENA';
  $('#result-copy').textContent=win?'Your monsters answered. Your strategy held.':'Every duel teaches a new lesson. Return with a new strategy.';
  $('#result-stats').innerHTML=`<div><strong>${state.turn}</strong><small>TURNS</small></div><div><strong>${round.dealt.toLocaleString()}</strong><small>DAMAGE DEALT</small></div><div><strong>${round.defeated}</strong><small>MONSTERS DEFEATED</small></div>`;
  if(!arena.renderer.xr.isPresenting)$<HTMLDialogElement>('#result-dialog').showModal();
 }else if(state.turn>previousTurn){cue('Your turn.',`TURN ${state.turn} / MAIN PHASE`);arena.announce('YOUR TURN');audio.play('turn',arena.fieldPosition(0));interaction?.feedback(.13,35);}
};

$('#begin').onclick=begin;$('#battle').onclick=()=>dispatch({type:'battle'});$('#end').onclick=()=>dispatch({type:'end'});$('#stance').onclick=changeStance;$('#reset').onclick=newDuel;$('#play-again').onclick=newDuel;
$('#help').onclick=$('#intro-help').onclick=()=>openDialog('#help-dialog');$('#settings').onclick=()=>openDialog('#settings-dialog');
for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog')){
 dialog.querySelectorAll<HTMLButtonElement>('.close,.close-help').forEach(button=>button.onclick=()=>dialog.close());dialog.addEventListener('close',syncPause);
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
}
for(const key of ['audio','ambience','haptics','motion','telemetry']as const)$('#'+key).onchange=event=>{preferences[key]=(event.target as HTMLInputElement).checked;applyPreferences();if(started)audio.unlock();};
$('#quality').onchange=event=>{preferences.quality=(event.target as HTMLSelectElement).value as Preferences['quality'];applyPreferences();};
$('#difficulty').onchange=event=>{preferences.difficulty=(event.target as HTMLSelectElement).value as Preferences['difficulty'];applyPreferences();};
$('#pace').onchange=event=>{preferences.pace=Number((event.target as HTMLSelectElement).value);applyPreferences();};
$('#volume').oninput=event=>{preferences.volume=Number((event.target as HTMLInputElement).value)/100;audio.setVolume(preferences.volume);saveLocal(storage,'rift.preferences.v1',preferences);};
try{
 arena=new Arena($('#world'));const input=new Interaction(arena);interaction=input;
 arena.onArtReady=ready=>document.body.classList.toggle('art-ready',ready);
 input.onHit=handleHit;input.onHover=hover;input.onGesture=()=>{if(!started)begin();audio.unlock();};input.canGrab=()=>started&&!presentation.busy&&!paused&&latest.winner===null;
 input.getSelectedCard=()=>selected;input.getPlacementFeedback=feedback;input.onPreview=check=>hint(check.message);
 input.onGrab=id=>{selected=id;attacker=null;selectedUnit=null;spellTarget=selectedCard()?.effect==='surge'?bestTarget():null;showDetail(selectedCard());renderSelection();audio.play('card',arena.fieldPosition(0));hint('Move over a zone, or point at one. Release on green to place.');};
 input.onDrop=(id,zone)=>{const accepted=zone?playCard(id,zone):false;if(!accepted){arena.sync(latest);if(!zone&&!presentation.busy)hint('The card will return to your hand. Release over a matching zone to play.');}renderSelection();return accepted;};
 arena.onCardContact=(position,speed)=>{if(speed>.6)audio.play('card',position);};
 arena.onXRChange=active=>{
  document.body.classList.toggle('immersive',active);
  if(active){for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))dialog.close();begin();}
  else{presentation.finish();arena.clearCombat();arena.settleCards();audio.stopAll();arena.sync(latest);}
 };
 arena.renderer.xr.addEventListener('sessionstart',()=>{xrSession=arena.renderer.xr.getSession()??undefined;xrSession?.addEventListener('visibilitychange',syncPause);syncPause();});
 arena.renderer.xr.addEventListener('sessionend',()=>{xrSession?.removeEventListener('visibilitychange',syncPause);xrSession=undefined;syncPause();});document.addEventListener('visibilitychange',syncPause);
 $('#xr-slot').append(VRButton.createButton(arena.renderer,{optionalFeatures:['local-floor','bounded-floor','hand-tracking']}));
 applyPreferences();update(duel.state);
 let elapsed=0,frames=0;
 arena.onFrame=delta=>{
  presentation.update(delta);if(!paused)input.update(delta);audio.updateListener(arena.renderer.xr.isPresenting?arena.renderer.xr.getCamera():arena.camera,arena.renderer.xr.isPresenting?arena.rig:undefined);
  if(!paused){cueAge+=Math.min(.05,delta);if(cueAge>1.5)$('#cue').classList.remove('visible');hitAge+=Math.min(.05,delta);if(hitAge>.5)document.body.classList.remove('hit');}
  elapsed+=delta;frames++;if(elapsed>1){const s=arena.stats;$('#performance').textContent=`${Math.round(frames/elapsed)} FPS · ${s.frameTime.toFixed(1)} MS · ${s.drawCalls} DRAWS · ${s.quality.toUpperCase()}`;elapsed=0;frames=0;}
 };
}catch(error){$('#error').hidden=false;$('#error').textContent='The arena could not initialize WebGL. Use an up-to-date browser with hardware acceleration enabled.';console.error(error);}
addEventListener('keydown',event=>{
 if(event.key==='Escape'){selected=null;attacker=null;selectedUnit=null;spellTarget=null;renderSelection();arena?.inspect(null);return;}
 if(event.repeat||!started||document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement)?.tagName??''))return;
 if(/^[1-7]$/.test(event.key)){const card=latest.players[0].hand[Number(event.key)-1];if(card)selectCard(card.id);}
 else if(event.key.toLowerCase()==='b')dispatch({type:'battle'});else if(event.key.toLowerCase()==='e')dispatch({type:'end'});else if(event.key.toLowerCase()==='f')changeStance();else if(event.key==='?')openDialog('#help-dialog');
});
