import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Duel, type Action } from '../src/game/duel';
import { placementFeedback, type PlacementZone } from '../src/game/placement';

test('preview and dispatch agree for every opening card, row and field index', () => {
  for (let cardIndex = 0; cardIndex < 4; cardIndex++) {
    for (const row of ['monster', 'spell'] as const) for (const index of [-1, 0, 1, 2, 3, NaN]) {
      const duel = new Duel(), before = duel.state, cardId = before.players[0].hand[cardIndex].id;
      const preview = placementFeedback(before, cardId, { owner: 0, index, row });
      assert.deepEqual(duel.state, before, 'preview never mutates state');
      const action: Action = { type: row === 'monster' ? 'summon' : 'cast', cardId, zone: index };
      assert.equal(duel.dispatch(action).ok, preview.ok);
    }
  }
});

test('preview rejects opponent zones, wrong rows, occupied zones and used turn limits', () => {
  const duel = new Duel(), state = duel.state, card = state.players[0].hand[0];
  const zone: PlacementZone = { owner: 0, index: 0, row: 'monster' };
  assert.equal(placementFeedback(state, card.id, { ...zone, owner: 1 }).ok, false);
  assert.match(placementFeedback(state, card.id, { ...zone, row: 'spell' }).message, /front row/);
  state.players[0].monsters[0] = { card: state.players[0].hand[1], attacked: false };
  assert.match(placementFeedback(state, card.id, zone).message, /occupied/);
  state.players[0].monsters[0] = null; state.players[0].summoned = true;
  assert.match(placementFeedback(state, card.id, zone).message, /one monster/);
});

test('a once-valid preview is rejected if another controller consumes the summon first', () => {
  const duel = new Duel(), [first, second] = duel.state.players[0].hand;
  assert.equal(placementFeedback(duel.state, second.id, { owner: 0, index: 1, row: 'monster' }).ok, true);
  duel.dispatch({ type: 'summon', cardId: first.id, zone: 0 });
  assert.equal(placementFeedback(duel.state, second.id, { owner: 0, index: 1, row: 'monster' }).ok, false);
  assert.equal(duel.dispatch({ type: 'summon', cardId: second.id, zone: 1 }).ok, false);
  assert.ok(duel.state.players[0].hand.some(c => c.id === second.id));
});

test('battle phase and victory block previews immediately', () => {
  const duel = new Duel(), id = duel.state.players[0].hand[0].id;
  duel.dispatch({ type: 'battle' });
  assert.match(placementFeedback(duel.state, id, { owner: 0, index: 0, row: 'monster' }).message, /main phase/);
  const ended = duel.state; ended.winner = 1;
  assert.match(placementFeedback(ended, id, { owner: 0, index: 0, row: 'monster' }).message, /complete/);
});

test('accepted feedback events include both players; rejected actions emit no replayed effects', () => {
  const duel = new Duel(), card = duel.state.players[0].hand[0];
  const summon = duel.dispatch({ type: 'summon', cardId: card.id, zone: 0 });
  assert.equal(summon.events?.[0].type, 'summon');
  if (summon.events?.[0].type === 'summon') summon.events[0].card.attack = 99999;
  assert.equal(duel.state.players[0].monsters[0]?.card.attack, 3000);
  const rejected = duel.dispatch({ type: 'summon', cardId: card.id, zone: 1 });
  assert.equal(rejected.ok, false); assert.equal(rejected.events?.length ?? 0, 0);
  duel.dispatch({ type: 'battle' });
  assert.deepEqual(duel.dispatch({ type: 'attack', from: 0, target: 1 }).events, [{ type: 'attack', owner: 0, from: 0, target: 1 }]);
  const opponent = duel.dispatch({ type: 'end' }).events!;
  assert.equal(opponent[0].type, 'summon'); assert.ok(opponent.some(e => e.type === 'attack' && e.owner === 1));
  assert.deepEqual(duel.dispatch({ type: 'reset' }).events, []);
});
