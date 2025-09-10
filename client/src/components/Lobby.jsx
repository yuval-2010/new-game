import { useState } from 'react';
import { socket } from '../api';
import { useGame } from '../store';

export default function Lobby(){
  const { me, state, setRoom, setState, setMe } = useGame();
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState(me.name || '');

  const createRoom = () => {
    socket.emit('room:create', { name }, ({ code, state, error }) => {
      if(error) return alert(error);
      setRoom(code); setState(state); setMe({ name });
    });
  };
  const joinRoom = () => {
    socket.emit('room:join', { code: joinCode, name }, ({ code, state, error }) => {
      if(error) return alert(error);
      setRoom(code); setState(state); setMe({ name });
    });
  };
  const start = () => socket.emit('round:start', { code: state.code }, (res)=> res?.error && alert(res.error));

  return (
    <div className="space-y-4">
      <div className="p-4 bg-white rounded-2xl shadow">
        <label className="block text-sm mb-1">שם שחקן</label>
        <input className="w-full border rounded-lg p-2" value={name} onChange={e=>setName(e.target.value)} placeholder="הקלד שם"/>
        <div className="mt-3 flex gap-2">
          <button className="px-3 py-2 bg-blue-600 text-white rounded-lg" onClick={createRoom}>צור חדר</button>
          <input className="flex-1 border rounded-lg p-2" value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder="קוד חדר"/>
          <button className="px-3 py-2 bg-slate-700 text-white rounded-lg" onClick={joinRoom}>הצטרף</button>
        </div>
      </div>

      <div className="p-4 bg-white rounded-2xl shadow">
        <h2 className="font-semibold">חדר: {state.code || '—'}</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {state.players?.map(p => (
            <div key={p.id} className={`p-2 rounded-xl border ${p.id===state.hostId?'border-blue-600':'border-slate-200'}`}>
              {p.name} {p.id===state.hostId && <span className="text-xs text-blue-600">(Host)</span>}
            </div>
          ))}
        </div>
        <div className="mt-3">
          <button disabled={state.players?.length<4} className="px-3 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50" onClick={start}>Start Round</button>
        </div>
      </div>
    </div>
  );
}
