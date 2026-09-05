import { useState, useEffect } from 'react';

interface LoopingMotionPreviewProps {
  frames?: string[];
  motionGifUrl?: string | null;
  fallbackUrl?: string;
  className?: string;
}

export function LoopingMotionPreview({
  frames,
  motionGifUrl,
  fallbackUrl,
  className = 'size-full object-cover',
}: LoopingMotionPreviewProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [gifLoaded, setGifLoaded] = useState(false);

  // Cycle through the 20 motion frames at 250ms interval (4 fps)
  useEffect(() => {
    if (!frames || frames.length === 0) return;

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, 250);

    return () => clearInterval(interval);
  }, [frames]);

  // Priority 1: Rendered motion-only GIF (0s cover hold, 20 motion frames)
  if (motionGifUrl) {
    return (
      <img
        src={motionGifUrl}
        alt="20 Looping Motion Frames GIF"
        onLoad={() => setGifLoaded(true)}
        className={`${className} transition-opacity duration-200 ${gifLoaded ? 'opacity-100' : 'opacity-90'}`}
      />
    );
  }

  // Priority 2: 20-frame memory snapshot loop (Frame 01 to 20 at 250ms)
  if (frames && frames.length > 0) {
    return (
      <img
        src={frames[frameIndex]}
        alt={`Motion Frame ${frameIndex + 1} of 20`}
        className={className}
      />
    );
  }

  // Priority 3: Fallback image
  if (fallbackUrl) {
    return <img src={fallbackUrl} alt="Motion Placeholder" className={className} />;
  }

  return (
    <div className="size-full flex items-center justify-center text-[10px] font-bold text-[#145a49]">
      20 MOTION FRAMES
    </div>
  );
}
