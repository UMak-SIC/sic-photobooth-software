import { create } from 'zustand';
import type { FrameItem } from '../services/api';

export type FlipbookStep =
  | 'welcome'
  | 'instructions'
  | 'cover_capture'
  | 'video_capture'
  | 'review_cover'
  | 'review_video'
  | 'processing'
  | 'frame_select'
  | 'complete';

interface FlipbookState {
  currentStep: FlipbookStep;
  sessionId: string | null;
  sessionToken: string | null;
  selectedFrame: FrameItem | null;

  // Captured assets (local object URLs for instant review)
  coverUrls: string[];
  coverBlobs: Blob[];
  videoUrls: string[];
  videoBlobs: Blob[];
  videoFrames: string[][]; // Extracted motion frame snapshots per video

  // Guest selections
  selectedCoverIndex: number; // 1..3 (default 1)
  selectedVideoIndex: number; // 1..3 (default 1)

  // Output details
  publicId: string | null;
  qrUrl: string | null;
  outputGifUrl: string | null;

  // Error & loading
  errorMessage: string | null;
  isProcessing: boolean;

  // Actions
  setSession: (sessionId: string, token: string) => void;
  setStep: (step: FlipbookStep) => void;
  setSelectedFrame: (frame: FrameItem) => void;
  confirmFrameSelection: () => void;
  addCoverCapture: (blob: Blob) => void;
  addVideoCapture: (blob: Blob, frames?: string[]) => void;
  setSelectedCoverIndex: (index: number) => void;
  setSelectedVideoIndex: (index: number) => void;
  setConfirmedOutput: (publicId: string, qrUrl: string, gifUrl?: string) => void;
  setError: (error: string | null) => void;
  setProcessing: (isProcessing: boolean) => void;
  resetFlipbook: () => void;
  resetToCoverCapture: () => void;
}

const initialState = {
  currentStep: 'welcome' as FlipbookStep,
  sessionId: null,
  sessionToken: null,
  selectedFrame: null,
  coverUrls: [],
  coverBlobs: [],
  videoUrls: [],
  videoBlobs: [],
  videoFrames: [],
  selectedCoverIndex: 1,
  selectedVideoIndex: 1,
  publicId: null,
  qrUrl: null,
  outputGifUrl: null,
  errorMessage: null,
  isProcessing: false,
};

export const useFlipbookStore = create<FlipbookState>((set) => ({
  ...initialState,

  setSession: (sessionId, token) => set({ sessionId, sessionToken: token }),

  setStep: (currentStep) => set({ currentStep, errorMessage: null }),

  setSelectedFrame: (selectedFrame) => set({ selectedFrame }),

  confirmFrameSelection: () => set({ currentStep: 'complete' }),

  addCoverCapture: (blob) =>
    set((state) => {
      const url = URL.createObjectURL(blob);
      return {
        coverBlobs: [...state.coverBlobs, blob],
        coverUrls: [...state.coverUrls, url],
      };
    }),

  addVideoCapture: (blob, frames) =>
    set((state) => {
      const url = URL.createObjectURL(blob);
      return {
        videoBlobs: [...state.videoBlobs, blob],
        videoUrls: [...state.videoUrls, url],
        videoFrames: [...state.videoFrames, frames || []],
      };
    }),

  setSelectedCoverIndex: (selectedCoverIndex) => set({ selectedCoverIndex }),

  setSelectedVideoIndex: (selectedVideoIndex) => set({ selectedVideoIndex }),

  setConfirmedOutput: (publicId, qrUrl, gifUrl) =>
    set({
      publicId,
      qrUrl,
      outputGifUrl: gifUrl || null,
      currentStep: 'frame_select',
      isProcessing: false,
    }),

  setError: (errorMessage) => set({ errorMessage }),

  setProcessing: (isProcessing) => set({ isProcessing }),

  resetFlipbook: () =>
    set((state) => {
      // Revoke all created object URLs
      state.coverUrls.forEach((u) => URL.revokeObjectURL(u));
      state.videoUrls.forEach((u) => URL.revokeObjectURL(u));
      return initialState;
    }),

  resetToCoverCapture: () =>
    set((state) => {
      state.coverUrls.forEach((u) => URL.revokeObjectURL(u));
      state.videoUrls.forEach((u) => URL.revokeObjectURL(u));
      return {
        coverUrls: [],
        coverBlobs: [],
        videoUrls: [],
        videoBlobs: [],
        selectedCoverIndex: 1,
        selectedVideoIndex: 1,
        currentStep: 'cover_capture',
        isProcessing: false,
        errorMessage: 'GIF processing took too long. Please recapture this flipbook.',
      };
    }),
}));
