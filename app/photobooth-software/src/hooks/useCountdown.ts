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

  const isExpiringRef = useRef(false);

  const reset = useCallback(
    (newSeconds?: number) => {
      isExpiringRef.current = false;
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

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsRunning(false);
          if (!isExpiringRef.current) {
            isExpiringRef.current = true;
            setTimeout(() => {
              onExpireRef.current?.();
            }, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

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
