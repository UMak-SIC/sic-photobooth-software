export interface FlipbookUiConfig {
  /** Target duration for video clip recordings in seconds */
  videoRecordingDurationSeconds: number;
  /** Countdown time in seconds before taking each cover photo */
  coverPoseCountdownSeconds: number;
  /** Countdown time in seconds before recording each video clip */
  videoPoseCountdownSeconds: number;
  /** Whether to show the comparison variant switcher tabs on the completion screen */
  enableComparisonVariants: boolean;
}

export const FLIPBOOK_CONFIG: FlipbookUiConfig = {
  // =========================================================================
  // ACTIVE SETTINGS: Instance A (5.0s Video Recording, 10s Countdowns)
  // =========================================================================
  videoRecordingDurationSeconds: 5.0,
  coverPoseCountdownSeconds: 10,
  videoPoseCountdownSeconds: 10,
  enableComparisonVariants: false,

  // =========================================================================
  // PRD DEFAULT SPECIFICATION (Preserved for easy reference & rollback):
  // =========================================================================
  // videoRecordingDurationSeconds: 6.0,
  // coverPoseCountdownSeconds: 10,
  // videoPoseCountdownSeconds: 10,
  // enableComparisonVariants: false,
};
