export interface PhotoStripUiConfig {
  /** Time in seconds to choose a template before auto-confirming */
  templateSelectionSeconds: number;
  /** Time in seconds on the instruction screen before opening the camera */
  instructionsCountdownSeconds: number;
  /** Time in seconds before each photo is taken */
  photoCountdownSeconds: number;
  /** Time in seconds to review photos before auto-confirming */
  reviewCountdownSeconds: number;
}

export const PHOTO_STRIP_CONFIG: PhotoStripUiConfig = {
  templateSelectionSeconds: 30,
  instructionsCountdownSeconds: 8,
  photoCountdownSeconds: 7,
  reviewCountdownSeconds: 30,
};
