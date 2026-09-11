import { create } from 'zustand';
import type { ReviewTemplate } from '../components/photostrip/PhotoStripReview';
import { PHOTO_STRIP_CONFIG } from '../config/photostrip';
import type { PhotoFilterType } from '../config/filters';

export type PhotoStripStep =
  | 'setup'
  | 'template_select'
  | 'instructions'
  | 'capturing'
  | 'review'
  | 'complete';

export interface PoolPhotoItem {
  id: string;
  blob: Blob;
  dataUrl: string;
  label: string;
  letter?: string;
  createdAt: number;
  isRetake?: boolean;
}

export interface PhotoCaptureItem {
  captureIndex: number;
  dataUrl: string;
  blob: Blob;
  photoId?: string;
  originalDataUrl?: string;
  originalBlob?: Blob;
  retakeDataUrl?: string;
  retakeBlob?: Blob;
  activeVersion?: 'original' | 'retake';
  retakeOrder?: number;
}

export interface PhotoStripEvent {
  id?: string;
  name: string;
  date: string;
  operatorName: string;
}

export interface PhotoStripState {
  currentStep: PhotoStripStep;
  sessionId: string | null;
  sessionToken: string | null;
  selectedEvent: PhotoStripEvent | null;
  selectedTemplate: ReviewTemplate | null;
  captures: PhotoCaptureItem[];
  photoPool: PoolPhotoItem[];
  slotAssignments: Record<number, string>;
  retakeCount: number;
  activeSlotIndex: number;
  isRetaking: boolean;
  isCountingDown: boolean;
  countdownSeconds: number;
  publicId: string | null;
  qrUrl: string | null;
  outputImageUrl: string | null;
  isConfirming: boolean;
  errorMessage: string | null;
  isPrinted: boolean;
  copiesPrinted: number;
  selectedFilter: PhotoFilterType;

  setSession: (sessionId: string, token: string) => void;
  setSelectedEvent: (event: PhotoStripEvent | null) => void;
  setStep: (step: PhotoStripStep) => void;
  setTemplate: (template: ReviewTemplate) => void;
  setSelectedFilter: (filter: PhotoFilterType) => void;
  startCountdown: () => void;
  stopCountdown: () => void;
  addCapture: (blob: Blob, slotIndex?: number) => void;
  startRetake: (captureIndex: number) => void;
  assignPhotoToSlot: (slotIndex: number, photoId: string) => void;
  toggleCaptureVersion: (captureIndex: number) => void;
  setCaptureVersion: (captureIndex: number, version: 'original' | 'retake') => void;
  setConfirmedOutput: (publicId: string, qrUrl: string, outputImageUrl: string) => void;
  setIsConfirming: (isConfirming: boolean) => void;
  setError: (error: string | null) => void;
  recordPrintSuccess: (copies: number) => void;
  resetPhotoStrip: () => void;
}

const initialState = {
  currentStep: 'setup' as PhotoStripStep,
  sessionId: null,
  sessionToken: null,
  selectedEvent: null,
  selectedTemplate: null,
  captures: [] as PhotoCaptureItem[],
  photoPool: [] as PoolPhotoItem[],
  slotAssignments: {} as Record<number, string>,
  retakeCount: 0,
  activeSlotIndex: 1,
  isRetaking: false,
  isCountingDown: false,
  countdownSeconds: PHOTO_STRIP_CONFIG.photoCountdownSeconds,
  publicId: null,
  qrUrl: null,
  outputImageUrl: null,
  isConfirming: false,
  errorMessage: null,
  isPrinted: false,
  copiesPrinted: 0,
  selectedFilter: 'normal' as PhotoFilterType,
};

const RETAKE_LETTERS = ['A', 'B', 'C', 'D'];

