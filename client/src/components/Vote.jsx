import { useGame } from '../store';
import { socket } from '../api';

export default function Vote(){
  const { state } = useGame();
  const vote = (targetId) => socket.emit('round:vote', { code: state.code, targetId }, (res)=>{ if(res?.error) alert(res.error); });
  return (
    <div className="p-4 bg-white rounded-2xl shadow">
      <div className="text-xl font-semibold">הצביעו לחשוד</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
        {state.players.map(p => (
          <button key={p.id} onClick={()=>vote(p.id)} className="p-3 rounded-xl border hover:bg-slate-50 text-left">
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-slate-500">לחץ כדי לבחור</div>
          </button>
        ))}
      </div>
      <div className="mt-2 text-sm text-slate-500">כשהכל מצביעים – יופיעו תוצאות.</div>
    </div>
  );
}
