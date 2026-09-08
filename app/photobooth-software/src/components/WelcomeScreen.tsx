import { useState } from 'react';
import { useFlipbookStore } from '../store/flipbook-store';
import { usePhotoStripStore } from '../store/photostrip-store';
import { useSessionStore } from '../store/session-store';
import { EventSelectScreen } from './events/EventSelectScreen';
import { type Event } from './events/EventRow';
import { WelcomeSplashScreen } from './WelcomeSplashScreen';
import { ExperienceChoiceScreen } from './ExperienceChoiceScreen';
import { CameraSetupModal } from './CameraSetupModal';
import { boothApi } from '../services/api';

export interface WelcomeScreenProps {
  preview?: boolean;
}

export function WelcomeScreen({ preview = false }: WelcomeScreenProps = {}) {
  const { setStep: setFlipbookStep, setSession: setFlipbookSession, setSelectedEvent: setFlipbookEvent } = useFlipbookStore();
  const { setStep: setPhotoStripStep, setSession: setPhotoStripSession, setSelectedEvent: setPhotoStripEvent } = usePhotoStripStore();
  const {
    setActiveSession,
    stage,
    setStage,
    selectedEvent: chosenEvent,
    setSelectedEvent: setChosenEvent,
  } = useSessionStore();
  const [isCameraSetupOpen, setIsCameraSetupOpen] = useState(false);

  const handleTouchScreen = () => {
    if (preview) return;
    setStage('choose_event');
  };

  const handleEventContinue = (selectedEvent: Event, operatorName: string) => {
    if (preview) return;
    const date = selectedEvent.date || new Date().toISOString().split('T')[0];
    setChosenEvent({
      id: selectedEvent.id,
      name: selectedEvent.name,
      date,
      operatorName,
    });
    setStage('choose_experience');
  };

  const startSession = async (type: 'photo_strip' | 'flipbook') => {
    if (preview) return;
    const eventName = chosenEvent?.name || 'SIC Event';
    const eventDate = chosenEvent?.date || new Date().toISOString().split('T')[0];
    const operatorName = chosenEvent?.operatorName || 'Mika Santos';
    const eventObj = chosenEvent
      ? { id: chosenEvent.id || 'default', name: chosenEvent.name, date: chosenEvent.date, operatorName: chosenEvent.operatorName }
      : { id: 'default', name: eventName, date: eventDate, operatorName };

    try {
      const session = await boothApi.createSession(
        eventName,
        eventDate,
        operatorName,
        type,
      );
      if (type === 'photo_strip') {
        setPhotoStripSession(session.sessionId, session.token);
        setPhotoStripEvent(eventObj);
        setActiveSession({ id: session.sessionId, type: 'photo_strip', token: session.token });
        setPhotoStripStep('template_select');
      } else {
        setFlipbookSession(session.sessionId, session.token);
        setFlipbookEvent(eventObj);
        setActiveSession({ id: session.sessionId, type: 'flipbook', token: session.token });
        setFlipbookStep('frame_select');
      }
    } catch (err: unknown) {
      console.warn('Backend session creation failed, continuing in mock session mode:', err);
      const mockId = `mock-${type}-${Date.now()}`;
      if (type === 'photo_strip') {
        setPhotoStripSession(mockId, 'mock-token');
        setPhotoStripEvent(eventObj);
        setActiveSession({ id: mockId, type: 'photo_strip' });
        setPhotoStripStep('template_select');
      } else {
        setFlipbookSession(mockId, 'mock-token');
        setFlipbookEvent(eventObj);
        setActiveSession({ id: mockId, type: 'flipbook' });
        setFlipbookStep('frame_select');
      }
    }
  };

  const handleStartPhotoStrip = () => {
    void startSession('photo_strip');
  };

  const handleStartFlipbook = () => {
    void startSession('flipbook');
  };

  if (stage === 'welcome' || stage === 'choose_event') {
    return (
      <div className="relative flex flex-1 w-full h-[100dvh] min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f4f6f5]">
        <EventSelectScreen
          preview={preview}
          initialEventId={chosenEvent?.id}
          initialOperatorName={chosenEvent?.operatorName}
          onContinue={handleEventContinue}
          onBack={() => setStage('welcome')}
          backButtonText="Back"
        />

        {stage === 'welcome' && (
          <WelcomeSplashScreen onStart={handleTouchScreen} />
        )}
      </div>
    );
  }

  return (
    <>
      <ExperienceChoiceScreen
        onSelectPhotoStrip={handleStartPhotoStrip}
        onSelectFlipbook={handleStartFlipbook}
        onBack={() => setStage('choose_event')}
        onChangeCamera={() => setIsCameraSetupOpen(true)}
      />

      {isCameraSetupOpen && (
        <CameraSetupModal
          onCancel={() => setIsCameraSetupOpen(false)}
          onContinue={() => setIsCameraSetupOpen(false)}
        />
      )}
    </>
  );
}

export { WelcomeScreen as WelcomeExperienceScreen };
