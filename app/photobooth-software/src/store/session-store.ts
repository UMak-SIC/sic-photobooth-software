import { create } from 'zustand';

import type { ActiveSession } from '@/types/session';

interface SessionState {
  activeSession: ActiveSession | null;
  setActiveSession: (activeSession: ActiveSession) => void;
  clearActiveSession: () => void;
}

const initialState = {
  activeSession: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,
  setActiveSession: (activeSession) => set({ activeSession }),
  clearActiveSession: () => set(initialState),
}));
