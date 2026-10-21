/** Deterministic rating and tournament primitives; authoritative use requires a server. */
export const DEFAULT_RATING = 1200;
export function expectedScore(rating, opponentRating) {
  if (![rating, opponentRating].every(Number.isFinite)) throw new TypeError('Ratings must be finite');
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}
export function updateRatings(a, b, outcome, k = 24) {
  if (![0, 0.5, 1].includes(outcome)) throw new RangeError('Outcome must be 0, 0.5 or 1');
  if (!Number.isFinite(k) || k <= 0 || k > 100) throw new RangeError('Invalid K factor');
  const shift = Math.round(k * (outcome - expectedScore(a, b)));
  return { a: Math.max(100, a + shift), b: Math.max(100, b - shift) };
}
function normalize(players) {
  if (!Array.isArray(players) || !players.length) throw new RangeError('At least one player is required');
  const ids = new Set();
  return players.map((player) => {
    if (typeof player?.id !== 'string' || !player.id.trim() || ids.has(player.id)) throw new TypeError('Player ids must be unique nonempty strings');
    ids.add(player.id);
    const rating = player.rating ?? DEFAULT_RATING;
    if (!Number.isFinite(rating) || rating < 100) throw new RangeError('Invalid player rating');
    return { id: player.id, rating };
  });
}
/** Stable high-low seeding; byes remain explicit rather than synthetic wins. */
export function createSingleElimination(players) {
  const entrants = normalize(players).sort((a,b) => b.rating - a.rating || a.id.localeCompare(b.id));
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, entrants.length)));
  const seeds = Array(size).fill(null);
  entrants.forEach((player,index) => { seeds[index] = player; });
  const order = [0, 1];
  while (order.length < size) {
    const doubled = order.length * 2;
    order.splice(0, order.length, ...order.flatMap(x => [x, doubled - 1 - x]));
  }
  const matches = [];
  for (let i=0;i<size;i+=2) {
    const a = seeds[order[i]];
    const b = seeds[order[i+1]];
    matches.push({ id: `round-1-match-${i/2+1}`, a: a?.id ?? null, b: b?.id ?? null, bye: Boolean(a) !== Boolean(b), winner: a && !b ? a.id : b && !a ? b.id : null });
  }
  return { format: 'single-elimination', entrants: entrants.length, rounds: Math.log2(size), matches };
}
export function validateMoveEnvelope(envelope, expectedGameId, expectedTurn, expectedPlayerId) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;
  return envelope.gameId === expectedGameId && envelope.turn === expectedTurn && envelope.playerId === expectedPlayerId && typeof envelope.nonce === 'string' && /^[a-zA-Z0-9_-]{12,128}$/.test(envelope.nonce);
}
