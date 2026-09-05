import React, { useState, useCallback } from 'react';
import { usePhotoStripStore } from '../../store/photostrip-store';
import { useSessionStore } from '../../store/session-store';
import { TemplatePicker } from '../TemplatePicker';
import { CameraViewfinder } from '../CameraViewfinder';
import { PhotoStripReview, type ReviewTemplate } from '../PhotoStripReview';
import { PrintModal } from '../PrintModal';
import { boothApi } from '../../services/api';

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
    setTemplate,
    startCountdown,
    stopCountdown,
    addCapture,
    startRetake,
    setConfirmedOutput,
    setIsConfirming,
    setError,
    resetPhotoStrip,
  } = usePhotoStripStore();

  const { clearActiveSession } = useSessionStore();
  const [uploading, setUploading] = useState(false);

  // 1. Template Selection
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

  // 2. Capture Completed
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

  // 3. Confirm Photo Strip
  const handleConfirm = async () => {
    setIsConfirming(true);
    setError(null);
    try {
      if (sessionId && !sessionId.startsWith('mock-')) {
        const result = await boothApi.confirmPhotoStrip(sessionId);
        const imageUrl = `http://localhost:3000/photos/${result.publicId}`;
        setConfirmedOutput(result.publicId, result.qrUrl, imageUrl);
      } else {
        // Fallback demo output for mock/offline dev
        const demoId = 'demo777';
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

  // 4. Print Recording
  const handlePrint = async (copies: number) => {
    if (sessionId) {
      try {
        await boothApi.recordPrint(sessionId, copies);
      } catch (err) {
        console.warn('Record print failed:', err);
      }
    }
  };

  // 5. Finish & Return
  const handleFinish = () => {
    resetPhotoStrip();
    clearActiveSession();
  };

  // RENDER BASED ON STEP
  if (currentStep === 'template_select') {
    return (
      <div className="flex flex-col flex-1 w-full min-h-[calc(100vh-77px)] bg-[#071d1a] text-white">
        <TemplatePicker onSelectTemplate={handleSelectTemplate} />
      </div>
    );
  }

  if (currentStep === 'capturing') {
    const totalSlots = selectedTemplate?.placements.length || 3;
    return (
      <div className="flex flex-col flex-1 w-full min-h-[calc(100vh-77px)] bg-[#071d1a] text-white px-6 py-6">
        {/* Top capture HUD */}
        <div className="flex items-center justify-between max-w-5xl mx-auto w-full mb-4 bg-white/5 border border-white/10 rounded-2xl px-6 py-4">
          <div>
            <span className="text-xs font-bold tracking-widest text-[#48c4a1] uppercase block mb-1">
              {isRetaking ? 'RETAKE IN PROGRESS' : 'PHOTO STRIP CAPTURE'}
            </span>
            <h2 className="text-2xl font-black text-white">
              {isRetaking
                ? `Retaking Photo ${activeSlotIndex}`
                : `Photo ${activeSlotIndex} of ${totalSlots}`}
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-white/50 block">Retakes Left</span>
              <span className="text-lg font-bold text-[#48c4a1]">
                {Math.max(0, 4 - retakeCount)} / 4
              </span>
            </div>

            {!isCountingDown && (
              <button
                type="button"
                onClick={startCountdown}
                disabled={uploading}
                className="bg-[#48c4a1] hover:bg-[#38a98a] text-[#071d1a] font-black px-6 py-3 rounded-xl transition text-base shadow-lg active:scale-95 cursor-pointer"
              >
                {uploading ? 'Processing...' : 'Start Countdown 📸'}
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="max-w-5xl mx-auto w-full mb-4 bg-red-500/20 border border-red-500/40 text-red-200 px-4 py-3 rounded-xl text-sm">
            {errorMessage}
          </div>
        )}

        {/* Viewfinder with Countdown */}
        <div className="flex-1 max-w-5xl mx-auto w-full flex items-center justify-center">
          <CameraViewfinder
            isCountingDown={isCountingDown}
            countdownSeconds={countdownSeconds}
            onCountdownComplete={handleCountdownComplete}
            onCancelCountdown={stopCountdown}
          />
        </div>
      </div>
    );
  }

  if (currentStep === 'review' && selectedTemplate) {
    return (
      <div className="flex flex-col flex-1 w-full min-h-[calc(100vh-77px)] bg-[#071d1a] text-white">
        <PhotoStripReview
          template={selectedTemplate}
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

  if (currentStep === 'complete' && publicId && qrUrl) {
    return (
      <PrintModal
        publicId={publicId}
        qrUrl={qrUrl}
        outputImageUrl={outputImageUrl || captures[0]?.dataUrl || ''}
        onPrintConfirmed={handlePrint}
        onFinishSession={handleFinish}
      />
    );
  }

  return null;
};
