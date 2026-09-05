import { useFlipbookStore } from '../../store/flipbook-store';
import { FrameSelectScreen } from './FrameSelectScreen';
import { InstructionsScreen } from './InstructionsScreen';
import { CoverCaptureScreen } from './CoverCaptureScreen';
import { VideoRecordingScreen } from './VideoRecordingScreen';
import { FlipReviewCoverScreen } from './FlipReviewCoverScreen';
import { FlipReviewVideoScreen } from './FlipReviewVideoScreen';
import { ProcessingScreen } from './ProcessingScreen';
import { FlipbookCompletionScreen } from './FlipbookCompletionScreen';

export function FlipbookWorkflow() {
  const { currentStep } = useFlipbookStore();

  switch (currentStep) {
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
