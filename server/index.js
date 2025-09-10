import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { QUESTION_PAIRS } from './questions.js';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 8080;

/**
 * rooms[code] = {
 *  code, hostId, players: { [socketId]: {id,name,score,connected} },
 *  status, round, oddPlayerId, pair, submissions: { [id]: { text }}, votes, lastResults
 * }
 */
const rooms = new Map();

function genRoomCode(){
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

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

function broadcast(room){
  io.to(room.code).emit('room:update', getPublicState(room));
}

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

    // personal prompts
    playerIds.forEach(pid => {
      const isOdd = pid === room.oddPlayerId;
      io.to(pid).emit('round:prompt', { prompt: isOdd ? room.pair.odd : room.pair.common, isOdd });
    });
    broadcast(room);
    cb?.({ ok: true });
  });

  // NEW: text answers instead of numbers
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

app.get('/', (_, res) => res.send('Undercover Numbers server up'));
server.listen(PORT, () => console.log('Undercover Numbers server on :' + PORT));
