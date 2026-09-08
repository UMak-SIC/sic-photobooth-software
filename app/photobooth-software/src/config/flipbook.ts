export interface FlipbookUiConfig {
  /** Target duration for video clip recordings in seconds */
  videoRecordingDurationSeconds: number;
  /** Countdown time in seconds before taking each cover photo */
  coverPoseCountdownSeconds: number;
  /** Countdown time in seconds before recording each video clip */
  videoPoseCountdownSeconds: number;
  /** Whether to show the comparison variant switcher tabs on the completion screen */
  enableComparisonVariants: boolean;
  /** Physical booklet page frame width in inches */
  frameWidthInches: number;
  /** Physical booklet page frame height in inches */
  frameHeightInches: number;
  /** Photo slot width in inches */
  slotWidthInches: number;
  /** Photo slot height in inches */
  slotHeightInches: number;
}

export const FLIPBOOK_CONFIG: FlipbookUiConfig = {
  videoRecordingDurationSeconds: 5.0,
  coverPoseCountdownSeconds: 10,
  videoPoseCountdownSeconds: 10,
  enableComparisonVariants: false,
  frameWidthInches: 4.0,
  frameHeightInches: 1.5,
  slotWidthInches: 2.41,
  slotHeightInches: 1.32,
};

export const FLIPBOOK_LAYOUT = {
  frameAspectRatio: '8/3', // 4.0" / 1.5"
  slotAspectRatio: '241/132', // 2.41" / 1.32"
  captureAspectRatio: '241/132', // 2.41" / 1.32" camera capture
  motionCanvasBgColor: '#c2ffe1',
};
