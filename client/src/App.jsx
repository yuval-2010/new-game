import { useEffect } from 'react';
import { socket } from './api';
import { useGame } from './store';
import Lobby from './components/Lobby';
import AnswerInput from './components/AnswerInput';
import Reveal from './components/Reveal';
import Vote from './components/Vote';
import Results from './components/Results';

export default function App(){
  const { setState, setPrompt, setAnswers, setResults, setMe } = useGame();

  useEffect(() => {
    socket.on('connect', () => setMe({ id: socket.id }));
    socket.on('room:update', (s) => setState(s));
    socket.on('round:prompt', ({ prompt, isOdd }) => setPrompt(prompt, isOdd));
    socket.on('round:reveal', ({ pair, answers }) => { setAnswers(answers); });
    socket.on('round:results', (results) => setResults(results));
    return () => {
      socket.off('connect');
      socket.off('room:update');
      socket.off('round:prompt');
      socket.off('round:reveal');
      socket.off('round:results');
    };
  }, []);

  const { state } = useGame();
  if(!state) return <div className="min-h-screen flex items-center justify-center text-xl">טוען…</div>;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Undercover Numbers</h1>
      {state.status === 'lobby' && <Lobby />}
      {state.status === 'submit' && <AnswerInput />}
      {state.status === 'reveal' && <Reveal />}
      {state.status === 'vote' && <Vote />}
      {state.status === 'results' && <Results />}
    </div>
  );
}
