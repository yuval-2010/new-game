import { create } from 'zustand';

export const useGame = create((set, get) => ({
  me: { name: '', id: null },
  room: null,
  state: null,
  prompt: null,
  isOdd: false,
  answers: [],
  results: null,

  setMe: (p) => set({ me: { ...get().me, ...p } }),
  setRoom: (room) => set({ room }),
  setState: (state) => set({ state }),
  setPrompt: (prompt, isOdd) => set({ prompt, isOdd }),
  setAnswers: (answers) => set({ answers }),
  setResults: (results) => set({ results }),
}));
