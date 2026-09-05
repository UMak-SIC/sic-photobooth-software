import { randomBytes } from 'node:crypto';
import type { SessionType } from '@photobooth/public-output';

export type PhotoStripState =
  | 'created'
  | 'template_selected'
  | 'capturing'
  | 'review'
  | 'booth_confirmed'
  | 'printed'
  | 'cancelled';

export type FlipbookState =
  | 'created'
  | 'frame_selected'
  | 'instructions'
  | 'cover_capture'
  | 'video_capture'
  | 'review'
  | 'processing'
  | 'booth_confirmed'
  | 'cancelled';

export type SessionState = PhotoStripState | FlipbookState;

export const MAX_RETAKES_ALLOWED = 4;

const PHOTO_STRIP_VALID_TRANSITIONS: Record<PhotoStripState, PhotoStripState[]> = {
  created: ['template_selected', 'cancelled'],
  template_selected: ['capturing', 'template_selected', 'cancelled'],
  capturing: ['review', 'capturing', 'cancelled'],
  review: ['capturing', 'booth_confirmed', 'cancelled'], // capturing on retake
  booth_confirmed: ['printed'],
  printed: ['printed'],
  cancelled: [],
};

const FLIPBOOK_VALID_TRANSITIONS: Record<FlipbookState, FlipbookState[]> = {
  created: ['frame_selected', 'instructions', 'cancelled'],
  frame_selected: ['instructions', 'frame_selected', 'cancelled'],
  instructions: ['cover_capture', 'cancelled'],
  cover_capture: ['video_capture', 'cancelled'],
  video_capture: ['review', 'cancelled'],
  review: ['processing', 'cancelled'],
  processing: ['booth_confirmed', 'cover_capture', 'cancelled'], // cover_capture on 2-min timeout recovery
  booth_confirmed: [],
  cancelled: [],
};

export interface SessionData {
  id: string;
  token: string;
  eventId: string;
  type: SessionType;
  state: SessionState;
  templateId?: string | null;
  frameId?: string | null;
  templateSnapshot?: Record<string, unknown> | null;
  retakeCount: number;
  isPrinted: boolean;
  copiesPrinted: number;
  createdAt: Date;
  lastActivityAt: Date;
  cancelledAt?: Date | null;
}

export class SessionStateMachine {
  /**
   * Generates a 64-character cryptographically secure hex session authorization token.
   */
  public generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Checks whether a requested state transition is valid.
   */
  public isValidTransition(
    type: SessionType,
    currentState: SessionState,
    nextState: SessionState,
  ): boolean {
    if (currentState === 'cancelled') {
      return false;
    }

    if (type === 'photo_strip') {
      const allowed = PHOTO_STRIP_VALID_TRANSITIONS[currentState as PhotoStripState];
      return allowed ? allowed.includes(nextState as PhotoStripState) : false;
    }

    if (type === 'flipbook') {
      const allowed = FLIPBOOK_VALID_TRANSITIONS[currentState as FlipbookState];
      return allowed ? allowed.includes(nextState as FlipbookState) : false;
    }

    return false;
  }

  /**
   * Asserts that a state transition is legal, throwing a clear contract error if not.
   */
  public assertValidTransition(
    type: SessionType,
    currentState: SessionState,
    nextState: SessionState,
  ): void {
    if (currentState === 'cancelled') {
      throw new Error('This session has been cancelled. No further actions are permitted.');
    }

    if (!this.isValidTransition(type, currentState, nextState)) {
      throw new Error(
        `Invalid workflow transition from "${currentState}" to "${nextState}" for session type "${type}". This step is not available yet. Continue the current workflow.`,
      );
    }
  }

  /**
   * Checks if an additional retake is permitted for a Photo Strip session.
   */
  public canRetake(type: SessionType, currentRetakeCount: number): boolean {
    if (type !== 'photo_strip') {
      return false;
    }
    return currentRetakeCount < MAX_RETAKES_ALLOWED;
  }

  /**
   * Asserts that retake limit has not been exceeded.
   */
  public assertCanRetake(type: SessionType, currentRetakeCount: number): void {
    if (!this.canRetake(type, currentRetakeCount)) {
      throw new Error(
        `Maximum retake limit reached (${MAX_RETAKES_ALLOWED} retakes allowed). Please proceed to confirm your photos.`,
      );
    }
  }

  /**
   * Asserts that all requirements for Flipbook processing are met.
   */
  public assertFlipbookReadyForProcessing(
    coversCount: number,
    videosCount: number,
    selectedCoverIndex: number | null,
    selectedVideoIndex: number | null,
  ): void {
    if (coversCount < 3) {
      throw new Error(`Flipbook requires exactly 3 cover photos (received ${coversCount}).`);
    }
    if (videosCount < 3) {
      throw new Error(`Flipbook requires exactly 3 video clips (received ${videosCount}).`);
    }
    if (selectedCoverIndex === null || selectedCoverIndex < 1 || selectedCoverIndex > 3) {
      throw new Error('A valid cover photo selection (1..3) is required.');
    }
    if (selectedVideoIndex === null || selectedVideoIndex < 1 || selectedVideoIndex > 3) {
      throw new Error('A valid video clip selection (1..3) is required.');
    }
  }
}

export const sessionStateMachine = new SessionStateMachine();
