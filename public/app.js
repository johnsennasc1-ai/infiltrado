(() => {
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AV = ['😎', '🕵️', '🧔', '👩‍🦰', '🧢', '👱‍♀️', '🤠', '👩‍🎤', '🥷', '🧑‍🚀', '👨‍🎤', '🦸', '🧛', '🤖', '🐺', '🦊'];
const COL = ['#ff3d9a', '#ffb347', '#4cc9f0', '#8dffb0', '#c77dff', '#ffe24a', '#ff6b6b', '#5eead4'];
const PEN = ['#111111', '#e63946', '#1d6fe0', '#ffd60a', '#2b9348', '#8338ec', '#ff7b00'];

let ses = {}; try { ses = JSON.parse(localStorage.getItem('jdi') || '{}'); } catch (e) {}
if (!ses.pid) ses.pid = Array.from(crypto.getRandomValues(new Uint8Array(14)), b => (b % 36).toString(36)).join('');
const save = () => { try { localStorage.setItem('jdi', JSON.stringify(ses)); } catch (e) {} };
save();
const qs = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 4);

let S = null, meta = null, endAt = 0, drawn = false, drawGid = null, color = PEN[0], tool = 'pen';
let chatOpen = false, unread = 0;

const socket = io({ reconnectionDelay: 500, reconnectionDelayMax: 3000, timeout: 20000 });
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2600); };
const emit = (ev, d) => socket.emit(ev, d, r => { if (r && r.ok === false) toast(r.error); });
const P = id => S.players.find(p => p.id === id) || { name: '?', avatar: 0 };
const av = (p, c = '') => `<div class="av ${c}" style="--c:${COL[p.avatar % COL.length]}">${AV[p.avatar]}</div>`;
const strip = (hl, fn) => `<div class="strip">${S.players.map(p => `<div class="pl ${p.id === hl ? 'on' : ''} ${p.connected ? '' : 'off'}">${av(p)}<span class="tag">${esc(p.name)}</span>${fn ? fn(p) : ''}</div>`).join('')}</div>`;
const img = id => `/d/${S.code}/${id}?g=${S.game.id}`;

/* ---------- conexão ---------- */
socket.on('connect', () => { $('#net').classList.add('hide'); if (ses.code) join(false, true); });
socket.on('disconnect', () => $('#net').classList.remove('hide'));
socket.on('connect_error', () => $('#net').classList.remove('hide'));
document.addEventListener('visibilitychange', () => { if (!document.hidden && !socket.connected) socket.connect(); });
socket.on('state', s => { S = s; endAt = s.remaining != null ? Date.now() + s.remaining : 0; render(); });
socket.on('toast', toast);
fetch('/api/meta').then(r => r.json()).then(m => { meta = m; render(); });

function join(create, silent) {
  const name = silent ? ses.name : (($('#name') || {}).value || '').trim();
  if (!silent) {
    if (!name) return toast('Digite seu nome.');
    ses.name = name;
  }
  const code = create ? null : silent ? ses.code : (($('#code') || {}).value || '').toUpperCase().trim();
  if (!create && !code) return toast('Digite o código da sala.');
  if (ses.avatar == null) ses.avatar = 0;
  save();
  socket.emit('join', { create, code, pid: ses.pid, name: ses.name, avatar: ses.avatar }, r => {
    if (r.ok) { ses.code = r.code; save(); history.replaceState(null, '', '/'); }
    else { if (silent || r.gone) { ses.code = null; save(); S = null; render(); } toast(r.error); }
  });
}

