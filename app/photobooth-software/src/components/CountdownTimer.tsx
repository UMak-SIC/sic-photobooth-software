import React, { useEffect, useState, useRef } from 'react';

interface CountdownTimerProps {
  seconds: 3 | 5 | 10;
  active: boolean;
  onComplete: () => void;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ seconds, active, onComplete }) => {
  const [current, setCurrent] = useState<number>(seconds);
  const [flash, setFlash] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play short synthesized audio beep using standard Web Audio API
  const playBeep = (frequency = 880, duration = 0.1) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio context may be blocked by browser policy until gesture
    }
  };

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setCurrent(seconds);
      setFlash(false);
      hasTriggeredRef.current = false;
      return;
    }

    hasTriggeredRef.current = false;
    setCurrent(seconds);
    playBeep(880, 0.1);

    let remaining = seconds;
    let completionTimeout: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        setCurrent(0);
        if (!hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          playBeep(1760, 0.25); // high pitch on zero
          setFlash(true);
          completionTimeout = setTimeout(() => {
            onCompleteRef.current();
          }, 350);
        }
      } else {
        setCurrent(remaining);
        playBeep(880, 0.1);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (completionTimeout) {
        clearTimeout(completionTimeout);
      }
    };
  }, [active, seconds]);

  if (!active && !flash) return null;

  return (
    <>
      {/* Shutter flash overlay */}
      {flash && (
        <div
          className="fixed inset-0 bg-white z-50 pointer-events-none transition-opacity duration-300 opacity-100 animate-pulse"
          aria-hidden="true"
        />
      )}

      {/* Countdown display */}
      {active && current > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-40 bg-black/20 backdrop-blur-[2px]">
          <div className="relative flex items-center justify-center">
            {/* Pulsing ring */}
            <div className="absolute w-40 h-40 rounded-full border-4 border-emerald-400/40 animate-ping" />
            <div className="w-36 h-36 rounded-full bg-black/70 border-4 border-emerald-400 flex items-center justify-center shadow-2xl">
              <span className="text-7xl font-extrabold text-white font-mono tracking-tighter scale-110 transition-transform duration-200">
                {current}
              </span>
            </div>
          </div>
          <p className="mt-6 text-xl font-bold uppercase tracking-widest text-white drop-shadow-lg animate-bounce">
            Get Ready!
          </p>
        </div>
      )}
    </>
  );
};
