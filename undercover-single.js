
// Undercover Numbers - Single File Server + Client
// Run: node undercover-single.js
// Render/Railway Build Command (no package.json): npm i express socket.io cors
// Start Command: node undercover-single.js

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 8080;

// ---------- Game Logic ----------
const rooms = new Map();
function genRoomCode(){ return Math.random().toString(36).substring(2, 6).toUpperCase(); }
const QUESTION_PAIRS = [
  { common: "מי יתחתן ראשון? כתוב שם אחד.", odd: "מי יתחתן אחרון? כתוב שם אחד." },
  { common: "מי יגיע למסיבה ראשון?", odd: "מי יגיע למסיבה אחרון?" },
  { common: "מי יסיים את המטלה ראשון?", odd: "מי יסיים את המטלה אחרון?" },
  { common: "מי יקום בבוקר ראשון?", odd: "מי יקום בבוקר אחרון?" },
  { common: "מי יעלה ראשון לבמה?", odd: "מי יעלה אחרון לבמה?" }
];
function getPublicState(room){
  const players = Object.values(room.players).map(p => ({
    id: p.id, name: p.name, score: p.score, connected: p.connected
  }));
  return {
    code: room.code,
    hostId: room.hostId,
    players,
    status: room.status,
    round: room.round,
    pair: room.status !== 'submit' ? room.pair : null,
    oddPlayerId: (room.status === 'results' || room.status === 'reveal') ? room.oddPlayerId : null,
    lastResults: room.lastResults,
  };
}
function broadcast(room){ io.to(room.code).emit('room:update', getPublicState(room)); }

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }, cb) => {
    const code = genRoomCode();
    const room = {
      code,
      hostId: socket.id,
      createdAt: Date.now(),
      players: {},
      status: 'lobby',
      round: 0,
      oddPlayerId: null,
      pair: null,
      submissions: {},
      votes: {},
      lastResults: null,
    };
    rooms.set(code, room);
    room.players[socket.id] = { id: socket.id, name: (name?.trim() || 'Host'), score: 0, connected: true };
    socket.join(code);
    cb?.({ code, state: getPublicState(room) });
    broadcast(room);
  });

  socket.on('room:join', ({ code, name }, cb) => {
    code = (code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if(!room) return cb?.({ error: 'Room not found' });
    if(room.status !== 'lobby') return cb?.({ error: 'Game already started' });
    room.players[socket.id] = { id: socket.id, name: (name||'Player').trim(), score: 0, connected: true };
    socket.join(code);
    cb?.({ code, state: getPublicState(room) });
    broadcast(room);
  });

  socket.on('room:leave', ({ code }) => {
    const room = rooms.get(code);
    if(!room) return;
    if(room.players[socket.id]){
      room.players[socket.id].connected = false;
    }
    socket.leave(code);
    broadcast(room);
  });

  socket.on('round:start', ({ code }, cb) => {
    const room = rooms.get(code);
    if(!room) return cb?.({ error: 'Room not found' });
    if(socket.id !== room.hostId) return cb?.({ error: 'Only host can start' });

    const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
    if(playerIds.length < 4) return cb?.({ error: 'Need at least 4 players' });

    room.round += 1;
    room.submissions = {};
    room.votes = {};
    room.lastResults = null;
    room.oddPlayerId = playerIds[Math.floor(Math.random() * playerIds.length)];
    room.pair = QUESTION_PAIRS[Math.floor(Math.random() * QUESTION_PAIRS.length)];
    room.status = 'submit';

    playerIds.forEach(pid => {
      const isOdd = pid === room.oddPlayerId;
      io.to(pid).emit('round:prompt', { prompt: isOdd ? room.pair.odd : room.pair.common, isOdd });
    });
    broadcast(room);
    cb?.({ ok: true });
  });

  socket.on('round:submitAnswer', ({ code, answer }, cb) => {
    const room = rooms.get(code);
    if(!room) return cb?.({ error: 'Room not found' });
    if(room.status !== 'submit') return cb?.({ error: 'Not accepting answers now' });
    const text = String(answer ?? '').trim();
    if(!text) return cb?.({ error: 'Empty answer' });
    room.submissions[socket.id] = { text: text.slice(0, 80) };
    const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
    const allSubmitted = playerIds.every(pid => room.submissions[pid]);
    if(allSubmitted){
      room.status = 'reveal';
      io.to(room.code).emit('round:reveal', {
        pair: room.pair,
        answers: playerIds.map(pid => ({ playerId: pid, name: room.players[pid].name, text: room.submissions[pid].text }))
      });
      broadcast(room);
    } else {
      broadcast(room);
    }
    cb?.({ ok: true });
  });

  socket.on('round:vote', ({ code, targetId }, cb) => {
    const room = rooms.get(code);
    if(!room) return cb?.({ error: 'Room not found' });
    if(room.status !== 'reveal' && room.status !== 'vote') room.status = 'vote';
    if(!room.players[targetId]) return cb?.({ error: 'Invalid target' });
    room.votes[socket.id] = targetId;
    const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
    const allVoted = playerIds.every(pid => room.votes[pid]);
    broadcast(room);
    if(allVoted){
      const tally = {};
      for(const pid of playerIds){
        const t = room.votes[pid];
        tally[t] = (tally[t] || 0) + 1;
      }
      const winnerId = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0][0];
      const correct = winnerId === room.oddPlayerId;
      if(correct){
        playerIds.forEach(pid => { if(pid !== room.oddPlayerId) room.players[pid].score += 1; });
      } else {
        room.players[room.oddPlayerId].score += 1;
      }
      room.lastResults = { tally, correct, oddPlayerId: room.oddPlayerId };
      room.status = 'results';
      io.to(room.code).emit('round:results', room.lastResults);
      broadcast(room);
    }
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    for(const room of rooms.values()){
      if(room.players[socket.id]){
        room.players[socket.id].connected = false;
        if(socket.id === room.hostId){
          const next = Object.keys(room.players).find(pid => room.players[pid].connected);
          if(next) room.hostId = next;
        }
        broadcast(room);
      }
    }
  });
});

