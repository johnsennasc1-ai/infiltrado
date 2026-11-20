const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const WORDS = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6, pingInterval: 10000, pingTimeout: 30000 });

const MAX = 12, MIN = 3, AVATARS = 16;
const rooms = new Map();

/* ---------- utilidades ---------- */
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (n, a, b) => Math.max(a, Math.min(b, Math.round(Number(n)) || a));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hasWord = (text, word) => (' ' + norm(text) + ' ').includes(' ' + norm(word) + ' ');
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => pick([...'ABCDEFGHJKLMNPQRSTUVWXYZ'])).join(''); } while (rooms.has(c)); return c; };
const defaults = () => ({ mode: 'classico', impostors: 1, hint: true, rounds: 3, timer: true, seconds: 30, categories: Object.keys(WORDS) });

/* ---------- timers ---------- */
function clearTimer(room) { if (room.timer) clearTimeout(room.timer); room.timer = null; room.deadline = 0; }
function setTimer(room, ms, fn) {
  clearTimer(room);
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null; room.deadline = 0;
    try { fn(); progress(room); } catch (e) { console.error(e); }
    emitState(room);
  }, ms);
}

/* ---------- estado enviado a cada jogador (segredos filtrados) ---------- */
function view(room, pid) {
  const g = room.game, s = room.settings;
  const v = {
    code: room.code, host: room.hostId, me: pid, phase: room.phase, settings: s,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, score: p.score,
      ready: !!g && g.ready.has(p.id), voted: !!g && !!g.votes[p.id], drew: !!g && !!g.drawings[p.id],
    })),
    remaining: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
  };
  if (g && room.phase !== 'lobby') {
    const imp = g.impostors.includes(pid), cat = WORDS[g.category].label;
    const gm = { id: g.id, mode: g.mode, round: g.round + 1, rounds: s.rounds, turn: g.turn, nImp: g.impostors.length, clues: g.clues, category: null, word: null, role: null, myVote: g.votes[pid] || null };
    if (g.mode === 'desenho') { gm.word = imp ? g.word2 : g.word; gm.category = cat; }
    else if (imp) { gm.role = 'impostor'; if (s.hint) gm.category = cat; }
    else { gm.role = 'tripulante'; gm.word = g.word; gm.category = cat; }
    if (g.mode === 'desenho') {
      const vis = room.phase === 'explain' ? g.exOrder.slice(0, g.exIdx + 1) : ['vote', 'result'].includes(room.phase) ? g.order : [];
      gm.drawings = vis.filter(id => g.drawings[id]);
      gm.explainer = room.phase === 'explain' ? g.exOrder[g.exIdx] : null;
      gm.explanations = g.explanations;
    }
    if (room.phase === 'result') gm.result = { ...g.result, impostors: g.impostors, word: g.word, word2: g.mode === 'desenho' ? g.word2 : null };
    v.game = gm;
  }
  return v;
}
function emitState(room) {
  room.touched = Date.now();
  for (const p of room.players.values()) if (p.socketId) io.to(p.socketId).emit('state', view(room, p.id));
}
function sys(room, text) {
  const m = { sys: true, text, ts: Date.now() };
  room.chat.push(m); if (room.chat.length > 80) room.chat.shift();
  io.to(room.code).emit('chat', m);
}

