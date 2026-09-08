import { AdminRouter } from './admin/admin-router';
import { WelcomeScreen } from './components/WelcomeScreen';
import { FlipbookWorkflow } from './components/flipbook/FlipbookWorkflow';
import { PhotoStripWorkflow } from './components/photostrip/PhotoStripWorkflow';
import { useSessionStore } from './store/session-store';

function App() {
  const { activeSession } = useSessionStore();

  if (window.location.pathname.startsWith('/admin/')) {
    return <AdminRouter />;
  }

  return (
    <main className="min-h-[100dvh] bg-[#071d1a] text-[#e8fff5]">
      <section className="flex h-[100dvh] w-full flex-col items-stretch overflow-hidden">
        <div className="flex flex-1 w-full h-full overflow-hidden bg-[#0a2924]">
          {activeSession?.type === 'photo_strip' ? (
            <PhotoStripWorkflow />
          ) : activeSession?.type === 'flipbook' ? (
            <FlipbookWorkflow />
          ) : (
            <WelcomeScreen />
          )}
        </div>
      </section>
    </main>
  );
}

export default App;

