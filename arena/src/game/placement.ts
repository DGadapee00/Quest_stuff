import type { DuelState } from './duel';

export interface PlacementZone { owner: number; index: number; row: 'monster' | 'spell' }
export interface PlacementFeedback { ok: boolean; message: string }

/** Shared by the rules and previews: a green preview must mean the move is legal now. */
export function placementFeedback(state: DuelState, cardId: string, zone: PlacementZone): PlacementFeedback {
  if (state.winner !== null) return { ok: false, message: 'The duel is complete. Start a new duel.' };
  if (zone.owner !== 0) return { ok: false, message: 'Choose a zone on your side of the field.' };
  if (state.phase !== 'main') return { ok: false, message: 'Cards can be played during the main phase.' };
  if (!Number.isInteger(zone.index) || zone.index < 0 || zone.index > 2) return { ok: false, message: 'Choose a valid field zone.' };
  const player = state.players[0];
  const card = player.hand.find(c => c.id === cardId);
  if (!card) return { ok: false, message: 'That card is no longer in your hand.' };
  if (card.kind === 'spell') {
    if (zone.row !== 'spell') return { ok: false, message: 'Place Spells and Traps in the back row.' };
    if (card.effect === 'ward' && player.negate) return { ok: false, message: 'Negate Attack is already set on your field.' };
    if (card.effect === 'surge' && !player.monsters.some(Boolean)) return { ok: false, message: 'Summon a monster before casting Rush Recklessly.' };
    if (player.cast) return { ok: false, message: 'You may play one Spell or Trap each turn.' };
    if (player.spells[zone.index]) return { ok: false, message: 'That spell zone is occupied.' };
  } else {
    if (zone.row !== 'monster') return { ok: false, message: 'Place monsters in the front row.' };
    if (player.summoned) return { ok: false, message: 'You may summon one monster each turn.' };
    if (player.monsters[zone.index]) return { ok: false, message: 'That monster zone is occupied.' };
  }
  return { ok: true, message: `Release to ${card.trap ? 'set' : card.kind === 'spell' ? 'cast' : 'summon'} ${card.name}.` };
}