/* ---------- telas ---------- */
function home() {
  return `<div class="cover"></div><div class="home">
  <div class="card"><small>SEU NOME</small><div class="row"><input id="name" maxlength="14" placeholder="Como quer ser chamado?" value="${esc(ses.name || '')}" autocomplete="off"></div>
  <small>SEU AVATAR</small><div class="avs">${AV.map((e, i) => `<button data-a="pick" data-v="${i}" class="${(ses.avatar || 0) === i ? 'on' : ''}">${av({ avatar: i })}</button>`).join('')}</div>
  <button class="btn big" data-a="create" style="margin-top:12px">Criar sala</button></div>
  <div class="card"><small>JÁ TEM UM CÓDIGO?</small><div class="row"><input id="code" maxlength="4" placeholder="ABCD" style="text-transform:uppercase" value="${esc(qs)}" autocomplete="off"><button class="btn" data-a="join">Entrar</button></div></div></div>`;
}
function top() {
  const g = S.game;
  return `<div class="top"><div class="pill">Sala ${S.code}</div>${g && g.mode === 'classico' && S.phase === 'clues' ? `<div class="pill">Rodada ${g.round}/${g.rounds}</div>` : ''}<button class="btn sm alt" data-a="leave">Sair</button></div>`;
}
function settings() {
  const s = S.settings, h = S.host === S.me, d = h ? '' : 'disabled', cl = s.mode === 'classico';
  const stp = (a, v, min, max) => `<div class="step"><button ${d} ${v <= min ? 'disabled' : ''} data-a="${a}" data-v="-1">−</button><b>${v}</b><button ${d} ${v >= max ? 'disabled' : ''} data-a="${a}" data-v="1">+</button></div>`;
  const sw = (a, on) => `<button class="sw ${on ? 'on' : ''}" ${d} data-a="${a}" aria-pressed="${on}"></button>`;
  return `<div class="card"><h3>Configurações</h3>${h ? '' : '<small>Só o anfitrião pode alterar</small>'}
  <div class="seg"><button ${d} class="${cl ? 'on' : ''}" data-a="mode" data-v="classico">Clássico</button><button ${d} class="${cl ? '' : 'on'}" data-a="mode" data-v="desenho">✏️ Desenho</button></div>
  <div class="set"><span>Infiltrados</span>${stp('imp', s.impostors, 1, 4)}</div>
  ${cl ? `<div class="set"><span>Infiltrado recebe dica do tema</span>${sw('hint', s.hint)}</div><div class="set"><span>Rodadas de dicas</span>${stp('rounds', s.rounds, 1, 8)}</div>` : ''}
  <div class="set"><span>Usar tempo</span>${sw('timer', s.timer)}</div>
  ${s.timer ? `<div class="set"><span>${cl ? 'Segundos por dica' : 'Segundos (desenho dura 3×)'}</span><select ${d} data-c="secs">${[15, 20, 30, 45, 60].map(n => `<option ${n === s.seconds ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
  <h3 style="margin-top:12px">Temas</h3><div>${meta ? meta.cats.map(c => `<button class="chip ${s.categories.includes(c.key) ? 'on' : ''}" ${d} data-a="cat" data-v="${c.key}">${c.emoji} ${c.label}</button>`).join('') : ''}</div>
  ${h ? `<button class="btn sm alt" data-a="catall" style="margin-top:8px">Marcar / desmarcar todos</button>` : ''}</div>`;
}
function scoreboard() {
  if (!S.players.some(p => p.score)) return '';
  return `<div class="card"><h3>Placar</h3>${[...S.players].sort((a, b) => b.score - a.score).map(p => `<div class="clue">${av(p, 'xs')}${esc(p.name)}<b>${p.score} pts</b></div>`).join('')}</div>`;
}
function lobby() {
  const host = S.host === S.me, n = S.players.filter(p => p.connected).length, me = P(S.me);
  return top() + `<div class="card center"><small>CÓDIGO DA SALA — chame seus amigos</small><div class="code">${S.code}</div><button class="btn sm" data-a="copy" style="margin-top:8px">Copiar link</button></div>
  <div class="card"><h3>Jogadores (${S.players.length}/12)</h3><div class="grid">${S.players.map(p => `<div class="pl ${p.connected ? '' : 'off'}">${av(p)}<span>${esc(p.name)} ${p.id === S.host ? '👑' : ''}</span></div>`).join('')}</div>
  <small style="display:block;margin:12px 0 6px">TROCAR MEU AVATAR</small><div class="avs">${AV.map((e, i) => `<button class="${me.avatar === i ? 'on' : ''}" ${S.players.some(p => p.avatar === i && p.id !== S.me) ? 'disabled' : ''} data-a="avatar" data-v="${i}">${av({ avatar: i }, 'xs')}</button>`).join('')}</div></div>
  ${settings()}${scoreboard()}
  ${host ? `<button class="btn big" data-a="start" ${n < 3 ? 'disabled' : ''}>${n < 3 ? `Faltam jogadores (${n}/3)` : 'Começar jogo'}</button>` : '<div class="card center">Aguardando o anfitrião iniciar…</div>'}`;
}
function secretChip() {
  const g = S.game;
  if (g.mode === 'desenho') return `<div class="secret"><small>SUA PALAVRA</small><b>${esc(g.word)}</b></div>`;
  if (g.role === 'impostor') return `<div class="secret"><small>VOCÊ É O INFILTRADO 🕵️</small>${g.category ? `<b>Tema: ${esc(g.category)}</b>` : ''}</div>`;
  return `<div class="secret"><small>PALAVRA SECRETA</small><b>${esc(g.word)}</b></div>`;
}
function reveal() {
  const g = S.game, me = P(S.me), r = S.players.filter(p => p.ready && p.connected).length, t = S.players.filter(p => p.connected).length;
  let h;
  if (g.mode === 'desenho') h = `<small>SUA PALAVRA PARA DESENHAR</small><b>${esc(g.word)}</b><small>Tema: ${esc(g.category)}</small><p>Cuidado: alguém recebeu uma palavra diferente. Desenhe sem escrever a palavra!</p>`;
  else if (g.role === 'impostor') h = `<h1 class="win imp">VOCÊ É O INFILTRADO 🕵️</h1>${g.category ? `<small>DICA DO TEMA</small><b>${esc(g.category)}</b>` : '<p>Sem dica desta vez. Disfarce!</p>'}`;
  else h = `<small>A PALAVRA SECRETA É</small><b>${esc(g.word)}</b><small>Tema: ${esc(g.category)}</small><p>Há ${g.nImp} infiltrado(s) entre vocês.</p>`;
  return top() + `<div class="banner"><h2>Só você está vendo isto 🤫</h2></div><div class="secret">${h}</div>
  <button class="btn big" data-a="ready" ${me.ready ? 'disabled' : ''}>${me.ready ? `Aguardando… ${r}/${t}` : 'Entendi, vamos!'}</button>`;
}
function clueList() {
  const g = S.game; if (!g.clues.length) return '';
  let h = '', r = -1;
  g.clues.forEach(c => { if (c.round !== r) { r = c.round; h += `<small>RODADA ${r + 1}</small>`; } const p = P(c.pid); h += `<div class="clue ${c.pid === S.me ? 'me' : ''}">${av(p, 'xs')}${esc(p.name)}<b>${esc(c.text)}</b></div>`; });
  return `<div class="card">${h}</div>`;
}
function clues() {
  const g = S.game, mine = g.turn === S.me, tp = P(g.turn);
  return top() + `<div class="card banner"><div class="mega">📢</div><small>É A VEZ DE</small><h1>${esc(tp.name)}</h1><small>${mine ? 'DÊ SUA DICA (UMA PALAVRA)' : 'AGUARDE A DICA'}</small></div>
  <div class="timer" id="timer">--</div>
  ${mine ? `<form data-f="clue" class="row"><input id="clueIn" maxlength="24" placeholder="Sua dica…" autocomplete="off"><button class="btn">Enviar</button></form>` : ''}
  ${strip(g.turn)}${secretChip()}${clueList()}<p class="center"><small>Debata no 💬 chat — sem dizer a palavra!</small></p>`;
}
const gal = ids => `<div class="gal">${ids.map(id => `<figure><img src="${img(id)}" alt="Desenho de ${esc(P(id).name)}"><figcaption><b>${esc(P(id).name)}</b> ${esc((S.game.explanations || {})[id] || '')}</figcaption></figure>`).join('')}</div>`;
function explain() {
  const g = S.game, mine = g.explainer === S.me;
  return top() + `<div class="banner"><small>EXPLICANDO O DESENHO</small><h1 style="font-size:clamp(40px,10vw,72px)">${esc(P(g.explainer).name)}</h1></div><div class="timer" id="timer">--</div>
  <div class="big"><img src="${img(g.explainer)}" alt="Desenho"></div>
  ${mine ? `<form data-f="explain" class="row card"><input id="exIn" maxlength="140" placeholder="Por que você desenhou isso?" autocomplete="off"><button class="btn">Enviar</button><button type="button" class="btn alt" data-a="skipex">Pular</button></form>` : '<p class="center">Aguarde a explicação…</p>'}
  ${g.drawings.length > 1 ? `<div class="card"><h3>Anteriores</h3>${gal(g.drawings.filter(id => id !== g.explainer))}</div>` : ''}${secretChip()}`;
}
function vote() {
  const g = S.game, v = S.players.filter(p => p.voted).length, t = S.players.filter(p => p.connected).length;
  return top() + `<div class="banner" style="padding:8px"><h1 style="font-size:clamp(36px,9vw,64px)">Quem é o infiltrado?</h1><small>${g.nImp > 1 ? `HÁ ${g.nImp} INFILTRADOS — VOTE EM UM SUSPEITO` : 'ESCOLHA O SUSPEITO'} · ${v}/${t} VOTARAM</small></div><div class="timer" id="timer">--</div>
  ${S.players.filter(p => p.id !== S.me).map(p => `<button class="pick ${g.myVote === p.id ? 'on' : ''}" data-a="vote" data-v="${p.id}">${av(p, 'xs')}${esc(p.name)}<small>${p.voted ? '✔ votou' : ''}</small></button>`).join('')}
  ${g.mode === 'desenho' ? `<div class="card"><h3>Desenhos</h3>${gal(g.drawings)}</div>` : clueList()}${secretChip()}`;
}
function result() {
  const g = S.game, r = g.result, imps = r.impostors.map(P), host = S.host === S.me;
  return top() + `<div class="card banner"><div class="win ${r.crewWin ? 'crew' : 'imp'}">${r.crewWin ? '🎉 Tripulação venceu!' : '🕵️ Infiltrados venceram!'}</div>
  <small>${imps.length > 1 ? 'OS INFILTRADOS ERAM' : 'O INFILTRADO ERA'}</small><div class="row" style="justify-content:center">${imps.map(p => `<div class="pl">${av(p)}<b>${esc(p.name)}</b></div>`).join('')}</div></div>
  <div class="secret"><small>${g.mode === 'desenho' ? 'PALAVRA DA TRIPULAÇÃO' : 'A PALAVRA ERA'}</small><b>${esc(r.word)}</b>${r.word2 ? `<small>PALAVRA DO INFILTRADO</small><b>${esc(r.word2)}</b>` : ''}</div>
  <div class="card"><h3>Votos</h3><small>🕵️ infiltrado · ⚖️ mais votado</small>${S.players.map(p => `<div class="clue">${av(p, 'xs')}${esc(p.name)} ${r.impostors.includes(p.id) ? '🕵️' : ''}${r.accused.includes(p.id) ? '⚖️' : ''}<b>${r.tally[p.id] || 0}</b></div>`).join('')}</div>
  ${g.mode === 'desenho' ? `<div class="card"><h3>Desenhos</h3>${gal(g.drawings)}</div>` : clueList()}${scoreboard()}
  ${host ? '<button class="btn big" data-a="again">Jogar de novo</button>' : '<div class="card center">Aguardando o anfitrião…</div>'}`;
}

/* ---------- desenho ---------- */
function renderDraw() {
  const g = S.game, app = $('#app');
  if (!$('#cv') || drawGid !== g.id) {
    drawGid = g.id; drawn = false; tool = 'pen'; color = PEN[0];
    app.innerHTML = top() + `<div class="banner" style="padding:6px"><small>DICA DA RODADA</small><h2 style="font-size:40px;color:var(--pink2)">${esc(g.category)}</h2></div>
    ${secretChip()}<div class="timer" id="timer">--</div>
    <div class="board"><canvas id="cv" width="640" height="480"></canvas></div>
    <div class="tools">${PEN.map((c, i) => `<button class="col ${i ? '' : 'on'}" style="background:${c}" data-a="color" data-v="${c}" aria-label="cor"></button>`).join('')}
    <button class="tool on" data-a="tool" data-v="pen" aria-label="Lápis">✏️</button><button class="tool" data-a="tool" data-v="eraser" aria-label="Borracha">🧽</button><button class="tool" data-a="clear" aria-label="Limpar">🗑️</button>
    <button class="btn" id="sendD" data-a="send" style="margin-left:auto">Enviar desenho</button></div><div id="dstat"></div>`;
    initCanvas();
  }
  const me = P(S.me); if (me.drew) drawn = true;
  $('#sendD').disabled = drawn;
  $('#dstat').innerHTML = `<small>${S.players.filter(p => p.drew).length}/${S.players.filter(p => p.connected).length} ENVIARAM</small>` + strip(null, p => p.drew ? '<span class="check">✔ enviou</span>' : '');
}
function initCanvas() {
  const cv = $('#cv'), ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 480); ctx.lineCap = ctx.lineJoin = 'round';
  let down = false, last;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 640 / r.width, (e.clientY - r.top) * 480 / r.height]; };
  const seg = (a, b) => { ctx.strokeStyle = tool === 'eraser' ? '#fff' : color; ctx.lineWidth = tool === 'eraser' ? 28 : 5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(b[0] + .01, b[1]); ctx.stroke(); };
  cv.onpointerdown = e => { if (drawn) return; down = true; cv.setPointerCapture(e.pointerId); last = pos(e); seg(last, last); };
  cv.onpointermove = e => { if (!down) return; const p = pos(e); seg(last, p); last = p; };
  cv.onpointerup = cv.onpointercancel = () => { down = false; };
  cv.clearAll = () => { if (!drawn) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 480); } };
}
function sendDraw() {
  const cv = $('#cv'); if (!cv || drawn) return;
  drawn = true; $('#sendD').disabled = true;
  socket.emit('drawing', cv.toDataURL('image/png'), r => { if (!r.ok) { drawn = false; if ($('#sendD')) $('#sendD').disabled = false; toast(r.error); } });
}

