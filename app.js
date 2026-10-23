/* Interfaz de Mesa Uno. Estado en localStorage; la lógica de torneo vive en engine.js. */
(function () {
  'use strict';
  const E = window.SwissEngine;
  const KEY = 'mesa-uno:v1';
  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const pct = (x) => (x * 100).toFixed(2) + ' %';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && Array.isArray(s.tournaments) ? s : null;
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento: la sesión sigue en memoria */ } }

  let state = load() || { tournaments: [], currentId: null };
  const ui = { tab: 'players', roundView: null, confirmDelete: false, importOpen: false };
  let toastTimer = null;

  function toast(msg) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $toast.hidden = true; }, 2200);
  }
  function copyText(text, okMsg) {
    const done = () => toast(okMsg || 'Copiado');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('No se pudo copiar'); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  const current = () => state.tournaments.find((t) => t.id === state.currentId) || null;
  const playerName = (t, id) => { const p = t.players.find((x) => x.id === id); return p ? p.name : '?'; };
  const statsMap = (t) => new Map(E.computeStandings(t).map((s) => [s.id, s]));
  const recordStr = (s) => `${s.wins}-${s.losses}-${s.ties}`;

  // ---------- Render ----------
  function render() {
    const t = current();
    $app.innerHTML = t ? renderTournament(t) : renderHome();
    const focusEl = $app.querySelector('[data-autofocus]');
    if (focusEl && document.activeElement === document.body) focusEl.focus();
  }

  function renderHome() {
    const list = state.tournaments.slice().sort((a, b) => b.createdAt - a.createdAt);
    return `
      <header class="top">
        <div class="brand"><span class="brand-mark">M1</span><h1>Mesa Uno</h1></div>
        <p class="tagline">Torneos suizos estilo TOM: standings, desempates OWP/OOWP y emparejamientos ronda a ronda.</p>
      </header>
      <main>
        <section class="panel">
          <h2>Nuevo torneo</h2>
          <form class="row" data-action="create">
            <input type="text" id="new-name" name="name" placeholder="Nombre, ej. Liga local · Octubre" required maxlength="80" data-autofocus>
            <button class="btn primary" type="submit">Crear torneo</button>
          </form>
        </section>
        <section>
          <div class="section-head"><h2>Tus torneos</h2><span class="muted small">Se guardan en este navegador</span></div>
          ${list.length ? `<div class="tlist">${list.map(renderTCard).join('')}</div>`
            : `<div class="empty">Aún no hay torneos. Crea uno y agrega a los participantes.</div>`}
        </section>
        <section class="panel">
          <div class="section-head"><h3>Importar torneo</h3><button class="btn sm" data-action="import-toggle">${ui.importOpen ? 'Cerrar' : 'Pegar JSON'}</button></div>
          ${ui.importOpen ? `
          <form class="field" data-action="import">
            <textarea id="import-json" name="json" placeholder="Pega aquí el JSON exportado desde Ajustes"></textarea>
            <div class="row"><button class="btn primary" type="submit">Importar</button></div>
          </form>` : `<p class="muted small">Restaura un torneo exportado desde otro dispositivo.</p>`}
        </section>
      </main>`;
  }

  function renderTCard(t) {
    const status = statusChip(t);
    const meta = t.status === 'registration'
      ? `${t.players.length} inscritos`
      : `${t.players.length} jugadores · ronda ${t.rounds.length} de ${t.plannedRounds}`;
    return `<button class="tcard" data-action="open" data-id="${t.id}">
      <span class="tname">${esc(t.name)}</span><span class="meta">${meta}</span>${status}</button>`;
  }

  function statusChip(t) {
    if (t.status === 'registration') return '<span class="chip">Inscripción</span>';
    if (t.status === 'finished') return '<span class="chip done">Finalizado</span>';
    return '<span class="chip live">En juego</span>';
  }

  function renderTournament(t) {
    const tabs = [
      ['players', 'Jugadores', t.players.length],
      ['rounds', 'Rondas', t.rounds.length || null],
      ['standings', 'Standings', null],
      ['settings', 'Ajustes', null]
    ];
    let body = '';
    if (ui.tab === 'players') body = renderPlayers(t);
    else if (ui.tab === 'rounds') body = renderRounds(t);
    else if (ui.tab === 'standings') body = renderStandings(t);
    else body = renderSettings(t);
    return `
      <header class="top">
        <button class="btn ghost sm" data-action="back">← Torneos</button>
        <h1>${esc(t.name)}</h1>
        <span class="spacer"></span>
        ${statusChip(t)}
        ${t.status !== 'registration' ? `<span class="chip">Ronda ${t.rounds.length} / ${t.plannedRounds}</span>` : ''}
      </header>
      <nav class="tabs" role="tablist">
        ${tabs.map(([id, label, n]) => `<button class="tab" role="tab" aria-selected="${ui.tab === id}" data-action="tab" data-tab="${id}">${label}${n ? `<span class="count num">${n}</span>` : ''}</button>`).join('')}
      </nav>
      <main>${body}</main>`;
  }

  function renderPlayers(t) {
    const n = t.players.length;
    const rec = E.recommendedRounds(n);
    const reg = t.status === 'registration';
    const stats = reg ? null : statsMap(t);
    const list = t.players.map((p, i) => {
      const s = stats ? stats.get(p.id) : null;
      return `<li class="${p.dropped ? 'dropped' : ''}">
        <span class="idx num">${i + 1}</span>
        <span class="name">${esc(p.name)}${p.dropped ? ' <span class="muted small">(retirado)</span>' : ''}</span>
        ${s ? `<span class="record num">${recordStr(s)}</span>` : ''}
        ${reg ? `<button class="btn sm ghost" data-action="remove-player" data-id="${p.id}" aria-label="Quitar a ${esc(p.name)}">Quitar</button>`
          : (t.status === 'running' ? `<button class="btn sm ghost" data-action="toggle-drop" data-id="${p.id}">${p.dropped ? 'Reincorporar' : 'Retirar'}</button>` : '')}
      </li>`;
    }).join('');

    const summary = `
      <div class="stats">
        <div class="stat"><span class="label">Jugadores</span><span class="value num">${n}</span></div>
        <div class="stat"><span class="label">Rondas ${reg ? 'recomendadas' : 'planificadas'}</span><span class="value num">${reg ? rec : t.plannedRounds}</span></div>
        <div class="stat"><span class="label">Byes por ronda</span><span class="value num">${n % 2}</span></div>
      </div>`;

    if (!reg) {
      return `<section>${summary}</section>
        <section>
          <div class="section-head"><h2>Participantes</h2><span class="muted small">Un jugador retirado deja de ser emparejado; sus resultados se conservan.</span></div>
          <ul class="plist panel">${list}</ul>
        </section>`;
    }
    const canStart = n >= 4;
    return `
      <section class="panel">
        <h2>Inscribir jugadores</h2>
        <form class="row" data-action="add-player">
          <input type="text" id="player-name" name="name" placeholder="Nombre del jugador" required maxlength="60" autocomplete="off" data-autofocus>
          <button class="btn primary" type="submit">Agregar</button>
        </form>
        <details>
          <summary class="muted small">Agregar varios a la vez (uno por línea)</summary>
          <form class="field" data-action="add-bulk" style="margin-top:8px">
            <textarea id="players-bulk" name="names" placeholder="Ana&#10;Benjamín&#10;Catalina"></textarea>
            <div class="row"><button class="btn" type="submit">Agregar lista</button></div>
          </form>
        </details>
      </section>
      <section>
        ${summary}
        <p class="muted small">Rondas según la tabla oficial de Play! Pokémon (4–8: 3, 9–12: 4, 13–20: 5, 21–32: 5, 33–64: 6, 65–128: 7…) con un mínimo de 4. Puedes cambiarlas en Ajustes antes de empezar.</p>
        ${n >= 4 && n <= 5 ? `<div class="notice">Con ${n} jugadores y ${t.plannedRounds} rondas no se pueden evitar algunos cruces repetidos.</div>` : ''}
      </section>
      <section>
        <div class="section-head"><h2>Inscritos</h2>
          <button class="btn primary" data-action="start" ${canStart ? '' : 'disabled'}>Iniciar torneo · ${t.plannedRounds} rondas</button></div>
        ${n ? `<ul class="plist panel">${list}</ul>` : `<div class="empty">Agrega al menos 4 jugadores para iniciar.</div>`}
        ${n && !canStart ? `<p class="muted small">Faltan ${4 - n} para el mínimo de 4 jugadores.</p>` : ''}
      </section>`;
  }

  function renderRounds(t) {
    if (!t.rounds.length) {
      return `<div class="empty">${t.status === 'registration' ? 'Inicia el torneo desde la pestaña Jugadores para generar la ronda 1.' : 'No hay rondas.'}</div>`;
    }
    const n = ui.roundView && ui.roundView <= t.rounds.length ? ui.roundView : t.rounds.length;
    const round = t.rounds[n - 1];
    const isLast = n === t.rounds.length;
    // Récord y puntos con los que cada jugador entra a esta ronda (como muestra TOM en los emparejamientos).
    const stats = statsMap({ players: t.players, rounds: t.rounds.slice(0, n - 1) });
    const complete = E.isRoundComplete(round);
    const playable = round.matches.filter((m) => m.p2);
    const doneCount = playable.filter((m) => m.result).length;

    const pills = t.rounds.map((r) => `<button class="pill ${E.isRoundComplete(r) ? '' : 'pending'}" aria-current="${r.n === n}" data-action="round-view" data-n="${r.n}">R${r.n}</button>`).join('')
      + (t.status === 'running' && t.rounds.length < t.plannedRounds ? `<span class="pill pending muted" style="cursor:default">R${t.rounds.length + 1} pendiente</span>` : '');

    const matches = round.matches.map((m, idx) => {
      const a = stats.get(m.p1);
      if (!m.p2) {
        return `<div class="match bye">
          <span class="table"><b>Bye</b>—</span>
          <div class="side a"><span class="pname">${esc(playerName(t, m.p1))}</span><span class="muted small">Recibe 3 puntos sin jugar</span></div>
        </div>`;
      }
      const b = stats.get(m.p2);
      const btn = (val, label) => `<button type="button" aria-pressed="${m.result === val}" data-action="result" data-n="${n}" data-idx="${idx}" data-value="${val}">${label}</button>`;
      return `<div class="match ${m.result ? 'done' : 'pending'}">
        <span class="table"><b>Mesa</b>${m.table}</span>
        <div class="side a"><span class="pname ${m.result === 'p1' ? 'winner' : ''}">${esc(playerName(t, m.p1))}</span><span class="muted small num">${recordStr(a)} · ${a.points} pts</span></div>
        <span class="vs">vs</span>
        <div class="side b"><span class="pname ${m.result === 'p2' ? 'winner' : ''}">${esc(playerName(t, m.p2))}</span><span class="muted small num">${recordStr(b)} · ${b.points} pts</span></div>
        <div class="ctl" role="group" aria-label="Resultado mesa ${m.table}">
          ${btn('p1', 'Gana ' + esc(shortName(playerName(t, m.p1))))}
          ${btn('tie', 'Empate')}
          ${btn('p2', 'Gana ' + esc(shortName(playerName(t, m.p2))))}
        </div>
      </div>`;
    }).join('');

    let foot = '';
    if (t.status === 'running' && isLast) {
      const more = t.rounds.length < t.plannedRounds;
      foot = `<div class="roundfoot">
        <span class="muted num">${doneCount} de ${playable.length} resultados</span>
        <div class="row">
          <button class="btn" data-action="copy-pairings" data-n="${n}">Copiar emparejamientos</button>
          ${more
            ? `<button class="btn primary" data-action="next-round" ${complete ? '' : 'disabled'}>Generar ronda ${n + 1}</button>`
            : `<button class="btn" data-action="next-round" ${complete ? '' : 'disabled'}>Ronda extra</button>
               <button class="btn primary" data-action="finish" ${complete ? '' : 'disabled'}>Finalizar torneo</button>`}
        </div>
      </div>`;
    } else {
      foot = `<div class="roundfoot"><span class="muted num">${doneCount} de ${playable.length} resultados</span>
        <button class="btn" data-action="copy-pairings" data-n="${n}">Copiar emparejamientos</button></div>`;
    }

    return `
      <section>
        <div class="section-head"><h2>Ronda ${n}${isLast && t.status === 'running' ? '' : ' <span class="muted">(cerrada)</span>'}</h2><div class="roundpills">${pills}</div></div>
        <div class="progress" aria-hidden="true"><span style="width:${playable.length ? (doneCount / playable.length) * 100 : 100}%"></span></div>
        ${round.rematches ? '<div class="notice">En esta ronda no fue posible evitar cruces repetidos.</div>' : ''}
        ${!isLast ? '<p class="muted small">Puedes corregir resultados de rondas anteriores; los standings se recalculan, pero los emparejamientos ya hechos no cambian.</p>' : ''}
        <div class="matches">${matches}</div>
        ${foot}
      </section>`;
  }

  function shortName(name) {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? parts[0] + ' ' + parts[1][0] + '.' : parts[0];
  }

  function renderStandings(t) {
    if (!t.rounds.length) return '<div class="empty">Los standings aparecen cuando empieza la ronda 1.</div>';
    const st = E.computeStandings(t);
    const rows = st.map((s) => `<div class="srow ${s.rank <= 4 && !s.dropped ? 'top' : ''} ${s.dropped ? 'dropped' : ''}" role="row">
      <span class="scell rank num" role="cell">${s.rank}</span>
      <span class="scell pname" role="cell">${esc(s.name)}${s.dropped ? ' <span class="small muted">(retirado)</span>' : ''}</span>
      <span class="scell num record" role="cell">${recordStr(s)}</span>
      <span class="scell r num" role="cell">${s.points}</span>
      <span class="scell r num" role="cell">${pct(s.owp)}</span>
      <span class="scell r num" role="cell">${pct(s.oowp)}</span>
    </div>`).join('');
    return `
      <section>
        <div class="section-head">
          <h2>${t.status === 'finished' ? 'Clasificación final' : `Standings tras ${t.rounds.filter(E.isRoundComplete).length} ronda(s)`}</h2>
          <button class="btn" data-action="copy-standings">Copiar standings</button>
        </div>
        <div class="tablewrap"><div class="stable" role="table" aria-label="Standings">
          <div class="srow head" role="row">
            <span class="scell" role="columnheader">#</span><span class="scell" role="columnheader">Jugador</span>
            <span class="scell" role="columnheader">G-P-E</span><span class="scell r" role="columnheader">Pts</span>
            <span class="scell r" role="columnheader">OWP</span><span class="scell r" role="columnheader">OOWP</span>
          </div>
          ${rows}
        </div></div>
        <p class="muted small">Puntos: victoria 3, empate 1, bye 3. OWP: promedio del % de victorias de los oponentes (mínimo 25 % cada uno, byes excluidos). OOWP: promedio del OWP de los oponentes.</p>
      </section>`;
  }

  function renderSettings(t) {
    const rec = E.recommendedRounds(t.players.length);
    const locked = t.status === 'finished';
    return `
      <section class="panel">
        <h2>Ajustes</h2>
        <form class="field" data-action="rename">
          <label for="t-name">Nombre del torneo</label>
          <div class="row"><input type="text" id="t-name" name="name" value="${esc(t.name)}" required maxlength="80"><button class="btn" type="submit">Guardar</button></div>
        </form>
        <form class="field" data-action="set-rounds">
          <label for="t-rounds">Rondas suizas</label>
          <div class="row"><input type="number" id="t-rounds" name="rounds" min="${Math.max(1, t.rounds.length)}" max="20" value="${t.plannedRounds}" ${locked ? 'disabled' : ''}><button class="btn" type="submit" ${locked ? 'disabled' : ''}>Guardar</button></div>
          <p class="muted small">Recomendado para ${t.players.length} jugadores: ${rec}. ${t.rounds.length ? 'No puede ser menor que las rondas ya jugadas.' : ''}</p>
        </form>
      </section>
      <section class="panel">
        <h3>Exportar</h3>
        <p class="muted small">Copia el JSON para respaldar o abrir el torneo en otro dispositivo (pestaña Importar en la portada).</p>
        <div class="row"><button class="btn" data-action="export-copy">Copiar JSON del torneo</button></div>
      </section>
      <section class="panel">
        <h3>Zona de cuidado</h3>
        <div class="row">
          ${t.status === 'finished' ? '<button class="btn" data-action="reopen">Reabrir torneo</button>' : ''}
          ${ui.confirmDelete
            ? `<span>¿Eliminar «${esc(t.name)}»? No se puede deshacer.</span><button class="btn danger" data-action="delete-confirm">Sí, eliminar</button><button class="btn" data-action="delete-cancel">Cancelar</button>`
            : `<button class="btn danger" data-action="delete-ask">Eliminar torneo</button>`}
        </div>
      </section>`;
  }

  // ---------- Textos para compartir ----------
  function pairingsText(t, n) {
    const round = t.rounds[n - 1];
    const stats = statsMap({ players: t.players, rounds: t.rounds.slice(0, n - 1) });
    const lines = [`${t.name} · Ronda ${n}`];
    for (const m of round.matches) {
      if (!m.p2) { lines.push(`Bye: ${playerName(t, m.p1)}`); continue; }
      const a = stats.get(m.p1), b = stats.get(m.p2);
      let res = '';
      if (m.result === 'p1') res = ` → gana ${playerName(t, m.p1)}`;
      else if (m.result === 'p2') res = ` → gana ${playerName(t, m.p2)}`;
      else if (m.result === 'tie') res = ' → empate';
      lines.push(`Mesa ${m.table}: ${playerName(t, m.p1)} (${a.points}) vs ${playerName(t, m.p2)} (${b.points})${res}`);
    }
    return lines.join('\n');
  }
  function standingsText(t) {
    const st = E.computeStandings(t);
    return [`${t.name} · Standings`].concat(st.map((s) => `${s.rank}. ${s.name} ${recordStr(s)} · ${s.points} pts · OWP ${pct(s.owp)}${s.dropped ? ' (retirado)' : ''}`)).join('\n');
  }

  // ---------- Acciones ----------
  function addPlayers(t, names) {
    const existing = new Set(t.players.map((p) => p.name.toLowerCase()));
    let added = 0, dup = 0;
    for (let raw of names) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      if (existing.has(name.toLowerCase())) { dup++; continue; }
      existing.add(name.toLowerCase());
      t.players.push({ id: uid(), name, dropped: false });
      added++;
    }
    t.plannedRounds = E.recommendedRounds(t.players.length);
    if (dup) toast(`${added} agregado(s), ${dup} repetido(s) omitido(s)`);
    else if (added > 1) toast(`${added} jugadores agregados`);
  }

  function nextRound(t) {
    const round = E.generateRound(t);
    t.rounds.push(round);
    ui.roundView = round.n;
    ui.tab = 'rounds';
  }

  const actions = {
    create(form) {
      const name = form.name.value.trim();
      if (!name) return;
      const t = { id: uid(), name, createdAt: Date.now(), players: [], rounds: [], plannedRounds: E.MIN_ROUNDS, status: 'registration' };
      state.tournaments.push(t); state.currentId = t.id; ui.tab = 'players';
    },
    open(el) { state.currentId = el.dataset.id; ui.tab = 'players'; ui.roundView = null; ui.confirmDelete = false; },
    back() { state.currentId = null; ui.confirmDelete = false; },
    tab(el) { ui.tab = el.dataset.tab; ui.confirmDelete = false; },
    'add-player'(form, t) { addPlayers(t, [form.name.value]); form.name.value = ''; },
    'add-bulk'(form, t) { addPlayers(t, form.names.value.split(/\r?\n/)); form.names.value = ''; },
    'remove-player'(el, t) { t.players = t.players.filter((p) => p.id !== el.dataset.id); t.plannedRounds = E.recommendedRounds(t.players.length); },
    'toggle-drop'(el, t) { const p = t.players.find((x) => x.id === el.dataset.id); if (p) p.dropped = !p.dropped; },
    start(el, t) {
      if (t.players.length < 4) return;
      t.status = 'running';
      nextRound(t);
      toast('Ronda 1 generada');
    },
    'round-view'(el) { ui.roundView = Number(el.dataset.n); },
    result(el, t) {
      const round = t.rounds[Number(el.dataset.n) - 1];
      const m = round && round.matches[Number(el.dataset.idx)];
      if (!m || !m.p2) return;
      m.result = m.result === el.dataset.value ? null : el.dataset.value;
    },
    'next-round'(el, t) {
      const last = t.rounds[t.rounds.length - 1];
      if (!E.isRoundComplete(last)) return;
      if (t.rounds.length >= t.plannedRounds) t.plannedRounds = t.rounds.length + 1;
      nextRound(t);
      toast(`Ronda ${t.rounds.length} generada`);
    },
    finish(el, t) {
      const last = t.rounds[t.rounds.length - 1];
      if (!E.isRoundComplete(last)) return;
      t.status = 'finished'; ui.tab = 'standings';
    },
    reopen(el, t) { t.status = 'running'; },
    'copy-pairings'(el, t) { copyText(pairingsText(t, Number(el.dataset.n)), 'Emparejamientos copiados'); },
    'copy-standings'(el, t) { copyText(standingsText(t), 'Standings copiados'); },
    'export-copy'(el, t) { copyText(JSON.stringify(t, null, 2), 'JSON copiado'); },
    'delete-ask'() { ui.confirmDelete = true; },
    'delete-cancel'() { ui.confirmDelete = false; },
    'delete-confirm'(el, t) {
      state.tournaments = state.tournaments.filter((x) => x.id !== t.id);
      state.currentId = null; ui.confirmDelete = false; toast('Torneo eliminado');
    },
    rename(form, t) { const v = form.name.value.trim(); if (v) { t.name = v; toast('Nombre guardado'); } },
    'set-rounds'(form, t) {
      const v = Math.round(Number(form.rounds.value));
      if (!Number.isFinite(v) || v < 1) return;
      t.plannedRounds = Math.max(v, t.rounds.length || 1);
      if (t.status === 'running' && t.rounds.length >= t.plannedRounds) { /* la última ronda queda como final */ }
      toast(`${t.plannedRounds} rondas`);
    },
    'import-toggle'() { ui.importOpen = !ui.importOpen; },
    import(form) {
      let data;
      try { data = JSON.parse(form.json.value); } catch (e) { toast('El texto no es JSON válido'); return; }
      if (!data || !Array.isArray(data.players) || !Array.isArray(data.rounds) || typeof data.name !== 'string') { toast('El JSON no parece un torneo exportado'); return; }
      const t = {
        id: uid(), name: data.name, createdAt: Date.now(),
        players: data.players.filter((p) => p && typeof p.name === 'string').map((p) => ({ id: String(p.id || uid()), name: p.name, dropped: !!p.dropped })),
        rounds: data.rounds.map((r, i) => ({ n: i + 1, rematches: !!r.rematches, matches: (r.matches || []).map((m, j) => ({ table: m.p2 ? (m.table || j + 1) : null, p1: String(m.p1), p2: m.p2 ? String(m.p2) : null, result: m.p2 ? (['p1', 'p2', 'tie'].includes(m.result) ? m.result : null) : 'bye' })) })),
        plannedRounds: Math.max(1, Number(data.plannedRounds) || E.MIN_ROUNDS),
        status: ['registration', 'running', 'finished'].includes(data.status) ? data.status : 'registration'
      };
      state.tournaments.push(t); state.currentId = t.id; ui.importOpen = false; ui.tab = 'standings';
      toast('Torneo importado');
    }
  };

  $app.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.tagName === 'FORM') return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    fn(el, current());
    save(); render();
  });
  $app.addEventListener('submit', (ev) => {
    const form = ev.target.closest('form[data-action]');
    if (!form) return;
    ev.preventDefault();
    const fn = actions[form.dataset.action];
    if (!fn) return;
    fn(form, current());
    save(); render();
  });

  render();
})();