// ---------- Single-file Client ----------
const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Undercover Numbers</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:#f8fafc; margin:0; }
  .wrap { max-width: 900px; margin: 20px auto; padding: 16px; }
  .card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .row { display:grid; gap:8px; grid-template-columns: 1fr 120px; }
  .btn { background:#2563eb; color:#fff; border:none; padding:10px 14px; border-radius:10px; cursor:pointer; }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  input, button, select { font-size: 16px; }
  input { width: 100%; padding: 10px; border:1px solid #cbd5e1; border-radius:10px; }
  .pill { border:1px solid #cbd5e1; padding:6px 10px; border-radius:999px; font-size:14px; }
  .grid { display:grid; gap:8px; grid-template-columns: repeat(2, minmax(0,1fr)); }
  .muted { color:#64748b; font-size: 14px; }
  .title { font-weight:700; font-size: 22px; margin-bottom: 8px; text-align:center; }
</style>
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
</head>
<body>
<div class="wrap">
  <div id="app" class="card"></div>
</div>
<script>
const socket = io();
let state = null;
let me = { name: '', id: null };
let prompt = null;
let answers = [];
let results = null;

socket.on('connect', () => { me.id = socket.id; render(); });
socket.on('room:update', (s) => { state = s; render(); });
socket.on('round:prompt', ({ prompt: p, isOdd }) => { prompt = p; render(); });
socket.on('round:reveal', ({ pair, answers: a }) => { answers = a; state.pair = pair; render(); });
socket.on('round:results', (r) => { results = r; render(); });

function el(tag, attrs={}, ...children){
  const e = document.createElement(tag);
  for(const k in attrs){
    if(k === 'class') e.className = attrs[k];
    else if(k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for(const c of children){
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function render(){
  const root = document.getElementById('app');
  root.innerHTML = '';
  if(!state){
    root.appendChild(el('div', {}, 'טוען…')); return;
  }
  const header = el('div', {}, el('div', {class:'title'}, 'Undercover Numbers'));
  root.appendChild(header);

  if(state.status === 'lobby'){
    const nameInput = el('input', {placeholder:'שם שחקן', value: me.name, oninput: e=>{me.name=e.target.value;} });
    const codeInput = el('input', {placeholder:'קוד חדר'});
    const createBtn = el('button', {class:'btn', onclick: ()=> {
      socket.emit('room:create', { name: me.name || 'Player' }, ({ code, state: s, error })=>{
        if(error) return alert(error);
      });
    }}, 'צור חדר');
    const joinBtn = el('button', {class:'btn', onclick: ()=> {
      socket.emit('room:join', { code: codeInput.value, name: me.name || 'Player' }, ({ error })=>{
        if(error) alert(error);
      });
    }}, 'הצטרף');

    const row1 = el('div', {class:'row'}, nameInput, createBtn);
    const row2 = el('div', {class:'row'}, codeInput, joinBtn);

    const players = el('div', {class:'grid'});
    (state.players||[]).forEach(p => players.appendChild(el('div', {class:'pill'}, p.name + (p.id===state.hostId?' (Host)':''))));

    const start = el('button', {class:'btn', disabled: (state.players||[]).length<4, onclick: ()=>{
      socket.emit('round:start', { code: state.code }, (res)=> res?.error && alert(res.error));
    }}, 'Start Round');

    root.appendChild(el('div', {class:'muted'}, 'חדר: ' + (state.code || '—')));
    root.appendChild(row1);
    root.appendChild(row2);
    root.appendChild(el('div', {style:'height:8px'}));
    root.appendChild(players);
    root.appendChild(el('div', {style:'height:8px'}));
    root.appendChild(start);
  }

  if(state.status === 'submit'){
    const input = el('input', {placeholder:'כתוב שם', oninput:e=>window.__val=e.target.value});
    const btn = el('button', {class:'btn', onclick:()=>{
      socket.emit('round:submitAnswer', { code: state.code, answer: window.__val||'' }, (res)=>{
        if(res?.error) alert(res.error);
      });
    }}, 'שלח');
    root.appendChild(el('div', {class:'muted'}, 'סיבוב #' + state.round));
    root.appendChild(el('div', {}, 'השאלה שלך:'));
    root.appendChild(el('div', {class:'pill'}, prompt || '…'));
    root.appendChild(el('div', {style:'height:8px'}));
    root.appendChild(el('div', {class:'row'}, input, btn));
  }

  if(state.status === 'reveal'){
    const common = el('div', {class:'pill'}, 'רגילה: ' + (state.pair?.common || ''));
    const odd = el('div', {class:'pill'}, 'חשוד: ' + (state.pair?.odd || ''));
    const list = el('div', {class:'grid'});
    (answers||[]).forEach(a => list.appendChild(el('div', {class:'pill'}, a.name + ': ' + a.text)));
    root.appendChild(common);
    root.appendChild(el('div', {style:'height:6px'}));
    root.appendChild(odd);
    root.appendChild(el('div', {style:'height:8px'}));
    root.appendChild(el('div', {}, 'תשובות שנשלחו:'));
    root.appendChild(list);
    root.appendChild(el('div', {style:'height:8px'}));
    root.appendChild(el('div', {class:'muted'}, 'עוברים להצבעה מהתפריט (יתחיל אוטומטית כשכולם יצביעו).'));
    // מעבר למסך הצבעה קורה אחרי event של votes (מטופל בשרת)
  }

  if(state.status === 'vote'){
    root.appendChild(el('div', {}, 'הצביעו לחשוד:'));
    const grid = el('div', {class:'grid'});
    (state.players||[]).forEach(p => {
      grid.appendChild(el('button', {class:'btn', onclick:()=>{
        socket.emit('round:vote', { code: state.code, targetId: p.id }, (res)=>{ if(res?.error) alert(res.error); });
      }}, p.name));
    });
    root.appendChild(grid);
    root.appendChild(el('div', {class:'muted'}, 'כשהכל מצביעים – יופיעו תוצאות.'));
  }

  if(state.status === 'results'){
    const msg = results?.correct ? 'הרוב זיהה נכון!' : 'החשוד ברח מזיהוי 😈';
    root.appendChild(el('div', {class:'pill'}, msg));
    root.appendChild(el('div', {}, 'החשוד היה: ' + ((state.players||[]).find(p=>p.id===results?.oddPlayerId)?.name || '')));
    const list = el('ul');
    const entries = Object.entries(results?.tally || {}).sort((a,b)=>b[1]-a[1]);
    entries.forEach(([pid, count])=>{
      const name = (state.players||[]).find(p=>p.id===pid)?.name || pid;
      list.appendChild(el('li', {}, name + ': ' + count));
    });
    root.appendChild(list);
    const again = el('button', {class:'btn', onclick:()=>{
      socket.emit('round:start', { code: state.code }, (res)=>{ if(res?.error) alert(res.error); });
    }}, 'סיבוב חדש');
    root.appendChild(el('div', {style:'height:8px'}));
    root.appendChild(again);
  }
}
app.get('/', (_, res) => res.type('html').send(html));
server.listen(PORT, () => console.log('Undercover Numbers single-file on :' + PORT));
