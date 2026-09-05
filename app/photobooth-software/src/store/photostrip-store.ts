import { create } from 'zustand';
import type { ReviewTemplate } from '../components/PhotoStripReview';

export type PhotoStripStep = 'template_select' | 'capturing' | 'review' | 'complete';

export interface PhotoCaptureItem {
  captureIndex: number;
  dataUrl: string;
  blob: Blob;
}

export interface PhotoStripState {
  currentStep: PhotoStripStep;
  sessionId: string | null;
  sessionToken: string | null;
  selectedTemplate: ReviewTemplate | null;
  captures: PhotoCaptureItem[];
  retakeCount: number;
  activeSlotIndex: number;
  isRetaking: boolean;
  isCountingDown: boolean;
  countdownSeconds: 3 | 5 | 10;
  publicId: string | null;
  qrUrl: string | null;
  outputImageUrl: string | null;
  isConfirming: boolean;
  errorMessage: string | null;

  setSession: (sessionId: string, token: string) => void;
  setStep: (step: PhotoStripStep) => void;
  setTemplate: (template: ReviewTemplate) => void;
  startCountdown: () => void;
  stopCountdown: () => void;
  addCapture: (blob: Blob, slotIndex?: number) => void;
  startRetake: (captureIndex: number) => void;
  setConfirmedOutput: (publicId: string, qrUrl: string, outputImageUrl: string) => void;
  setIsConfirming: (isConfirming: boolean) => void;
  setError: (error: string | null) => void;
  resetPhotoStrip: () => void;
}

const initialState = {
  currentStep: 'template_select' as PhotoStripStep,
  sessionId: null,
  sessionToken: null,
  selectedTemplate: null,
  captures: [] as PhotoCaptureItem[],
  retakeCount: 0,
  activeSlotIndex: 1,
  isRetaking: false,
  isCountingDown: false,
  countdownSeconds: 5 as const,
  publicId: null,
  qrUrl: null,
  outputImageUrl: null,
  isConfirming: false,
  errorMessage: null,
};

export const usePhotoStripStore = create<PhotoStripState>((set, get) => ({
  ...initialState,

  setSession: (sessionId, sessionToken) => set({ sessionId, sessionToken }),

  setStep: (currentStep) => set({ currentStep, errorMessage: null }),

  setTemplate: (selectedTemplate) =>
    set({
      selectedTemplate,
      captures: [],
      activeSlotIndex: 1,
      isRetaking: false,
      countdownSeconds: (selectedTemplate.countdownSeconds as 3 | 5 | 10) || 5,
      currentStep: 'capturing',
    }),

  startCountdown: () => set({ isCountingDown: true }),

  stopCountdown: () => set({ isCountingDown: false }),

  addCapture: (blob: Blob, slotIndex?: number) => {
    const state = get();
    const dataUrl = URL.createObjectURL(blob);
    const targetSlot = slotIndex ?? state.activeSlotIndex;

    let updatedCaptures: PhotoCaptureItem[];
    const existingIndex = state.captures.findIndex((c) => c.captureIndex === targetSlot);

    if (existingIndex >= 0) {
      URL.revokeObjectURL(state.captures[existingIndex].dataUrl);
      updatedCaptures = [...state.captures];
      updatedCaptures[existingIndex] = { captureIndex: targetSlot, dataUrl, blob };
    } else {
      updatedCaptures = [...state.captures, { captureIndex: targetSlot, dataUrl, blob }];
    }

    if (state.isRetaking) {
      set({
        captures: updatedCaptures,
        retakeCount: state.retakeCount + 1,
        isRetaking: false,
        isCountingDown: false,
        currentStep: 'review',
      });
      return;
    }

    const totalNeeded = state.selectedTemplate?.placements.length || 3;
    if (targetSlot < totalNeeded) {
      set({
        captures: updatedCaptures,
        activeSlotIndex: targetSlot + 1,
        isCountingDown: false,
      });
    } else {
      set({
        captures: updatedCaptures,
        isCountingDown: false,
        currentStep: 'review',
      });
    }
  },

  startRetake: (captureIndex: number) => {
    const state = get();
    if (state.retakeCount >= 4) {
      set({ errorMessage: 'Maximum 4 retakes limit reached.' });
      return;
    }
    set({
      activeSlotIndex: captureIndex,
      isRetaking: true,
      isCountingDown: false,
      currentStep: 'capturing',
      errorMessage: null,
    });
  },

  setConfirmedOutput: (publicId, qrUrl, outputImageUrl) =>
    set({
      publicId,
      qrUrl,
      outputImageUrl,
      isConfirming: false,
      currentStep: 'complete',
    }),

  setIsConfirming: (isConfirming) => set({ isConfirming }),

  setError: (errorMessage) => set({ errorMessage }),

  resetPhotoStrip: () => {
    const { captures } = get();
    captures.forEach((c) => URL.revokeObjectURL(c.dataUrl));
    set(initialState);
  },
}));
