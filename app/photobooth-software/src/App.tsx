import { useState } from 'react';
import { AdminEventsPage } from './pages/AdminEventsPage';
import { AdminRouter } from './admin/admin-router';

type Category = 'all' | 'guest' | 'admin';

type Screen = {
  title: string;
  route: string;
  category: Exclude<Category, 'all'>;
  stage: string;
};

const screens: Screen[] = [
  { title: 'Choose experience', route: '/', category: 'guest', stage: 'START' },
  { title: 'Event selection', route: '/events', category: 'guest', stage: 'SETUP' },
  {
    title: 'Photo strip templates',
    route: '/photo-strips/templates',
    category: 'guest',
    stage: 'PHOTO STRIP',
  },
  {
    title: 'Photo capture',
    route: '/photo-strips/capture',
    category: 'guest',
    stage: 'PHOTO STRIP',
  },
  { title: 'Photo review', route: '/photo-strips/review', category: 'guest', stage: 'PHOTO STRIP' },
  { title: 'Complete and print', route: '/complete', category: 'guest', stage: 'COMPLETE' },
  { title: 'Flipbook frames', route: '/flipbook/frames', category: 'guest', stage: 'FLIPBOOK' },
  {
    title: 'Flipbook instructions',
    route: '/flipbook/instructions',
    category: 'guest',
    stage: 'FLIPBOOK',
  },
  { title: 'Cover capture', route: '/flipbook/covers', category: 'guest', stage: 'FLIPBOOK' },
  { title: 'Video recording', route: '/flipbook/videos', category: 'guest', stage: 'FLIPBOOK' },
  {
    title: 'Flipbook review · Cover Photo',
    route: '/flipbook/review',
    category: 'guest',
    stage: 'FLIPBOOK',
  },
  {
    title: 'Flipbook review · Video Clips',
    route: '/flipbook/review/video',
    category: 'guest',
    stage: 'FLIPBOOK',
  },
  { title: 'GIF processing', route: '/flipbook/processing', category: 'guest', stage: 'FLIPBOOK' },
  { title: 'Event management', route: '/admin/events', category: 'admin', stage: 'ADMIN' },
  { title: 'Template library', route: '/admin/templates', category: 'admin', stage: 'ADMIN' },
  { title: 'Template editor', route: '/admin/templates/:id', category: 'admin', stage: 'ADMIN' },
  { title: 'Frame management', route: '/admin/frames', category: 'admin', stage: 'ADMIN' },
  { title: 'Publication queue', route: '/admin/publications', category: 'admin', stage: 'ADMIN' },
];

import { WelcomeExperienceScreen } from './components/WelcomeScreen';
import { FlipbookWorkflow } from './components/flipbook/FlipbookWorkflow';
import { PhotoStripWorkflow } from './components/photostrip/PhotoStripWorkflow';
import { useFlipbookStore } from './store/flipbook-store';
import { useSessionStore } from './store/session-store';

