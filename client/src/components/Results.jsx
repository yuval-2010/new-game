import { useGame } from '../store';
import { socket } from '../api';

export default function Results(){
  const { state, results } = useGame();
  if(!results) return null;

  const startAgain = () => socket.emit('round:start', { code: state.code }, (res)=>{ if(res?.error) alert(res.error); });

  const tallyEntries = Object.entries(results.tally || {}).sort((a,b)=>b[1]-a[1]);

  return (
    <div className="p-4 bg-white rounded-2xl shadow space-y-3">
      <div className="text-xl font-semibold">תוצאות</div>
      <div className="">{results.correct ? 'הרוב זיהה נכון!' : 'החשוד ברח מזיהוי 😈'}</div>
      <div className="text-sm">החשוד היה: <span className="font-semibold">{state.players.find(p=>p.id===results.oddPlayerId)?.name}</span></div>
      <div className="mt-2">
        <div className="font-medium">ספירת קולות:</div>
        <ul className="list-disc ms-6">
          {tallyEntries.map(([pid, count]) => (
            <li key={pid}>{state.players.find(p=>p.id===pid)?.name}: {count}</li>
          ))}
        </ul>
      </div>
      <div className="mt-2">
        <div className="font-medium">טבלת ניקוד:</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
          {state.players.map(p => (
            <div key={p.id} className="p-2 border rounded-xl">
              <div className="text-sm text-slate-600">{p.name}</div>
              <div className="text-xl font-bold">{p.score}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={startAgain} className="px-3 py-2 bg-emerald-600 text-white rounded-lg">סיבוב חדש</button>
    </div>
  );
}
