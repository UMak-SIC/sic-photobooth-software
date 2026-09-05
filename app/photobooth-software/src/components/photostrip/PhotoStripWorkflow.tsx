import React, { useState, useCallback, useEffect } from 'react';
import { usePhotoStripStore } from '../../store/photostrip-store';
import { useSessionStore } from '../../store/session-store';
import { EventSelectScreen } from '../events/EventSelectScreen';
import { TemplatePicker } from './TemplatePicker';
import { CameraViewfinder } from '../CameraViewfinder';
import { PhotoStripReview, type ReviewTemplate } from './PhotoStripReview';
import { PrintModal } from './PrintModal';
import { boothApi, API_BASE_URL, type EventItem } from '../../services/api';

export const PhotoStripWorkflow: React.FC = () => {
  const {
    currentStep,
    sessionId,
    selectedTemplate,
    captures,
    retakeCount,
    activeSlotIndex,
    isRetaking,
    isCountingDown,
    countdownSeconds,
    publicId,
    qrUrl,
    outputImageUrl,
    isConfirming,
    errorMessage,
    isPrinted,
    copiesPrinted,
    setSession,
    setSelectedEvent,
    setStep,
    setTemplate,
    startCountdown,
    stopCountdown,
    addCapture,
    startRetake,
    setConfirmedOutput,
    setIsConfirming,
    setError,
    recordPrintSuccess,
    resetPhotoStrip,
  } = usePhotoStripStore();

  const { setActiveSession, clearActiveSession } = useSessionStore();
  const [, setUploading] = useState(false);

  // 1. Event Selection (Setup)
  const handleEventContinue = async (selectedEvent: EventItem, operatorName: string) => {
    setError(null);
    const date = selectedEvent.date || new Date().toISOString().split('T')[0];
    try {
      const session = await boothApi.createSession(
        selectedEvent.name,
        date,
        operatorName,
        'photo_strip',
      );
      setSession(session.sessionId, session.token);
      setActiveSession({ id: session.sessionId, type: 'photo_strip', token: session.token });
      setSelectedEvent({ id: selectedEvent.id, name: selectedEvent.name, date, operatorName });
      setStep('template_select');
    } catch (err: unknown) {
      console.warn('Backend session creation failed, continuing in mock session mode:', err);
      const mockId = `mock-strip-${Date.now()}`;
      setSession(mockId, 'mock-token');
      setActiveSession({ id: mockId, type: 'photo_strip' });
      setSelectedEvent({ id: selectedEvent.id, name: selectedEvent.name, date, operatorName });
      setStep('template_select');
    }
  };

  // 2. Template Selection
  const handleSelectTemplate = async (template: ReviewTemplate) => {
    if (sessionId && !sessionId.startsWith('mock-')) {
      try {
        await boothApi.selectTemplate(sessionId, template.id);
        await boothApi.transition(sessionId, 'capturing');
      } catch (err) {
        console.warn('Backend template selection failed, continuing in local mode:', err);
      }
    }
    setTemplate(template);
  };

  // 3. Retake Trigger
  const handleRetake = async (captureIndex: number) => {
    if (sessionId && !sessionId.startsWith('mock-')) {
      try {
        await boothApi.transition(sessionId, 'capturing');
      } catch (err) {
        console.warn('Backend transition to capturing failed:', err);
      }
    }
    startRetake(captureIndex);
  };

  // Automatically start countdown when entering capturing stage
  useEffect(() => {
    if (currentStep === 'capturing') {
      const timer = setTimeout(() => {
        startCountdown();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentStep, activeSlotIndex, startCountdown]);

  // 4. Capture Completed
  const handleCountdownComplete = useCallback(
    async (blob: Blob) => {
      stopCountdown();
      const targetSlot = activeSlotIndex;
      const retakingFlag = isRetaking;

      setUploading(true);
      try {
        if (sessionId && !sessionId.startsWith('mock-')) {
          await boothApi.uploadPhotoCapture(sessionId, blob, targetSlot, retakingFlag);
        }
      } catch (err) {
        console.warn('Photo upload to backend failed, continuing with local blob:', err);
      } finally {
        setUploading(false);
        addCapture(blob, targetSlot);
      }
    },
    [sessionId, activeSlotIndex, isRetaking, stopCountdown, addCapture],
  );

  // 5. Confirm Photo Strip
  const handleConfirm = async () => {
    setIsConfirming(true);
    setError(null);
    try {
      if (sessionId && !sessionId.startsWith('mock-')) {
        const result = await boothApi.confirmPhotoStrip(sessionId);
        const imageUrl = `${API_BASE_URL}/photos/${result.publicId}`;
        setConfirmedOutput(result.publicId, result.qrUrl, imageUrl);
      } else {
        const demoId = 'M7p4XaV';
        setConfirmedOutput(
          demoId,
          `https://myphotobooth.com/${demoId}`,
          captures[0]?.dataUrl || '',
        );
      }
    } catch (err) {
      console.error('Photo strip confirmation failed on backend:', err);
      const message =
        err instanceof Error ? err.message : 'Photo strip confirmation failed on backend.';
      setError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  // 6. Print Recording
  const handlePrint = async (copies: number) => {
  // 6. Print Recording / Dispatch
  const handlePrint = async (copies: number, recordOnly?: boolean) => {
    if (sessionId && !sessionId.startsWith('mock-')) {
      await boothApi.recordPrint(sessionId, copies);
      await boothApi.recordPrint(sessionId, copies, recordOnly);
    }
    recordPrintSuccess(copies);
  };

  // 7. Finish & Return
  const handleFinish = () => {
    resetPhotoStrip();
    clearActiveSession();
  };

  // RENDER BASED ON CURRENT STEP
  if (currentStep === 'setup') {
    return (
      <div className="flex flex-1 w-full min-h-[calc(100vh-77px)] bg-[#ecfff8]">
        <EventSelectScreen onContinue={handleEventContinue} />
      </div>
    );
  }

  if (currentStep === 'template_select') {
    return (
      <div className="flex flex-1 w-full min-h-[calc(100vh-77px)] bg-[#ecfff8]">
        <TemplatePicker onSelectTemplate={handleSelectTemplate} />
      </div>
    );
  }

  if (currentStep === 'capturing') {
    const totalSlots = selectedTemplate
      ? (selectedTemplate.requiredCaptureCount ??
         new Set(selectedTemplate.placements.map((p) => p.captureIndex)).size)
      : 3;
    return (
      <div className="flex flex-1 w-full min-h-[calc(100vh-77px)] bg-[#071d1a]">
        <CameraViewfinder
          countdownSeconds={countdownSeconds}
          isCountingDown={isCountingDown}
          activeSlotIndex={activeSlotIndex}
          totalSlots={totalSlots}
          isRetaking={isRetaking}
          onCountdownComplete={handleCountdownComplete}
          onCancelCountdown={stopCountdown}
        />
      </div>
    );
  }

  if (currentStep === 'review') {
    return (
      <div className="flex flex-1 w-full min-h-[calc(100vh-77px)] bg-[#ecfff8]">
        <PhotoStripReview
          template={selectedTemplate ?? undefined}
          captures={captures}
          retakeCount={retakeCount}
          isConfirming={isConfirming}
          errorMessage={errorMessage}
          onRetake={handleRetake}
          onConfirm={handleConfirm}
        />
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div className="flex flex-1 w-full min-h-[calc(100vh-77px)] bg-[#ecfff8]">
        <PrintModal
          publicId={publicId || 'M7p4XaV'}
          qrUrl={qrUrl || 'https://myphotobooth.com/M7p4XaV'}
          outputImageUrl={outputImageUrl || captures[0]?.dataUrl || ''}
          templateName={selectedTemplate?.name}
          orientation={selectedTemplate?.orientation}
          outputWidth={selectedTemplate?.outputWidth}
          outputHeight={selectedTemplate?.outputHeight}
          isPrinted={isPrinted}
          copiesPrinted={copiesPrinted}
          onPrintConfirmed={handlePrint}
          onFinishSession={handleFinish}
        />
      </div>
    );
  }

  return null;
};