/* ---------- render ---------- */
function render() {
  const app = $('#app');
  document.body.classList.toggle('in', !!S);
  $('#chatBtn').classList.toggle('hide', !S);
  $('#chat').classList.toggle('hide', !S || !chatOpen);
  if (!S) { app.innerHTML = ses.code ? '<div class="card center"><h2>Entrando na sala…</h2></div>' : home(); return; }
  if (!meta) return;
  if (S.phase === 'draw') return renderDraw();
  const a = document.activeElement, id = a && a.id, val = a && a.value, ss = a && a.selectionStart;
  app.innerHTML = ({ lobby, reveal, clues, explain, vote, result }[S.phase] || lobby)();
  const e = id && document.getElementById(id);
  if (e) { e.value = val; e.focus(); try { e.setSelectionRange(ss, ss); } catch (x) {} }
  else { const c = $('#clueIn') || $('#exIn'); if (c) c.focus(); }
}
setInterval(() => {
  const t = $('#timer'); if (!t) return;
  t.style.display = endAt ? '' : 'none';
  const end = S && S.phase === 'draw' ? endAt - 3000 : endAt, ms = Math.max(0, end - Date.now()), s = Math.ceil(ms / 1000);
  t.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  t.classList.toggle('low', endAt && s <= 5);
  if (S && S.phase === 'draw' && endAt && ms <= 0 && !drawn) sendDraw();
}, 250);

