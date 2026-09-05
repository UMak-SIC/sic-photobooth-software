import { useFlipbookStore } from '../../store/flipbook-store';
import { useSessionStore } from '../../store/session-store';
import { EventSelectScreen } from '../events/EventSelectScreen';
import { type Event } from '../events/EventRow';
import { boothApi } from '../../services/api';
import { FrameSelectScreen } from './FrameSelectScreen';
import { InstructionsScreen } from './InstructionsScreen';
import { CoverCaptureScreen } from './CoverCaptureScreen';
import { VideoRecordingScreen } from './VideoRecordingScreen';
import { FlipReviewCoverScreen } from './FlipReviewCoverScreen';
import { FlipReviewVideoScreen } from './FlipReviewVideoScreen';
import { ProcessingScreen } from './ProcessingScreen';
import { FlipbookCompletionScreen } from './FlipbookCompletionScreen';

export function FlipbookWorkflow() {
  const {
    currentStep,
    setSession,
    setSelectedEvent,
    setStep,
    setError,
    resetFlipbook,
  } = useFlipbookStore();
  const { setActiveSession, clearActiveSession } = useSessionStore();

  const handleEventContinue = async (selectedEvent: Event, operatorName: string) => {
    setError(null);
    const date = selectedEvent.date || new Date().toISOString().split('T')[0];
    try {
      const session = await boothApi.createSession(
        selectedEvent.name,
        date,
        operatorName,
        'flipbook',
      );
      setSession(session.sessionId, session.token);
      setActiveSession({ id: session.sessionId, type: 'flipbook', token: session.token });
      setSelectedEvent({ id: selectedEvent.id, name: selectedEvent.name, date, operatorName });
      setStep('instructions');
    } catch (err: unknown) {
      console.warn('Backend session creation failed, continuing in mock session mode:', err);
      const mockId = `mock-flipbook-${Date.now()}`;
      setSession(mockId, 'mock-token');
      setActiveSession({ id: mockId, type: 'flipbook' });
      setSelectedEvent({ id: selectedEvent.id, name: selectedEvent.name, date, operatorName });
      setStep('instructions');
    }
  };

  const handleBackToWelcome = () => {
    resetFlipbook();
    clearActiveSession();
  };

  switch (currentStep) {
    case 'welcome':
      return null;
    case 'setup':
      return (
        <div className="flex flex-1 w-full min-h-[100vh] bg-[#ecfff8]">
          <EventSelectScreen
            onContinue={handleEventContinue}
            onBack={handleBackToWelcome}
          />
        </div>
      );
    case 'instructions':
      return <InstructionsScreen />;
    case 'cover_capture':
      return <CoverCaptureScreen />;
    case 'video_capture':
      return <VideoRecordingScreen />;
    case 'review_cover':
      return <FlipReviewCoverScreen />;
    case 'review_video':
      return <FlipReviewVideoScreen />;
    case 'processing':
      return <ProcessingScreen />;
    case 'frame_select':
      return <FrameSelectScreen />;
    case 'complete':
      return <FlipbookCompletionScreen />;
    default:
      return <InstructionsScreen />;
  }
}
