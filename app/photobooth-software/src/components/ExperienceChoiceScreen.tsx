export interface ExperienceChoiceScreenProps {
  onSelectPhotoStrip: () => void;
  onSelectFlipbook: () => void;
  onBack: () => void;
  onChangeCamera?: () => void;
}

export function ExperienceChoiceScreen({
  onSelectPhotoStrip,
  onSelectFlipbook,
  onBack,
  onChangeCamera,
}: ExperienceChoiceScreenProps) {
  return (
    <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#f4f6f5] select-none font-['Nunito',sans-serif]">
      {/* Centered Kiosk Display Frame */}
      <div className="relative flex h-[800px] max-h-[800px] w-full max-w-[1180px] flex-col justify-between overflow-hidden px-6 py-4 sm:px-10 sm:py-5 text-[#1a202c]">
        {/* Top Header Row (Back button on left, Change Camera on right, logo & headings centered) */}
        <div className="relative mx-auto flex w-full max-w-5xl shrink-0 items-start justify-center">
          {/* Back to Event Selection Button */}
          <div className="absolute left-0 top-0 sm:top-1 z-10">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-base sm:text-lg font-bold text-[#2d3748] hover:text-[#276d4e] transition-colors cursor-pointer active:scale-95"
            >
              <svg
                className="size-5 sm:size-6 stroke-current stroke-[2.5]"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>
          </div>

          {/* Right: Change Camera Button */}
          {onChangeCamera && (
            <div className="absolute right-0 top-0 sm:top-1 z-10">
              <button
                type="button"
                onClick={onChangeCamera}
                className="inline-flex items-center gap-2 rounded-full border-1 border-[#1a202c]/20 bg-white/90  px-4 py-2 text-sm sm:text-base font-bold text-[#2d3748] hover:border-[#276d4e] hover:bg-white hover:text-[#276d4e] shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <svg
                  className="size-5 stroke-current stroke-[2.2]"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                  />
                </svg>
                <span>Change Camera</span>
              </button>
            </div>
          )}

          {/* Center: Brand & Heading */}
          <div className="flex w-full flex-col items-center text-center px-16 sm:px-20 mt-8 sm:mt-10">
            <img
              src="/assets/images/logo.svg"
              alt="University of Makati - SIC Logo"
              className="size-12 sm:size-14 md:size-16 object-contain drop-shadow-sm transition-transform hover:scale-105"
            />
            <p className="mt-1.5 text-sm sm:text-base font-semibold tracking-[0.14em] text-[#4a5568] uppercase">
              SIC PHOTOBOOTH
            </p>
            <h1 className="w-full text-2xl sm:text-3xl md:text-4xl lg:text-[2.65rem] font-bold tracking-tight text-[#1d1f26]">
              What are we creating today?
            </h1>
          </div>
        </div>

        {/* Main Content: Two Choice Cards */}
        <div className="mx-auto my-auto flex w-full max-w-5xl flex-1 items-center justify-center gap-8 sm:gap-12 md:gap-16 py-1">
          {/* Card 1: Photo Strip */}
          <button
            type="button"
            onClick={onSelectPhotoStrip}
            className="group relative flex h-[390px] sm:h-[420px] md:h-[445px] w-[330px] sm:w-[360px] md:w-[390px] flex-col items-center justify-between overflow-hidden rounded-[28px] border-[5px] border-white p-4 sm:p-5 pt-5 sm:pt-6 pb-5 sm:pb-6 text-center shadow-[0_12px_36px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_45px_rgba(0,0,0,0.25)] active:scale-[0.98] cursor-pointer outline-none"
            style={{
              background: 'linear-gradient(180deg, #7bc6a5 0%, #3ea079 100%)',
            }}
          >
            {/* Photostrip Sample Graphic */}
            <div className="relative z-10 flex flex-1 w-full items-center justify-center overflow-hidden">
              <img
                src="/assets/images/photostrip-photo.svg"
                alt="Photo Strip"
                className="max-h-[265px] sm:max-h-[290px] md:max-h-[310px] w-auto mt-[-40px] drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
              />
            </div>

            {/* Retro Pixel Typography */}
            <div
              className="relative z-10 mt-auto flex flex-col items-center justify-center gap-1 select-none"
              style={{ fontFamily: "'Arcade Gamer', 'PressStart2P', monospace" }}
            >
              <p className="text-[11px] sm:text-xs tracking-widest text-[#a8f3dd] uppercase">
                I WANT
              </p>
              <h2 className="text-base sm:text-lg md:text-xl font-normal tracking-wide text-white uppercase whitespace-nowrap drop-shadow-md">
                PHOTO STRIP
              </h2>
            </div>
          </button>

          {/* Card 2: Flipbook */}
          <button
            type="button"
            onClick={onSelectFlipbook}
            className="group relative flex h-[390px] sm:h-[420px] md:h-[445px] w-[330px] sm:w-[360px] md:w-[390px] flex-col items-center justify-between overflow-hidden rounded-[28px] border-[5px] border-white p-4 sm:p-5 pt-5 sm:pt-6 pb-5 sm:pb-6 text-center shadow-[0_12px_36px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_45px_rgba(0,0,0,0.25)] active:scale-[0.98] cursor-pointer outline-none"
            style={{
              background: 'linear-gradient(180deg, #ffa3bb 0%, #a5517e 100%)',
            }}
          >
            {/* Flipbook Sample Graphic */}
            <div className="relative z-10 flex flex-1 w-full items-center justify-center overflow-hidden">
              <img
                src="/assets/images/flipbook-photo.svg"
                alt="Flipbook"
                className="max-h-[285px] sm:max-h-[310px] md:max-h-[330px] w-auto mt-[-20px] drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
              />
            </div>

            {/* Retro Pixel Typography */}
            <div
              className="relative z-10 mt-auto flex flex-col items-center justify-center gap-1 select-none"
              style={{ fontFamily: "'Arcade Gamer', 'PressStart2P', monospace" }}
            >
              <p className="text-[11px] sm:text-xs tracking-widest text-[#fde2ee] uppercase">
                I WANT
              </p>
              <h2 className="text-base sm:text-lg md:text-xl font-normal tracking-wide text-white uppercase whitespace-nowrap drop-shadow-md">
                FLIPBOOK
              </h2>
            </div>
          </button>
        </div>

        {/* Bottom spacing row to balance top header */}
        <div className="h-4 w-full shrink-0" />
      </div>
    </div>
  );
}

