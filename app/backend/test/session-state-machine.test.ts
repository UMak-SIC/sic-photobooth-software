import { describe, it, expect } from 'vitest';
import { SessionStateMachine, MAX_RETAKES_ALLOWED } from '../src/services/session-state-machine.js';

describe('SessionStateMachine', () => {
  const machine = new SessionStateMachine();

  it('generates a 64-character hex session token', () => {
    const token = machine.generateSessionToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('Photo Strip state flow', () => {
    it('allows legal sequential transitions', () => {
      expect(machine.isValidTransition('photo_strip', 'created', 'template_selected')).toBe(true);
      expect(machine.isValidTransition('photo_strip', 'template_selected', 'capturing')).toBe(true);
      expect(machine.isValidTransition('photo_strip', 'capturing', 'review')).toBe(true);
      expect(machine.isValidTransition('photo_strip', 'review', 'capturing')).toBe(true); // retake
      expect(machine.isValidTransition('photo_strip', 'review', 'booth_confirmed')).toBe(true);
      expect(machine.isValidTransition('photo_strip', 'booth_confirmed', 'printed')).toBe(true);
    });

    it('rejects illegal state skipping', () => {
      expect(machine.isValidTransition('photo_strip', 'created', 'booth_confirmed')).toBe(false);
      expect(machine.isValidTransition('photo_strip', 'template_selected', 'review')).toBe(false);
      expect(machine.isValidTransition('photo_strip', 'booth_confirmed', 'capturing')).toBe(false);
    });

    it('assertValidTransition throws on invalid transition', () => {
      expect(() => machine.assertValidTransition('photo_strip', 'created', 'printed')).toThrowError(
        /Invalid workflow transition/,
      );
    });

    it('enforces 4-retake maximum and rejects 5th retake', () => {
      expect(machine.canRetake('photo_strip', 0)).toBe(true);
      expect(machine.canRetake('photo_strip', 3)).toBe(true);
      expect(machine.canRetake('photo_strip', MAX_RETAKES_ALLOWED)).toBe(false);
      expect(machine.canRetake('photo_strip', 5)).toBe(false);

      expect(() => machine.assertCanRetake('photo_strip', 4)).toThrowError(
        /Maximum retake limit reached/,
      );
    });
  });

  describe('Flipbook state flow', () => {
    it('allows legal sequential transitions', () => {
      expect(machine.isValidTransition('flipbook', 'created', 'frame_selected')).toBe(true);
      expect(machine.isValidTransition('flipbook', 'frame_selected', 'instructions')).toBe(true);
      expect(machine.isValidTransition('flipbook', 'instructions', 'cover_capture')).toBe(true);
      expect(machine.isValidTransition('flipbook', 'cover_capture', 'video_capture')).toBe(true);
      expect(machine.isValidTransition('flipbook', 'video_capture', 'review')).toBe(true);
      expect(machine.isValidTransition('flipbook', 'review', 'processing')).toBe(true);
      expect(machine.isValidTransition('flipbook', 'processing', 'booth_confirmed')).toBe(true);
      // Timeout recovery transition back to cover_capture
      expect(machine.isValidTransition('flipbook', 'processing', 'cover_capture')).toBe(true);
    });

    it('rejects retakes for flipbook sessions', () => {
      expect(machine.canRetake('flipbook', 0)).toBe(false);
    });
  });

  describe('Cancellation', () => {
    it('allows cancellation from active states', () => {
      expect(machine.isValidTransition('photo_strip', 'created', 'cancelled')).toBe(true);
      expect(machine.isValidTransition('flipbook', 'cover_capture', 'cancelled')).toBe(true);
    });

    it('rejects transitions from cancelled state', () => {
      expect(machine.isValidTransition('photo_strip', 'cancelled', 'created')).toBe(false);
      expect(() =>
        machine.assertValidTransition('photo_strip', 'cancelled', 'template_selected'),
      ).toThrowError(/session has been cancelled/);
    });
  });
});
