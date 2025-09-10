import { useState } from 'react';
import { useGame } from '../store';
import { socket } from '../api';

export default function AnswerInput(){
  const { state, prompt } = useGame();
  const [val, setVal] = useState('');
  const submit = () => {
    socket.emit('round:submitAnswer', { code: state.code, answer: val }, (res)=>{
      if(res?.error) alert(res.error);
    });
  };
  return (
    <div className="p-4 bg-white rounded-2xl shadow space-y-3">
      <div className="text-sm text-slate-600">סיבוב #{state.round}</div>
      <div className="text-xl font-semibold">השאלה שלך:</div>
      <div className="p-3 bg-slate-100 rounded-lg">{prompt || '…'}</div>
      <input className="w-full border rounded-lg p-2" type="text" value={val} onChange={e=>setVal(e.target.value)} placeholder="כתוב שם"/>
      <button className="px-3 py-2 bg-blue-600 text-white rounded-lg" onClick={submit}>שלח</button>
      <div className="text-xs text-slate-500">אחרי שכולם שולחים – מתקדמים לחשיפה.</div>
    </div>
  );
}