export const usePhotoStripStore = create<PhotoStripState>((set, get) => ({
  ...initialState,

  recordPrintSuccess: (copies: number) =>
    set((state) => ({
      isPrinted: true,
      copiesPrinted: state.copiesPrinted + copies,
    })),

  setSelectedEvent: (selectedEvent) => set({ selectedEvent }),

  setSession: (sessionId, sessionToken) => set({ sessionId, sessionToken }),

  setSelectedFilter: (selectedFilter: PhotoFilterType) => set({ selectedFilter }),

  setStep: (currentStep) => set({ currentStep, errorMessage: null }),

  setTemplate: (selectedTemplate) =>
    set({
      selectedTemplate,
      captures: [],
      photoPool: [],
      slotAssignments: {},
      retakeCount: 0,
      activeSlotIndex: 1,
      isRetaking: false,
      countdownSeconds: PHOTO_STRIP_CONFIG.photoCountdownSeconds,
      selectedFilter: 'normal',
      currentStep: 'instructions',
    }),

  startCountdown: () => set({ isCountingDown: true }),

  stopCountdown: () => set({ isCountingDown: false }),

  addCapture: (blob: Blob, slotIndex?: number) => {
    const state = get();
    const dataUrl = URL.createObjectURL(blob);
    const targetSlot = slotIndex ?? state.activeSlotIndex;

    if (state.isRetaking) {
      const retakeNumber = state.retakeCount + 1;
      const letter = RETAKE_LETTERS[state.retakeCount] || `Take ${retakeNumber}`;
      const photoId = `retake-${letter}-${Date.now()}`;
      const newPoolItem: PoolPhotoItem = {
        id: photoId,
        blob,
        dataUrl,
        label: `Take ${letter}`,
        letter,
        createdAt: Date.now(),
        isRetake: true,
      };

      const newPool = [...state.photoPool, newPoolItem];
      const newAssignments = {
        ...state.slotAssignments,
        [targetSlot]: photoId,
      };

      const updatedCaptures = state.captures.map((c) => {
        if (c.captureIndex === targetSlot) {
          return {
            ...c,
            photoId,
            dataUrl,
            blob,
            retakeDataUrl: dataUrl,
            retakeBlob: blob,
            activeVersion: 'retake' as const,
            retakeOrder: retakeNumber,
          };
        }
        return c;
      });

      set({
        photoPool: newPool,
        slotAssignments: newAssignments,
        captures: updatedCaptures,
        retakeCount: retakeNumber,
        isRetaking: false,
        isCountingDown: false,
        currentStep: 'review',
      });
      return;
    }

    // Initial capture round
    const photoId = `shot-${targetSlot}-${Date.now()}`;
    const newPoolItem: PoolPhotoItem = {
      id: photoId,
      blob,
      dataUrl,
      label: `Frame ${targetSlot}`,
      createdAt: Date.now(),
      isRetake: false,
    };

    const newPool = [...state.photoPool, newPoolItem];
    const newAssignments = {
      ...state.slotAssignments,
      [targetSlot]: photoId,
    };

    const newCapture: PhotoCaptureItem = {
      captureIndex: targetSlot,
      dataUrl,
      blob,
      photoId,
      originalDataUrl: dataUrl,
      originalBlob: blob,
      activeVersion: 'original',
    };

    const existingIndex = state.captures.findIndex((c) => c.captureIndex === targetSlot);
    let updatedCaptures: PhotoCaptureItem[];
    if (existingIndex >= 0) {
      updatedCaptures = [...state.captures];
      updatedCaptures[existingIndex] = newCapture;
    } else {
      updatedCaptures = [...state.captures, newCapture];
    }

    const totalNeeded = state.selectedTemplate
      ? (state.selectedTemplate.requiredCaptureCount ??
         new Set(state.selectedTemplate.placements.map((p) => p.captureIndex)).size)
      : 3;

    if (targetSlot < totalNeeded) {
      set({
        photoPool: newPool,
        slotAssignments: newAssignments,
        captures: updatedCaptures,
        activeSlotIndex: targetSlot + 1,
        isCountingDown: false,
      });
    } else {
      set({
        photoPool: newPool,
        slotAssignments: newAssignments,
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

  assignPhotoToSlot: (slotIndex: number, photoId: string) => {
    const state = get();
    const poolItem = state.photoPool.find((p) => p.id === photoId);
    if (!poolItem) return;

    const newAssignments = {
      ...state.slotAssignments,
      [slotIndex]: photoId,
    };

    const updatedCaptures = state.captures.map((c) => {
      if (c.captureIndex === slotIndex) {
        return {
          ...c,
          photoId,
          dataUrl: poolItem.dataUrl,
          blob: poolItem.blob,
        };
      }
      return c;
    });

    set({
      slotAssignments: newAssignments,
      captures: updatedCaptures,
    });
  },

  toggleCaptureVersion: (captureIndex: number) => {
    set((state) => {
      const updatedCaptures = state.captures.map((c) => {
        if (c.captureIndex === captureIndex && c.retakeDataUrl && c.originalDataUrl) {
          const nextVersion: 'original' | 'retake' =
            c.activeVersion === 'original' ? 'retake' : 'original';
          return {
            ...c,
            activeVersion: nextVersion,
            dataUrl: nextVersion === 'retake' ? c.retakeDataUrl : c.originalDataUrl,
            blob: nextVersion === 'retake' ? c.retakeBlob! : c.originalBlob!,
          };
        }
        return c;
      });
      return { captures: updatedCaptures };
    });
  },

  setCaptureVersion: (captureIndex: number, version: 'original' | 'retake') => {
    set((state) => {
      const updatedCaptures = state.captures.map((c) => {
        if (c.captureIndex === captureIndex && c.retakeDataUrl && c.originalDataUrl) {
          return {
            ...c,
            activeVersion: version,
            dataUrl: version === 'retake' ? c.retakeDataUrl : c.originalDataUrl,
            blob: version === 'retake' ? c.retakeBlob! : c.originalBlob!,
          };
        }
        return c;
      });
      return { captures: updatedCaptures };
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
    captures.forEach((c) => {
      if (c.dataUrl) URL.revokeObjectURL(c.dataUrl);
      if (c.originalDataUrl && c.originalDataUrl !== c.dataUrl) {
        URL.revokeObjectURL(c.originalDataUrl);
      }
      if (c.retakeDataUrl && c.retakeDataUrl !== c.dataUrl) {
        URL.revokeObjectURL(c.retakeDataUrl);
      }
    });
    set(initialState);
  },
}));
