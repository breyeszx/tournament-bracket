/* Motor de torneo suizo estilo TOM (Pokémon).
 * Sin dependencias ni acceso al DOM: se puede probar con Node.
 *
 * Reglas implementadas:
 *  - Puntos de match: victoria 3, empate 1, derrota 0. Bye = 3 puntos y cuenta como victoria en el récord.
 *  - Desempates: 1) % de victorias de los oponentes (OWP, mínimo 25 % por oponente, byes excluidos)
 *                2) % de victorias de los oponentes de los oponentes (OOWP)
 *                3) nombre (estable) — TOM usa aleatorio; aquí se mantiene determinista.
 *  - Ronda 1: emparejamiento aleatorio. Rondas siguientes: por standing (de arriba hacia abajo),
 *    evitando repetir rivales. Si no hay forma de evitar una repetición, se permite.
 *  - Bye: al jugador activo de peor standing que aún no haya recibido bye.
 *  - Cantidad de rondas: tabla oficial Play! Pokémon con un mínimo de 4.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SwissEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PTS = { win: 3, tie: 1, loss: 0 };
  const MIN_WIN_PCT = 0.25;
  const MIN_ROUNDS = 4;

  // Tabla oficial (jugadores máx → rondas suizas). Se aplica el mínimo de 4.
  const ROUNDS_TABLE = [[8, 3], [12, 4], [20, 5], [32, 5], [64, 6], [128, 7], [226, 8], [799, 9]];

  function recommendedRounds(n) {
    let r = 10;
    for (const [max, rounds] of ROUNDS_TABLE) {
      if (n <= max) { r = rounds; break; }
    }
    return Math.max(MIN_ROUNDS, r);
  }

  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function emptyStats(p) {
    return {
      id: p.id, name: p.name, dropped: !!p.dropped,
      wins: 0, losses: 0, ties: 0, byes: 0, points: 0, played: 0,
      opponents: [], winPct: MIN_WIN_PCT, owp: 0, oowp: 0, rank: 0
    };
  }

  function computeStandings(t) {
    const stats = new Map(t.players.map(p => [p.id, emptyStats(p)]));
    for (const round of t.rounds) {
      for (const m of round.matches) {
        const a = stats.get(m.p1);
        if (!a) continue;
        if (!m.p2) {
          if (m.result === 'bye') { a.byes++; a.wins++; a.points += PTS.win; }
          continue;
        }
        const b = stats.get(m.p2);
        if (!b || !m.result) continue;
        a.played++; b.played++;
        a.opponents.push(b.id); b.opponents.push(a.id);
        if (m.result === 'p1') { a.wins++; a.points += PTS.win; b.losses++; }
        else if (m.result === 'p2') { b.wins++; b.points += PTS.win; a.losses++; }
        else if (m.result === 'tie') { a.ties++; b.ties++; a.points += PTS.tie; b.points += PTS.tie; }
      }
    }
    for (const s of stats.values()) {
      const nonByeWins = s.wins - s.byes;
      s.winPct = s.played
        ? Math.max(MIN_WIN_PCT, (nonByeWins * PTS.win + s.ties * PTS.tie) / (PTS.win * s.played))
        : MIN_WIN_PCT;
    }
    const avg = (arr) => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0;
    for (const s of stats.values()) s.owp = avg(s.opponents.map(id => stats.get(id).winPct));
    for (const s of stats.values()) s.oowp = avg(s.opponents.map(id => stats.get(id).owp));

    const list = [...stats.values()].sort((a, b) =>
      b.points - a.points || b.owp - a.owp || b.oowp - a.oowp || a.name.localeCompare(b.name, 'es'));
    list.forEach((s, i) => { s.rank = i + 1; });
    return list;
  }

  function playedPairs(t) {
    const set = new Set();
    for (const r of t.rounds) for (const m of r.matches) if (m.p2) set.add(pairKey(m.p1, m.p2));
    return set;
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Empareja una lista ordenada por standing. Cada jugador toma al rival más cercano hacia abajo
  // que no haya enfrentado; si el resto no se puede emparejar, prueba el siguiente (backtracking).
  function pairOrdered(ids, forbidden, maxSteps) {
    let steps = 0;
    function rec(remaining) {
      if (remaining.length === 0) return [];
      if (++steps > maxSteps) return null;
      const a = remaining[0];
      for (let j = 1; j < remaining.length; j++) {
        const b = remaining[j];
        if (forbidden.has(pairKey(a, b))) continue;
        const rest = remaining.slice(1, j).concat(remaining.slice(j + 1));
        const r = rec(rest);
        if (r) { r.unshift([a, b]); return r; }
        if (steps > maxSteps) return null;
      }
      return null;
    }
    return rec(ids);
  }

  function generateRound(t, rng) {
    rng = rng || Math.random;
    const n = t.rounds.length + 1;
    const standings = computeStandings(t);
    let active = standings.filter(s => !s.dropped);
    if (n === 1) active = shuffle(active, rng);

    let bye = null;
    if (active.length % 2 === 1) {
      let idx = -1;
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].byes === 0) { idx = i; break; }
      }
      if (idx === -1) idx = active.length - 1;
      bye = active[idx];
      active = active.filter((_, i) => i !== idx);
    }

    const ids = active.map(s => s.id);
    let pairs = pairOrdered(ids, playedPairs(t), 250000);
    let rematches = false;
    if (!pairs) { pairs = pairOrdered(ids, new Set(), ids.length + 2); rematches = true; }

    const matches = pairs.map((p, i) => ({ table: i + 1, p1: p[0], p2: p[1], result: null }));
    if (bye) matches.push({ table: null, p1: bye.id, p2: null, result: 'bye' });
    return { n, matches, rematches };
  }

  function isRoundComplete(round) {
    return round.matches.every(m => !!m.result);
  }

  return { PTS, MIN_WIN_PCT, MIN_ROUNDS, recommendedRounds, computeStandings, generateRound, isRoundComplete, pairKey, playedPairs };
});
