import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseCountdownOptions {
  seconds: number;
  autoStart?: boolean;
  onExpire?: () => void;
}

export function useCountdown({ seconds, autoStart = true, onExpire }: UseCountdownOptions) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const hasExpiredRef = useRef(false);

  const reset = useCallback(
    (newSeconds?: number) => {
      hasExpiredRef.current = false;
      setTimeLeft(newSeconds ?? seconds);
      setIsRunning(true);
    },
    [seconds],
  );

  const pause = useCallback(() => setIsRunning(false), []);
  const resume = useCallback(() => {
    if (timeLeft > 0) {
      setIsRunning(true);
    }
  }, [timeLeft]);

  useEffect(() => {
    if (!isRunning) return;

    if (timeLeft <= 0) {
      setIsRunning(false);
      if (!hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpireRef.current?.();
      }
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  // Formatted string MM:SS or SS
  const minutes = Math.floor(timeLeft / 60);
  const remainingSeconds = timeLeft % 60;
  const formattedMMSS = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  const formattedSS = String(timeLeft).padStart(2, '0');

  return {
    timeLeft,
    isRunning,
    formattedMMSS,
    formattedSS,
    reset,
    pause,
    resume,
  };
}
