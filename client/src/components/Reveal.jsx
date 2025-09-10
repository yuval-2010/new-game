import { useGame } from '../store';

export default function Reveal(){
  const { state, answers } = useGame();
  return (
    <div className="space-y-4">
      <div className="p-4 bg-white rounded-2xl shadow">
        <div className="text-sm text-slate-600">סיבוב #{state.round}</div>
        <div className="text-xl font-semibold">חשיפה</div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="p-3 bg-emerald-50 rounded-xl">
            <div className="text-sm text-emerald-700">גרסת השאלה הרגילה</div>
            <div className="font-medium">{state.pair?.common}</div>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl">
            <div className="text-sm text-rose-700">גרסת השאלה לחשוד</div>
            <div className="font-medium">{state.pair?.odd}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="font-semibold mb-1">תשובות שנשלחו:</div>
          <div className="grid grid-cols-2 gap-2">
            {(answers || []).map(n => (
              <div key={n.playerId} className="p-2 border rounded-xl">
                <div className="text-slate-600 text-sm">{n.name}</div>
                <div className="text-xl font-bold">{n.text}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 text-sm text-slate-500">עוברים להצבעה — או המתינו לשאר.</div>
      </div>
    </div>
  );
}