/* ---------- fluxo do jogo ---------- */
function startGame(room) {
  for (const p of [...room.players.values()]) if (!p.connected) removePlayer(room, p.id, true);
  const s = room.settings, ids = [...room.players.keys()];
  const nImp = Math.max(1, Math.min(s.impostors, Math.floor((ids.length - 1) / 2)));
  const cats = s.categories.filter(c => WORDS[c]);
  const category = pick(cats.length ? cats : Object.keys(WORDS));
  const list = shuffle(WORDS[category].words);
  room.game = {
    id: Date.now(), mode: s.mode, category, word: list[0], word2: list[1],
    impostors: shuffle(ids).slice(0, nImp), order: shuffle(ids), clues: [], round: 0, idx: -1, turn: null,
    ready: new Set(), votes: {}, drawings: {}, explanations: {}, exOrder: [], exIdx: 0, result: null,
  };
  for (const p of room.players.values()) p.ready = false;
  room.phase = 'reveal'; clearTimer(room);
  sys(room, `Nova partida! ${ids.length} jogadores, ${nImp} infiltrado(s).`);
}
function begin(room) {
  if (room.game.mode === 'desenho') startDraw(room); else { room.phase = 'clues'; nextTurn(room); }
}
function nextTurn(room) {
  const g = room.game, s = room.settings;
  for (;;) {
    g.idx++; if (g.idx >= g.order.length) { g.idx = 0; g.round++; }
    if (g.round >= s.rounds) return startVote(room);
    const p = room.players.get(g.order[g.idx]);
    if (p && p.connected) break;
  }
  g.turn = g.order[g.idx];
  if (s.timer) { const who = g.turn; setTimer(room, s.seconds * 1000, () => { g.clues.push({ pid: who, round: g.round, text: '—' }); nextTurn(room); }); }
  else clearTimer(room);
}
function startDraw(room) {
  room.phase = 'draw';
  const s = room.settings;
  if (s.timer) setTimer(room, s.seconds * 3000 + 3000, () => startExplain(room)); else clearTimer(room);
}
function startExplain(room) {
  const g = room.game;
  g.exOrder = g.order.filter(id => room.players.get(id)?.connected || g.drawings[id]);
  g.exIdx = -1; room.phase = 'explain'; advanceExplain(room);
}
function advanceExplain(room) {
  const g = room.game; g.exIdx++;
  if (g.exIdx >= g.exOrder.length) return startVote(room);
  if (room.settings.timer) setTimer(room, room.settings.seconds * 1000, () => advanceExplain(room)); else clearTimer(room);
}
function startVote(room) {
  room.phase = 'vote'; room.game.votes = {}; room.game.turn = null;
  if (room.settings.timer) setTimer(room, 60000, () => finishVote(room)); else clearTimer(room);
}
function finishVote(room) {
  clearTimer(room);
  const g = room.game, tally = {};
  Object.values(g.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
  const ids = [...room.players.keys()], k = g.impostors.length;
  const sorted = ids.map(id => ({ id, n: tally[id] || 0 })).sort((a, b) => b.n - a.n);
  const clear = sorted[k - 1].n > 0 && (!sorted[k] || sorted[k - 1].n > sorted[k].n);
  const accused = clear ? sorted.slice(0, k).map(x => x.id) : [];
  const crewWin = clear && accused.every(id => g.impostors.includes(id));
  for (const [id, p] of room.players) {
    const imp = g.impostors.includes(id);
    if (crewWin && !imp) p.score += 1;
    if (!crewWin && imp) p.score += 2;
  }
  g.result = { tally, accused, crewWin };
  room.phase = 'result';
  sys(room, crewWin ? 'A tripulação venceu! 🎉' : 'Os infiltrados venceram! 🕵️');
}
// Reavalia o andamento (jogador caiu, todos agiram etc.)
function progress(room) {
  const g = room.game; if (!g) return;
  const act = [...room.players.values()].filter(p => p.connected);
  if (!act.length) return;
  const cur = room.players.get(room.phase === 'explain' ? g.exOrder[g.exIdx] : g.turn);
  if (room.phase === 'reveal' && act.every(p => g.ready.has(p.id))) begin(room);
  else if (room.phase === 'clues' && cur && !cur.connected) nextTurn(room);
  else if (room.phase === 'draw' && act.every(p => g.drawings[p.id])) startExplain(room);
  else if (room.phase === 'explain' && cur && !cur.connected) advanceExplain(room);
  else if (room.phase === 'vote' && act.every(p => g.votes[p.id])) finishVote(room);
}

/* ---------- jogadores e salas ---------- */
function fixHost(room) {
  const h = room.players.get(room.hostId);
  if (h && h.connected) return;
  const n = [...room.players.values()].find(p => p.connected);
  if (n) room.hostId = n.id;
}
function removePlayer(room, pid, silent) {
  const p = room.players.get(pid); if (!p) return;
  clearTimeout(p.kill);
  if (!silent) sys(room, `${p.name} saiu.`);
  room.players.delete(pid);
  if (!room.players.size) { clearTimer(room); rooms.delete(room.code); return; }
  fixHost(room);
  if (!silent) emitState(room);
}
function blocked(room, pid, text) {
  const g = room.game;
  if (!g || ['lobby', 'result'].includes(room.phase)) return false;
  const imp = g.impostors.includes(pid);
  if (g.mode === 'classico' && imp) return false;
  return hasWord(text, g.mode === 'desenho' && imp ? g.word2 : g.word);
}
setInterval(() => {
  for (const [c, r] of rooms) if (![...r.players.values()].some(p => p.connected) && Date.now() - r.touched > 15 * 60 * 1000) { clearTimer(r); rooms.delete(c); }
}, 5 * 60 * 1000);

/* ---------- HTTP ---------- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.send('ok'));
app.get('/api/meta', (_, res) => res.json({ cats: Object.entries(WORDS).map(([key, v]) => ({ key, label: v.label, emoji: v.emoji })) }));
app.get('/d/:code/:pid', (req, res) => {
  const r = rooms.get(String(req.params.code).toUpperCase());
  const b = r && r.game && r.game.drawings[req.params.pid];
  if (!b) return res.status(404).end();
  res.set({ 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' }).send(b);
});

/* ---------- Socket.IO ---------- */
io.on('connection', socket => {
  const ctx = () => {
    const room = rooms.get(socket.data.code), p = room && room.players.get(socket.data.pid);
    return p && p.socketId === socket.id ? { room, p, g: room.game } : {};
  };
  const done = room => { progress(room); emitState(room); };
  const ok = cb => typeof cb === 'function' ? cb : () => {};

  socket.on('join', (d, cb) => {
    cb = ok(cb); d = d || {};
    const pid = String(d.pid || '');
    if (!/^[a-z0-9]{8,40}$/i.test(pid)) return cb({ ok: false, error: 'Sessão inválida. Recarregue a página.' });
    const name = String(d.name || '').trim().slice(0, 14);
    let room = d.create ? null : rooms.get(String(d.code || '').toUpperCase().trim());
    if (!d.create && !room) return cb({ ok: false, error: 'Sala não encontrada.', gone: true });
    let p = room && room.players.get(pid);
    if (!p) {
      if (!name) return cb({ ok: false, error: 'Digite seu nome.' });
      if (room && room.phase !== 'lobby') return cb({ ok: false, error: 'Partida em andamento. Entre quando ela terminar.' });
      if (room && room.players.size >= MAX) return cb({ ok: false, error: 'Sala cheia (máx. 12).' });
      if (!room) { room = { code: newCode(), hostId: null, players: new Map(), settings: defaults(), phase: 'lobby', game: null, chat: [], timer: null, deadline: 0, touched: Date.now() }; rooms.set(room.code, room); }
      const taken = new Set([...room.players.values()].map(x => x.avatar));
      let av = Number.isInteger(d.avatar) ? ((d.avatar % AVATARS) + AVATARS) % AVATARS : 0;
      while (taken.has(av)) av = (av + 1) % AVATARS;
      p = { id: pid, name, avatar: av, score: 0, connected: true, socketId: socket.id, ready: false };
      room.players.set(pid, p);
      if (!room.hostId) room.hostId = pid;
      sys(room, `${name} entrou na sala.`);
    } else { clearTimeout(p.kill); p.socketId = socket.id; p.connected = true; }
    if (socket.data.code && socket.data.code !== room.code) socket.leave(socket.data.code);
    socket.data = { pid, code: room.code };
    socket.join(room.code);
    cb({ ok: true, code: room.code });
    socket.emit('chatHistory', room.chat);
    fixHost(room); emitState(room);
  });

  socket.on('leave', () => {
    const { room, p } = ctx(); if (!room) return;
    socket.leave(room.code);
    if (room.phase === 'lobby') removePlayer(room, p.id); else { p.connected = false; p.socketId = null; fixHost(room); done(room); }
    socket.data = {};
  });

  socket.on('disconnect', () => {
    const { room, p } = ctx(); if (!room) return;
    p.connected = false; p.socketId = null;
    if (room.phase === 'lobby') p.kill = setTimeout(() => removePlayer(room, p.id), 45000);
    fixHost(room); done(room);
  });

  socket.on('avatar', i => {
    const { room, p } = ctx(); if (!room || room.phase !== 'lobby') return;
    i = Number(i); if (!Number.isInteger(i) || i < 0 || i >= AVATARS) return;
    if ([...room.players.values()].some(x => x.avatar === i && x.id !== p.id)) return;
    p.avatar = i; emitState(room);
  });

  socket.on('settings', d => {
    const { room, p } = ctx(); if (!room || room.phase !== 'lobby' || room.hostId !== p.id || !d) return;
    const s = room.settings;
    if (['classico', 'desenho'].includes(d.mode)) s.mode = d.mode;
    if ('impostors' in d) s.impostors = clamp(d.impostors, 1, 4);
    if ('rounds' in d) s.rounds = clamp(d.rounds, 1, 8);
    if ('seconds' in d) s.seconds = clamp(d.seconds, 10, 90);
    if ('hint' in d) s.hint = !!d.hint;
    if ('timer' in d) s.timer = !!d.timer;
    if (Array.isArray(d.categories)) s.categories = d.categories.filter(c => WORDS[c]);
    emitState(room);
  });

  socket.on('start', (_, cb) => {
    cb = ok(cb); const { room, p } = ctx();
    if (!room || room.hostId !== p.id || room.phase !== 'lobby') return;
    if ([...room.players.values()].filter(x => x.connected).length < MIN) return cb({ ok: false, error: 'São necessários pelo menos 3 jogadores online.' });
    if (!room.settings.categories.length) return cb({ ok: false, error: 'Escolha ao menos um tema.' });
    startGame(room); emitState(room); cb({ ok: true });
  });

  socket.on('ready', () => { const { room, p, g } = ctx(); if (!room || room.phase !== 'reveal') return; g.ready.add(p.id); done(room); });

  socket.on('clue', (t, cb) => {
    cb = ok(cb); const { room, p, g } = ctx();
    if (!room || room.phase !== 'clues' || g.turn !== p.id) return cb({ ok: false, error: 'Não é sua vez.' });
    t = String(t || '').trim().slice(0, 24);
    if (!t) return cb({ ok: false, error: 'Digite sua dica.' });
    if (/\s/.test(t)) return cb({ ok: false, error: 'Use apenas UMA palavra, sem frases.' });
    if (blocked(room, p.id, t)) return cb({ ok: false, error: 'Não vale dizer a palavra secreta!' });
    if (g.clues.some(c => norm(c.text) === norm(t))) return cb({ ok: false, error: 'Essa dica já foi usada. Sem copiar!' });
    g.clues.push({ pid: p.id, round: g.round, text: t });
    nextTurn(room); done(room); cb({ ok: true });
  });

  socket.on('drawing', (d, cb) => {
    cb = ok(cb); const { room, p, g } = ctx();
    if (!room || room.phase !== 'draw') return cb({ ok: false, error: 'Fase de desenho encerrada.' });
    if (typeof d !== 'string' || !d.startsWith('data:image/png;base64,') || d.length > 900000) return cb({ ok: false, error: 'Desenho inválido.' });
    g.drawings[p.id] = Buffer.from(d.split(',')[1], 'base64');
    done(room); cb({ ok: true });
  });

  socket.on('explain', (t, cb) => {
    cb = ok(cb); const { room, p, g } = ctx();
    if (!room || room.phase !== 'explain' || g.exOrder[g.exIdx] !== p.id) return cb({ ok: false, error: 'Não é sua vez.' });
    t = String(t || '').trim().slice(0, 140);
    if (t && blocked(room, p.id, t)) return cb({ ok: false, error: 'Não vale dizer a palavra secreta!' });
    g.explanations[p.id] = t || '(sem explicação)';
    advanceExplain(room); done(room); cb({ ok: true });
  });

  socket.on('vote', t => {
    const { room, p, g } = ctx();
    if (!room || room.phase !== 'vote' || t === p.id || !room.players.has(t)) return;
    g.votes[p.id] = t; done(room);
  });

  socket.on('again', () => {
    const { room, p } = ctx(); if (!room || room.hostId !== p.id || room.phase !== 'result') return;
    clearTimer(room); room.game = null; room.phase = 'lobby';
    for (const x of [...room.players.values()]) if (!x.connected) removePlayer(room, x.id, true);
    emitState(room);
  });

  socket.on('chat', t => {
    const { room, p } = ctx(); if (!room) return;
    t = String(t || '').trim().slice(0, 200); if (!t) return;
    const now = Date.now(); if (now - (p.lastChat || 0) < 400) return; p.lastChat = now;
    if (blocked(room, p.id, t)) return socket.emit('toast', '🚫 Não vale dizer a palavra secreta!');
    const m = { from: p.id, name: p.name, avatar: p.avatar, text: t, ts: now };
    room.chat.push(m); if (room.chat.length > 80) room.chat.shift();
    io.to(room.code).emit('chat', m);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Jogo do Infiltrado rodando na porta ${PORT}`));
