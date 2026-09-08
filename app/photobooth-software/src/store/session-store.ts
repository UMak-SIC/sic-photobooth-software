import { create } from 'zustand';

import type { ActiveSession } from '@/types/session';

export type SetupStage = 'welcome' | 'choose_event' | 'choose_experience';

export interface SelectedEventData {
  id?: string;
  name: string;
  date: string;
  operatorName: string;
}

interface SessionState {
  activeSession: ActiveSession | null;
  stage: SetupStage;
  selectedEvent: SelectedEventData | null;
  setActiveSession: (activeSession: ActiveSession | null) => void;
  clearActiveSession: () => void;
  setStage: (stage: SetupStage) => void;
  setSelectedEvent: (selectedEvent: SelectedEventData | null) => void;
  backToExperienceChoice: () => void;
}

const initialState = {
  activeSession: null,
  stage: 'welcome' as SetupStage,
  selectedEvent: null as SelectedEventData | null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,
  setActiveSession: (activeSession) => set({ activeSession }),
  clearActiveSession: () => set(initialState),
  setStage: (stage) => set({ stage }),
  setSelectedEvent: (selectedEvent) => set({ selectedEvent }),
  backToExperienceChoice: () => set({ activeSession: null, stage: 'choose_experience' }),
}));