/* ---------- ações ---------- */
const A = {
  pick: (v, b) => { ses.avatar = +v; save(); document.querySelectorAll('[data-a=pick]').forEach(x => x.classList.toggle('on', x === b)); },
  create: () => join(true), join: () => join(false),
  avatar: v => emit('avatar', +v), mode: v => emit('settings', { mode: v }),
  imp: v => emit('settings', { impostors: S.settings.impostors + +v }),
  rounds: v => emit('settings', { rounds: S.settings.rounds + +v }),
  hint: () => emit('settings', { hint: !S.settings.hint }), timer: () => emit('settings', { timer: !S.settings.timer }),
  cat: v => { const c = S.settings.categories; emit('settings', { categories: c.includes(v) ? c.filter(x => x !== v) : [...c, v] }); },
  catall: () => emit('settings', { categories: S.settings.categories.length === meta.cats.length ? [] : meta.cats.map(c => c.key) }),
  start: () => emit('start'), ready: () => emit('ready'), vote: v => emit('vote', v), again: () => emit('again'),
  skipex: () => emit('explain', ''),
  leave: () => { if (!confirm('Sair da sala?')) return; socket.emit('leave'); ses.code = null; save(); S = null; $('#msgs').innerHTML = ''; chatOpen = false; render(); },
  copy: () => { const l = `${location.origin}/?sala=${S.code}`; (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => toast('Link copiado!'), () => prompt('Copie o link:', l)); },
  color: (v, b) => { color = v; tool = 'pen'; syncTools(); document.querySelectorAll('.col').forEach(x => x.classList.toggle('on', x === b)); },
  tool: v => { tool = v; syncTools(); },
  clear: () => { const c = $('#cv'); if (c) c.clearAll(); },
  send: sendDraw,
};
function syncTools() { document.querySelectorAll('.tool[data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === tool)); }
$('#app').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled && A[b.dataset.a]) A[b.dataset.a](b.dataset.v, b); });
$('#app').addEventListener('change', e => { if (e.target.dataset.c === 'secs') emit('settings', { seconds: +e.target.value }); });
$('#app').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target.dataset.f;
  if (f === 'clue') emit('clue', $('#clueIn').value);
  if (f === 'explain') emit('explain', $('#exIn').value);
});

/* ---------- chat ---------- */
const open = v => { chatOpen = v; if (v) { unread = 0; $('#badge').classList.add('hide'); } render(); const m = $('#msgs'); m.scrollTop = m.scrollHeight; };
$('#chatBtn').onclick = () => open(true); $('#chatX').onclick = () => open(false);
function addMsg(m, quiet) {
  const d = document.createElement('div');
  d.className = 'm ' + (m.sys ? 'sys' : m.from === ses.pid ? 'me' : '');
  d.innerHTML = m.sys ? esc(m.text) : `<i>${esc(m.name)}</i>${esc(m.text)}`;
  const box = $('#msgs'); box.append(d); box.scrollTop = box.scrollHeight;
  if (!quiet && !m.sys && m.from !== ses.pid && !chatOpen && innerWidth < 1100) { unread++; const b = $('#badge'); b.textContent = unread; b.classList.remove('hide'); }
}
socket.on('chatHistory', h => { $('#msgs').innerHTML = ''; h.forEach(m => addMsg(m, true)); });
socket.on('chat', m => addMsg(m));
$('#cform').onsubmit = e => { e.preventDefault(); const i = $('#cin'); if (i.value.trim()) socket.emit('chat', i.value); i.value = ''; };
})();