function App() {
  const [mode, setMode] = useState<'live' | 'sheet'>('live');
  const [category, setCategory] = useState<Category>('all');
  const { currentStep } = useFlipbookStore();
  const { activeSession } = useSessionStore();
  if (window.location.pathname.startsWith('/admin/')) {
    return <AdminRouter />;
  }

  const visible =
    category === 'all' ? screens : screens.filter((screen) => screen.category === category);

  return (
    <main className="min-h-[100dvh] bg-[#071d1a] text-[#e8fff5]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#071d1a]/95 px-5 py-4 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <BrandMark />
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-[#76d2bb]">
                SIC PHOTOBOOTH
              </p>
              <h1 className="text-lg font-bold tracking-tight text-white md:text-xl">
                {mode === 'live' ? 'Assisted Booth Terminal' : 'Interface design sheet'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('live')}
                className={`rounded-full px-4 py-2 transition ${
                  mode === 'live'
                    ? 'bg-[#48c4a1] text-[#062019]'
                    : 'text-[#b3d9ce] hover:text-white'
                }`}
              >
                Interactive Booth
              </button>
              <button
                type="button"
                onClick={() => setMode('sheet')}
                className={`rounded-full px-4 py-2 transition ${
                  mode === 'sheet'
                    ? 'bg-[#48c4a1] text-[#062019]'
                    : 'text-[#b3d9ce] hover:text-white'
                }`}
              >
                Design Sheet
              </button>
            </div>

            {mode === 'sheet' && (
              <nav
                aria-label="Design sheet filters"
                className="flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold"
              >
                {(['all', 'guest', 'admin'] as Category[]).map((item) => (
                  <button
                    className={`rounded-full px-3 py-2 capitalize transition active:scale-[0.98] ${category === item ? 'bg-[#48c4a1] text-[#062019]' : 'text-[#b3d9ce] hover:text-white'}`}
                    key={item}
                    onClick={() => setCategory(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>
      </header>

      {mode === 'live' ? (
        <section className="flex min-h-[calc(100vh-77px)] w-full flex-col items-stretch">
          <div className="flex flex-1 w-full overflow-hidden bg-[#0a2924]">
            {activeSession?.type === 'photo_strip' ? (
              <PhotoStripWorkflow />
            ) : currentStep === 'welcome' && !activeSession ? (
              <WelcomeExperienceScreen />
            ) : (
              <FlipbookWorkflow />
            )}
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-[1720px] px-5 pb-16 pt-10 md:px-10">
          <div className="mb-10 grid gap-5 border-b border-white/10 pb-8 md:grid-cols-[1.45fr_1fr] md:items-end">
            <div>
              <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-[#76d2bb]">
                SOCIETY OF INNOVATIVE COMPUTING
              </p>
              <h2 className="max-w-3xl text-4xl font-black tracking-[-0.05em] text-white md:text-6xl">
                An assisted booth that feels ready for the moment.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-[#b3d9ce]">
              A full visual inventory for the local booth. Guest screens are large, calm, and
              camera-first. Operator screens are dense enough to run an event without becoming a
              dashboard maze.
            </p>
          </div>

          <div className="mb-6 flex items-center justify-between text-xs font-semibold tracking-wide text-[#86b9ab]">
            <span>{visible.length} SCREENS</span>
            <span>1920 x 1080 DESKTOP ARTBOARDS</span>
          </div>
          <div className="grid gap-8 xl:grid-cols-2 2xl:grid-cols-3">
            {visible.map((screen, index) => (
              <SheetCard index={index + 1} key={screen.route} screen={screen} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function BrandMark() {
  return (
    <div
      aria-label="Society of Innovative Computing"
      className="grid size-11 place-items-center rounded-full border-2 border-[#9ef0dc] bg-[#0e473d] text-xs font-black text-[#e8fff5] shadow-[inset_0_0_0_3px_#0e473d,inset_0_0_0_4px_#9ef0dc]"
    >
      SIC
    </div>
  );
}

function SheetCard({ screen, index }: { screen: Screen; index: number }) {
  return (
    <article className="group">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a2924] shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
        <div className="sheet-viewport">
          <BoothScreen screen={screen} />
        </div>
      </div>
      <div className="flex items-center justify-between px-1 pt-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#72cdb5]">{screen.stage}</p>
          <h3 className="mt-0.5 text-sm font-semibold text-white">
            {String(index).padStart(2, '0')}. {screen.title}
          </h3>
        </div>
        <code className="text-[10px] text-[#9dc7bb]">{screen.route}</code>
      </div>
    </article>
  );
}

function BoothScreen({ screen }: { screen: Screen }) {
  const { title, route } = screen;
  const admin = screen.category === 'admin';
  if (admin) return <AdminScreen name={title} />;
  if (title === 'Choose experience') return <WelcomeScreen />;
  if (title === 'Event selection') return <EventSelect />;
  if (title === 'Photo strip templates') return <TemplateSelect />;
  if (title === 'Photo capture') return <PhotoCapture />;
  if (title === 'Photo review') return <PhotoReview />;
  if (title === 'Complete and print') return <Completion />;
  if (title === 'Flipbook frames') return <FrameSelect />;
  if (title === 'Flipbook instructions') return <Instructions />;
  if (title === 'Cover capture') return <CoverCapture />;
  if (title === 'Video recording') return <VideoRecording />;
  if (route === '/flipbook/review') return <FlipReviewCover />;
  if (route === '/flipbook/review/video') return <FlipReviewVideo />;
  return <Processing />;
}

function BoothShell({
  children,
  step: _step,
  label: _label = 'SIC PHOTOBOOTH',
}: {
  children: React.ReactNode;
  step?: string;
  label?: string;
}) {
  return (
    <div className="artboard relative overflow-hidden bg-[#ecfff8] text-[#113b33]">{children}</div>
  );
}

const Button = ({
  children,
  secondary = false,
}: {
  children: React.ReactNode;
  secondary?: boolean;
}) => (
  <button
    type="button"
    className={`rounded-xl px-6 py-3 text-[14px] font-bold transition active:scale-[0.98] ${secondary ? 'border border-[#92c9b9] bg-white text-[#155847]' : 'bg-[#146a56] text-white shadow-[0_8px_18px_rgba(20,106,86,0.22)]'}`}
  >
    {children}
  </button>
);

function WelcomeScreen() {
  return (
    <BoothShell>
      <div className="flex h-[780px] flex-col items-center justify-center gap-12 px-16">
        <h4 className="text-center text-[53px] font-black leading-[0.92] tracking-[-0.06em]">
          What are we creating today?
        </h4>
        <div className="flex gap-5">
          <Choice title="PHOTO STRIPS" image="strip" />
          <Choice title="FLIPBOOK" image="flip" />
        </div>
      </div>
    </BoothShell>
  );
}

function Choice({ title, image }: { title: string; image: string }) {
  return (
    <button
      type="button"
      className="group flex flex-col items-center gap-5 overflow-hidden rounded-2xl bg-[#176754] px-12 py-10 transition hover:-translate-y-1 active:scale-[0.99]"
    >
      <div className={`visual-${image} size-36 rounded-xl`} />
      <h5 className="text-[22px] font-black tracking-[-0.04em] text-white">{title}</h5>
    </button>
  );
}

function EventSelect() {
  return (
    <BoothShell>
      <div className="flex h-[780px] items-center justify-center">
        <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[1fr_300px] gap-14 px-14">
          <div>
            <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">EVENT DETAILS</p>
            <h4 className="mt-3 text-[44px] font-black tracking-[-0.06em]">Select the event.</h4>
            <div className="mt-9 grid gap-3">
              <EventRow title="SIC General Assembly" date="May 24, 2026" selected />
              <EventRow title="College Week 2026" date="June 18, 2026" />
              <button
                type="button"
                className="mt-2 w-fit text-[14px] font-bold text-[#146a56] underline underline-offset-4"
              >
                Create a new event
              </button>
            </div>
          </div>
          <aside className="rounded-2xl bg-[#d9f7ed] p-7">
            <p className="text-[12px] font-bold tracking-wide text-[#28715f]">ACTIVE OPERATOR</p>
            <p className="mt-3 text-[21px] font-black">Mika Santos</p>
            <p className="mt-10 text-[13px] leading-5 text-[#4d756b]">
              Event selection keeps every output, print record, and public QR connected to the right
              day.
            </p>
            <div className="mt-8">
              <Button>Continue</Button>
            </div>
          </aside>
        </div>
      </div>
    </BoothShell>
  );
}

function EventRow({
  title,
  date,
  selected = false,
}: {
  title: string;
  date: string;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between rounded-xl border p-5 text-left ${selected ? 'border-[#1a7e67] bg-[#e7fff7] ring-2 ring-[#79d6bf]/50' : 'border-[#c0e2d8] bg-white'}`}
    >
      <span>
        <strong className="block text-[17px]">{title}</strong>
        <small className="mt-1 block text-[13px] text-[#5b8176]">{date}</small>
      </span>
      <span
        className={`grid size-6 place-items-center rounded-full border ${selected ? 'border-[#176a56] bg-[#176a56] text-white' : 'border-[#a7cfc3]'}`}
      >
        {selected ? '✓' : ''}
      </span>
    </button>
  );
}

function TemplateSelect() {
  return (
    <BoothShell>
      <div className="flex h-[780px] flex-col items-center justify-center px-14 py-12 text-center">
        <div className="flex w-full max-w-[1000px] items-end justify-between text-left">
          <div>
            <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">PHOTO STRIPS</p>
            <h4 className="mt-2 text-[43px] font-black tracking-[-0.06em]">Pick your layout.</h4>
          </div>
          <p className="max-w-[300px] text-[14px] leading-6 text-[#5b8176]">
            Your selected template stays fixed for this session.
          </p>
        </div>
        <div className="mt-10 grid w-full max-w-[1000px] grid-cols-3 gap-6 text-left">
          <TemplateCard title="Pioneers" layout="3 photos · Portrait" selected />
          <TemplateCard title="The Circuit" layout="4 photos · Landscape" />
          <TemplateCard title="Seafoam" layout="2 photos · Portrait" />
        </div>
        <div className="mt-11">
          <Button>Use Pioneers</Button>
        </div>
      </div>
    </BoothShell>
  );
}

function TemplateCard({
  title,
  layout,
  selected = false,
}: {
  title: string;
  layout: string;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rounded-2xl border p-4 text-left ${selected ? 'border-[#1a7e67] bg-[#e7fff7] ring-2 ring-[#79d6bf]/60' : 'border-[#c0e2d8] bg-white'}`}
    >
      <div className={`template-art ${selected ? 'template-pioneers' : ''}`}>
        <span>
          SIC
          <br />
          2026
        </span>
      </div>
      <strong className="mt-4 block text-[17px]">{title}</strong>
      <small className="mt-1 block text-[13px] text-[#5b8176]">{layout}</small>
    </button>
  );
}

function PhotoCapture() {
  return (
    <BoothShell>
      <div className="relative h-[780px] overflow-hidden">
        <div className="camera-scene absolute inset-0 rounded-none">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,22,.35)_0%,transparent_30%,transparent_70%,rgba(3,27,22,.55)_100%)]" />
          <div className="absolute left-9 top-8 rounded-full bg-black/30 px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm">
            CAMERA 01
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-8">
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-7 py-5 text-white">
            <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">NEXT CAPTURE</p>
            <p className="mt-2 text-[56px] font-black leading-none tracking-[-0.07em]">05</p>
            <p className="mt-2 text-[14px] text-[#c5eee1]">Hold your pose. Auto-capture.</p>
          </div>
          <div className="backdrop-blur-md rounded-full bg-black/30 px-7 py-3 text-[17px] font-black text-white">
            GET READY
          </div>
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-6 py-5 text-white">
            <div className="flex gap-2">
              <span className="size-3.5 rounded-full bg-[#a8f3dd]" />
              <span className="size-3.5 rounded-full bg-[#a8f3dd]" />
              <span className="size-3.5 rounded-full bg-white/40" />
            </div>
            <p className="mt-2 text-[13px] text-[#c5eee1]">2 of 3</p>
          </div>
        </div>
      </div>
    </BoothShell>
  );
}

function PhotoReview() {
  return (
    <BoothShell>
      <div className="flex h-[780px] items-center justify-center gap-12 px-14">
        <div>
          <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">
            PHOTO STRIP REVIEW
          </p>
          <h4 className="mt-2 text-[42px] font-black tracking-[-0.06em]">Keep the good ones.</h4>
          <div className="review-strip mt-7">
            <div className="review-image a" />
            <div className="review-image b" />
            <div className="review-image c retaking" />
          </div>
          <p className="mt-5 text-[14px] text-[#5b8176]">Tap a photo to choose it for a retake.</p>
        </div>
        <aside className="rounded-2xl bg-[#d9f7ed] p-7">
          <p className="text-[12px] font-bold tracking-wide text-[#28715f]">SESSION CONTROL</p>
          <p className="mt-5 text-[25px] font-black">4 retakes left</p>
          <p className="mt-3 text-[14px] leading-6 text-[#53796e]">
            Retakes replace one image only. Your remaining photos stay safe.
          </p>
          <div className="mt-12 grid gap-3">
            <Button>Confirm strip</Button>
            <Button secondary>Retake selected</Button>
          </div>
        </aside>
      </div>
    </BoothShell>
  );
}

function Completion() {
  return (
    <BoothShell>
      <div className="flex h-[780px] flex-col items-center justify-center px-16 text-center">
        <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">
          YOUR PHOTO STRIP IS READY
        </p>
        <h4 className="mt-3 text-[43px] font-black leading-none tracking-[-0.06em]">
          Keep this memory close.
        </h4>
        <div className="mt-10 flex items-center justify-center gap-10">
          <div className="final-strip">
            <div />
            <div />
            <div />
          </div>
          <aside className="rounded-2xl bg-[#0e473d] p-8 text-white">
            <div className="qr-grid mx-auto" />
            <p className="mt-7 text-center text-[14px] font-bold">Scan to retrieve</p>
            <div className="mt-8 grid gap-3">
              <button
                type="button"
                className="rounded-xl bg-[#a8f3dd] py-3 text-[14px] font-bold text-[#145142]"
              >
                Open print handoff
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/25 py-3 text-[14px] font-bold"
              >
                Finish session
              </button>
            </div>
          </aside>
        </div>
      </div>
    </BoothShell>
  );
}

function FrameSelect() {
  return (
    <BoothShell>
      <div className="flex h-[780px] flex-col items-center justify-center px-14 py-12 text-center">
        <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">FLIPBOOK</p>
        <h4 className="mt-2 text-[43px] font-black tracking-[-0.06em]">Choose a frame.</h4>
        <div className="mt-9 grid grid-cols-3 gap-6 text-left">
          <FrameCard title="SIC Seal" selected />
          <FrameCard title="Emerald Motion" />
          <FrameCard title="Pioneer Grid" />
        </div>
        <div className="mt-10">
          <Button>Use SIC Seal</Button>
        </div>
      </div>
    </BoothShell>
  );
}

function FrameCard({ title, selected = false }: { title: string; selected?: boolean }) {
  return (
    <button
      type="button"
      className={`rounded-2xl border p-4 text-left ${selected ? 'border-[#1a7e67] bg-[#e7fff7] ring-2 ring-[#79d6bf]/60' : 'border-[#c0e2d8] bg-white'}`}
    >
      <div className="frame-art">
        <span>SIC</span>
      </div>
      <strong className="mt-4 block text-[17px]">{title}</strong>
      <small className="mt-1 block text-[13px] text-[#5b8176]">Flipbook overlay</small>
    </button>
  );
}

function Instructions() {
  return (
    <BoothShell>
      <div className="flex h-[780px] flex-col items-center justify-center px-10 py-16 text-center">
        <p className="text-[13px] font-bold tracking-[0.14em] text-[#28806c]">
          FLIPBOOK INSTRUCTIONS
        </p>
        <h4 className="mt-3 text-[48px] font-black tracking-[-0.06em]">Bring your motion.</h4>
        <div className="mt-11 grid grid-cols-3 gap-5 text-left">
          <Instruction
            number="01"
            title="Hold your pose"
            copy="A ten-second countdown starts before every capture."
          />
          <Instruction
            number="02"
            title="Move with intent"
            copy="Each video records for six seconds automatically."
          />
          <Instruction
            number="03"
            title="Choose your favorite"
            copy="Pick one cover and one clip at the end."
          />
        </div>
        <div className="mt-11">
          <Button>Start covers</Button>
        </div>
      </div>
    </BoothShell>
  );
}

function Instruction({ number, title, copy }: { number: string; title: string; copy: string }) {
  return (
    <div className="rounded-2xl bg-[#d9f7ed] p-6">
      <span className="text-[13px] font-black text-[#20745f]">{number}</span>
      <h5 className="mt-6 text-[19px] font-black">{title}</h5>
      <p className="mt-2 text-[13px] leading-5 text-[#56796f]">{copy}</p>
    </div>
  );
}

function CoverCapture() {
  return (
    <BoothShell>
      <div className="relative h-[780px] overflow-hidden">
        <div className="camera-scene absolute inset-0 rounded-none">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,22,.35)_0%,transparent_30%,transparent_70%,rgba(3,27,22,.55)_100%)]" />
          <div className="absolute left-9 top-8 rounded-full bg-black/30 px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm">
            CAMERA 01
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-8">
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-7 py-5 text-white">
            <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">COVER PHOTO</p>
            <p className="mt-2 text-[56px] font-black leading-none tracking-[-0.07em]">10</p>
            <p className="mt-2 text-[14px] text-[#c5eee1]">seconds to pose</p>
          </div>
          <div className="backdrop-blur-md rounded-full bg-black/30 px-7 py-3 text-[17px] font-black text-white">
            COVER 1 OF 3
          </div>
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-6 py-5 text-white">
            <div className="flex gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-[#a8f3dd] text-[13px] font-black text-[#145142]">
                1
              </span>
              <span className="grid size-9 place-items-center rounded-full bg-white/20 text-[13px] font-bold">
                2
              </span>
              <span className="grid size-9 place-items-center rounded-full bg-white/20 text-[13px] font-bold">
                3
              </span>
            </div>
          </div>
        </div>
      </div>
    </BoothShell>
  );
}

function VideoRecording() {
  return (
    <BoothShell>
      <div className="relative h-[780px] overflow-hidden">
        <div className="camera-scene absolute inset-0 rounded-none">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,22,.35)_0%,transparent_30%,transparent_70%,rgba(3,27,22,.55)_100%)]" />
          <div className="absolute left-9 top-8 rounded-full bg-black/30 px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm">
            CAMERA 01
          </div>
          <div className="absolute right-9 top-8 flex items-center gap-2 rounded-full bg-[#c2433f] px-4 py-2 text-[12px] font-bold text-white backdrop-blur-sm">
            <span className="size-2 rounded-full bg-white" /> RECORDING
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-8">
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-7 py-5 text-white">
            <p className="text-[12px] font-bold tracking-wide text-[#a8f3dd]">RECORDING TWO</p>
            <p className="mt-2 text-[56px] font-black leading-none tracking-[-0.07em]">06</p>
            <div className="mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-white/20">
              <div className="h-full w-2/3 bg-[#a8f3dd]" />
            </div>
          </div>
          <div className="backdrop-blur-md rounded-full bg-black/30 px-7 py-3 text-[17px] font-black text-white">
            00:04.2
          </div>
          <div className="backdrop-blur-md rounded-2xl bg-black/30 px-6 py-5 text-white">
            <p className="text-[13px] text-[#c5eee1]">Stops automatically</p>
            <div className="mt-2 flex gap-2">
              <span className="size-3.5 rounded-full bg-[#a8f3dd]" />
              <span className="size-3.5 rounded-full bg-white/40" />
              <span className="size-3.5 rounded-full bg-white/40" />
            </div>
          </div>
        </div>
      </div>
    </BoothShell>
  );
}

function FlipReviewCover() {
  return (
    <BoothShell>
      <div className="relative h-[780px] overflow-hidden">
        <div className="absolute inset-0 bg-[#0e473d]" />
        <div className="absolute inset-x-0 top-0 flex justify-center pt-8">
          <span className="rounded-full bg-white/30 px-5 py-2 text-[13px] font-bold text-white backdrop-blur-sm">
            Auto-selects in 04:32
          </span>
        </div>
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          <p className="mb-5 text-[13px] font-bold tracking-wide text-[#a8f3dd]">COVER PHOTO</p>
          <div className="grid grid-cols-3 gap-5">
            <PickTile selected />
            <PickTile />
            <PickTile />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-10">
          <Button>Continue</Button>
        </div>
      </div>
    </BoothShell>
  );
}

function FlipReviewVideo() {
  return (
    <BoothShell>
      <div className="relative h-[780px] overflow-hidden">
        <div className="absolute inset-0 bg-[#0e473d]" />
        <div className="absolute inset-x-0 top-0 flex justify-center pt-8">
          <span className="rounded-full bg-white/30 px-5 py-2 text-[13px] font-bold text-white backdrop-blur-sm">
            Auto-selects in 03:10
          </span>
        </div>
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          <p className="mb-5 text-[13px] font-bold tracking-wide text-[#a8f3dd]">VIDEO CLIPS</p>
          <div className="grid grid-cols-3 gap-5">
            <PickTile selected video />
            <PickTile video />
            <PickTile video />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-10">
          <Button>Create flipbook</Button>
        </div>
      </div>
    </BoothShell>
  );
}

function PickTile({ selected = false, video = false }: { selected?: boolean; video?: boolean }) {
  return (
    <button
      type="button"
      className={`pick-tile ${video ? 'video' : ''} ${selected ? 'selected' : ''}`}
    >
      <span>{video ? '▶ 6 SEC' : 'COVER'}</span>
    </button>
  );
}

function Processing() {
  return (
    <BoothShell>
      <div className="grid h-[780px] place-items-center">
        <div className="max-w-[520px] text-center">
          <div className="relative mx-auto grid size-44 place-items-center">
            <div className="processing-orb" />
            <span className="absolute text-[24px] font-black">68%</span>
          </div>
          <p className="mt-10 text-[13px] font-bold tracking-[0.15em] text-[#28806c]">
            CREATING YOUR FLIPBOOK
          </p>
          <h4 className="mt-3 text-[47px] font-black tracking-[-0.06em]">
            Your motion is taking shape.
          </h4>
          <p className="mt-5 text-[16px] leading-7 text-[#5b8176]">
            We are building a looping GIF from your selected cover and clip. This usually takes a
            moment.
          </p>
        </div>
      </div>
    </BoothShell>
  );
}

function AdminScreen({ name }: { name: string }) {
  const content =
    name === 'Event management' ? (
      <AdminEventsPage />
    ) : name === 'Template library' ? (
      <AdminTemplates />
    ) : name === 'Template editor' ? (
      <TemplateEditor />
    ) : name === 'Frame management' ? (
      <AdminFrames />
    ) : (
      <Publications />
    );
  return (
    <div className="artboard bg-[#f5fffb] text-[#143a32]">
      <div className="flex h-full">
        <aside className="w-[220px] bg-[#0c332c] p-7 text-[#c5eadf]">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="font-black text-white">SIC BOOTH</span>
          </div>
          <p className="mt-12 text-[10px] font-bold tracking-[0.16em] text-[#74b5a4]">OPERATIONS</p>
          <div className="mt-5 grid gap-2 text-[13px] font-semibold">
            <span>Events</span>
            <span>Templates</span>
            <span>Flipbook frames</span>
            <span>Publications</span>
          </div>
          <div className="mt-auto pt-[360px] text-[12px] text-[#86b9ab]">
            Mika Santos
            <br />
            Operator
          </div>
        </aside>
        <div className="flex-1">{content}</div>
      </div>
    </div>
  );
}

function AdminRow({
  title,
  sub,
  active = false,
}: {
  title: string;
  sub: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#dcefe8] px-6 py-5 last:border-0">
      <span>
        <strong className="block text-[15px]">{title}</strong>
        <small className="mt-1 block text-[12px] text-[#64877d]">{sub}</small>
      </span>
      {active && (
        <span className="rounded-full bg-[#ddf7ee] px-3 py-1 text-[10px] font-bold text-[#21745f]">
          ACTIVE
        </span>
      )}
    </div>
  );
}
function AdminTemplates() {
  return (
    <div className="p-10">
      <div className="grid grid-cols-3 gap-5">
        <AdminAsset title="Pioneers" state="Active" />
        <AdminAsset title="The Circuit" state="Active" />
        <AdminAsset title="Seafoam" state="Inactive" />
      </div>
      <p className="mt-8 text-[12px] text-[#64877d]">
        Template changes never affect a session that has already selected its template.
      </p>
    </div>
  );
}
function AdminAsset({ title, state }: { title: string; state: string }) {
  return (
    <div className="rounded-xl border border-[#cde7dd] bg-white p-4">
      <div className="template-art">
        <span>
          SIC
          <br />
          2026
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <strong className="text-[14px]">{title}</strong>
        <small
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${state === 'Active' ? 'bg-[#ddf7ee] text-[#21745f]' : 'bg-[#edf1f0] text-[#71837d]'}`}
        >
          {state}
        </small>
      </div>
    </div>
  );
}
function TemplateEditor() {
  return (
    <div className="flex gap-5 p-6">
      <div className="flex-1">
        <div className="relative h-[640px] overflow-hidden rounded-xl border border-[#bcddcf] editor-canvas">
          <span className="absolute inset-2 grid place-items-center rounded-lg bg-[rgba(255,255,255,0.35)]">
            <img alt="background" className="object-contain mix-blend-multiply" src="" />
          </span>
          <div className="placement one">01</div>
          <div className="placement two">02</div>
          <div className="placement three">03</div>
          <div
            className="absolute left-[44%] top-[6%] grid h-[120px] w-[180px] place-items-center rounded-full border-2 border-dashed border-[#f6c97b] bg-[#ffe9c4]/70 text-[13px] font-black text-[#7a5a1f]"
            style={{ transform: 'rotate(-6deg)' }}
          >
            SIC LOGO
          </div>
          <div className="absolute bottom-5 left-5 rounded bg-black/45 px-3 py-2 text-[11px] font-bold text-white">
            1200 x 1800 · PORTRAIT
          </div>
          <div className="absolute right-5 top-5 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-black/45 px-3 py-2 text-[11px] font-bold text-white"
            >
              2x1
            </button>
            <button
              type="button"
              className="rounded-lg bg-black/45 px-3 py-2 text-[11px] font-bold text-white"
            >
              2x2
            </button>
            <button
              type="button"
              className="rounded-lg bg-black/45 px-3 py-2 text-[11px] font-bold text-white"
            >
              3x1
            </button>
            <button
              type="button"
              className="rounded-lg bg-black/45 px-3 py-2 text-[11px] font-bold text-white"
            >
              3x2
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-[#cde7dd] bg-white p-5">
          <p className="text-[11px] font-bold tracking-wide text-[#327664]">BACKGROUND IMAGE</p>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <Field label="X" />
            <Field label="Y" />
            <Field label="Width" />
            <Field label="Height" />
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-[#cde7dd] bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold tracking-wide text-[#327664]">OVERLAY IMAGES</p>
            <button
              type="button"
              className="rounded-lg bg-[#146a56] px-3 py-1.5 text-[11px] font-bold text-white"
            >
              Add overlay
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <Field label="X" />
            <Field label="Y" />
            <Field label="Width" />
            <Field label="Height" />
          </div>
          <p className="mt-2 text-[11px] text-[#64877d]">LOG · SIC LOGO · z-index 5</p>
        </div>
      </div>
      <aside className="w-[290px] rounded-xl border border-[#cde7dd] bg-white p-5">
        <p className="text-[11px] font-bold tracking-wide text-[#327664]">PLACEMENT 01</p>
        <label className="mt-4 block text-[12px] font-bold">
          Capture index
          <input
            className="mt-1.5 w-full rounded-md border border-[#b5ddd1] px-3 py-2"
            defaultValue="1"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="X" value="72" />
          <Field label="Y" value="168" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Width" value="420" />
          <Field label="Height" value="560" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Rotation" value="0" />
          <Field label="Radius" value="8" />
        </div>
        <label className="mt-3 block text-[12px] font-bold">
          Z-index
          <input
            className="mt-1.5 w-full rounded-md border border-[#b5ddd1] px-3 py-2"
            defaultValue="1"
          />
        </label>
        <button
          type="button"
          className="mt-5 w-full rounded-lg bg-[#146a56] px-4 py-2 text-[12px] font-bold text-white"
        >
          Save layout
        </button>
      </aside>
    </div>
  );
}
function Field({ label, value = '' }: { label: string; value?: string }) {
  return (
    <label className="text-[12px] font-bold">
      <span className="block text-[10px] font-semibold text-[#64877d]">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-[#b5ddd1] px-2 py-1.5"
        defaultValue={value}
      />
    </label>
  );
}
function AdminFrames() {
  return (
    <div className="p-10">
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-5">
        <AdminAsset title="SIC Seal" state="Active" />
        <AdminAsset title="Emerald Motion" state="Active" />
        <div className="grid min-h-[250px] place-items-center rounded-xl border-2 border-dashed border-[#a9d6c9] bg-[#e9faf4] text-center">
          <div>
            <strong className="block text-[16px]">Upload a frame</strong>
            <small className="mt-2 block text-[12px] text-[#64877d]">PNG overlay only</small>
          </div>
        </div>
      </div>
    </div>
  );
}
function Publications() {
  return (
    <div className="p-10">
      <div className="grid grid-cols-4 gap-4">
        <Status total="12" label="Queued" />
        <Status total="1" label="In progress" />
        <Status total="84" label="Uploaded" />
        <Status total="2" label="Failed" danger />
      </div>
      <div className="mt-8 overflow-hidden rounded-xl border border-[#cde7dd] bg-white">
        <AdminRow
          title="SIC General Assembly · M7p4XaV"
          sub="Failed after 5 attempts · Photo Strip"
        />
        <AdminRow title="SIC General Assembly · Kd8qM2R" sub="Queued · Flipbook" />
      </div>
      <button
        type="button"
        className="mt-6 rounded-lg border border-[#19745f] px-4 py-2 text-[12px] font-bold text-[#176a56]"
      >
        Retry failed jobs
      </button>
    </div>
  );
}
function Status({
  total,
  label,
  danger = false,
}: {
  total: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#cde7dd] bg-white p-5">
      <strong className={`text-[32px] tracking-[-0.06em] ${danger ? 'text-[#b64d47]' : ''}`}>
        {total}
      </strong>
      <span className="mt-2 block text-[12px] font-semibold text-[#64877d]">{label}</span>
    </div>
  );
}

export default App;