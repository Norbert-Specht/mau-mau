/* ==========================================================================
   Event log text
   Turns engine events into short sentences like
   "Anna played 7 ♥ – You must draw 2".
   ========================================================================== */

import type { GameEvent, Rules, VisibleState } from '../engine';
import { cardName, LOG, STRINGS, suitText } from '../i18n/strings';

/**
 * Describes a batch of events (from one move) as log lines.
 * @param events - redacted events for this viewer
 * @param view - the viewer's state AFTER the events
 * @param rules - active rules
 * @returns one line per interesting event (turn changes are skipped)
 */
export function describeEvents(events: GameEvent[], view: VisibleState, rules: Rules): string[] {
  const who = (seat: number) => (seat === view.you ? STRINGS.you : view.players[seat].name);
  const lines: string[] = [];

  for (const e of events) {
    switch (e.type) {
      case 'played': {
        let line = LOG.played(who(e.seat), cardName(e.card));
        if (e.wish) line += LOG.wished(suitText(e.wish));
        // After a 7, the next player (now current) faces the accumulated penalty.
        if (e.card.rank === '7' && rules.sevenDrawTwo && view.pendingDraw > 0) {
          line += LOG.mustDraw(who(view.current), view.pendingDraw);
        }
        lines.push(line);
        break;
      }
      case 'drew':
        if (e.reason === 'mau') lines.push(LOG.mauPenalty(who(e.seat), e.count));
        else if (e.reason === 'seven') lines.push(LOG.drewPenalty(who(e.seat), e.count));
        else if (e.seat === view.you && e.cards[0]) lines.push(LOG.drewCard(cardName(e.cards[0])));
        else lines.push(LOG.drewOne(who(e.seat)));
        break;
      case 'skipped':
        lines.push(LOG.skipped(who(e.seat), e.seat === view.you));
        break;
      case 'mau':
        lines.push(LOG.mau(who(e.seat)));
        break;
      case 'passed':
        lines.push(LOG.passed(who(e.seat)));
        break;
      case 'reshuffled':
        lines.push(LOG.reshuffled);
        break;
      case 'roundOver':
        lines.push(LOG.roundOver(who(e.winner), e.winner === view.you));
        break;
      case 'matchOver':
        lines.push(LOG.matchOver(e.winners.map(who).join(' & ')));
        break;
      case 'turn':
        break;
    }
  }
  return lines;
}
