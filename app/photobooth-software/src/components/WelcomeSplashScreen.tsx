import { useState } from 'react';

export interface WelcomeSplashScreenProps {
  onStart?: () => void;
}

export function WelcomeSplashScreen({ onStart }: WelcomeSplashScreenProps) {
  const [isSlidingUp, setIsSlidingUp] = useState(false);

  const handleTouchScreen = () => {
    if (isSlidingUp) return;
    setIsSlidingUp(true);
    setTimeout(() => {
      if (onStart) onStart();
    }, 550);
  };

  return (
    <div
      onClick={handleTouchScreen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleTouchScreen();
      }}
      tabIndex={0}
      role="button"
      aria-label="Welcome screen. Touch the screen to begin"
      className={`fixed inset-0 z-50 flex h-[100dvh] w-full flex-col justify-between overflow-hidden bg-[#8ac6ff] select-none cursor-pointer outline-none font-['Nunito',sans-serif] transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-2xl ${
        isSlidingUp ? '-translate-y-full pointer-events-none' : 'translate-y-0'
      }`}
    >
      {/* Top & Middle Landscape Area */}
      <div className="relative flex-1 w-full flex flex-col items-center pt-4 sm:pt-6 md:pt-8 pb-0 overflow-hidden">
        {/* Looping Background Video */}
        <video
          src="/assets/videos/BG_Video.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 size-full object-cover pointer-events-none"
        />

        {/* SIC / University of Makati Seal Logo */}
        <div className="relative z-10 flex justify-center">
          <img
            src="/assets/images/logo.svg"
            alt="University of Makati - Society of Innovative Computing"
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* Center Graphic Headline: sic-here-to-make-memories.svg */}
        <div className="relative z-10 w-full px-4 max-w-xl sm:max-w-3xl md:max-w-4xl lg:max-w-4xl xl:max-w-5xl">
          <img
            src="/assets/images/sic-here-to-make-memories.svg"
            alt="Here To Make Memories!"
            className="w-full h-auto max-h-[140px] sm:max-h-[170px] md:max-h-[200px] lg:max-h-[230px] object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.15)] select-none pointer-events-none"
          />
        </div>

        {/* Left Robot Mascot with Megaphone (Clipped to very left edge) */}
        <div className="absolute -left-2 sm:-left-4 md:-left-6 lg:-left-8 bottom-[-40px] z-10 w-[46%] sm:w-[46%] md:w-[44%] lg:w-[42%] max-w-[520px] sm:max-w-[580px] md:max-w-[660px] lg:max-w-[740px] pointer-events-none translate-y-6 sm:translate-y-8 md:translate-y-12">
          <img
            src="/assets/images/left-bot.svg"
            alt="SIC Robot Mascot with Megaphone"
            className="w-full h-auto object-contain object-left-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.25)]"
          />
        </div>

        {/* Right Robot Mascot with Lightbulb (Clipped to very right edge) */}
        <div className="absolute -right-2 sm:-right-4 md:-right-6 lg:-right-8 bottom-0 z-10 w-[45%] sm:w-[40%] md:w-[37%] lg:w-[35%] max-w-[420px] sm:max-w-[480px] md:max-w-[560px] lg:max-w-[640px] pointer-events-none flex justify-end translate-y-6 sm:translate-y-8 md:translate-y-12">
          <img
            src="/assets/images/right-bot.svg"
            alt="SIC Robot Mascot with Lightbulb"
            className="w-full h-auto object-contain object-right-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.25)]"
          />
        </div>
      </div>

      {/* Bottom Section: Solid White Div Overlapping the Background and Mascots */}
      <div className="relative z-20 w-full bg-white py-6 sm:py-7 md:py-9 px-7 flex flex-col items-center justify-center text-center shadow-[0_-12px_30px_rgba(0,0,0,0.06)]">
        <p className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-bold tracking-tight uppercase text-[#276d4e]">
          SIC PHOTOBOOTH
        </p>
        <div className="mt-1.5 sm:mt-2.5 flex items-center justify-center gap-2.5 sm:gap-3 text-lg sm:text-xl md:text-2xl lg:text-[26px] font-normal tracking-normal text-[#276d4e]">
          <span>Touch the screen</span>
          <img
            src="/assets/images/touch-screen-icon.svg"
            alt="Touch icon"
            className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 object-contain animate-bounce"
          />
        </div>
      </div>
    </div>
  );
}

