import type { ReviewTemplate } from '../components/PhotoStripReview';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface FrameItem {
  id: string;
  name: string;
  type?: 'photo_strip' | 'flipbook';
  coverPath?: string | null;
  backgroundPath?: string | null;
  overlayPath?: string | null;
  isActive?: boolean;
  placements?: Array<{
    id?: string;
    captureIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    borderRadius?: number;
    zIndex?: number;
  }>;
  overlays?: Array<{
    id?: string;
    label?: string;
    path?: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    zIndex?: number;
  }>;
}

export interface SessionInfo {
  sessionId: string;
  token: string;
  type: 'photo_strip' | 'flipbook';
  state: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  createdAt: string;
}

export class BoothApiClient {
  private token: string | null = null;

  public setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (this.token) {
      headers['X-Session-Token'] = this.token;
    }
    return headers;
  }

  public async createSession(
    eventName: string,
    eventDate: string,
    operatorName: string,
    type: 'photo_strip' | 'flipbook',
  ): Promise<SessionInfo> {
    const res = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ eventName, eventDate, operatorName, type }),
    });
    const body: ApiResponse<SessionInfo> = await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to create session');
    }
    this.token = body.data.token;
    return body.data;
  }

  public async getSession(sessionId: string): Promise<SessionInfo> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
      headers: this.getHeaders(),
    });
    const body: ApiResponse<SessionInfo> = await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to fetch session');
    }
    return body.data;
  }

  public async transition(sessionId: string, targetState: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/transition`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ targetState }),
    });
    const body: ApiResponse = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || `Failed to transition to ${targetState}`);
    }
  }

  public async listFrames(): Promise<FrameItem[]> {
    const res = await fetch(`${API_BASE_URL}/api/frames`);
    const body: ApiResponse<FrameItem[]> = await res.json();
    if (!res.ok || !body.success || !body.data) {
      return [
        { id: '1', name: 'SIC Seal', overlayPath: 'frames/sic-seal.png', isActive: true },
        {
          id: '2',
          name: 'Emerald Motion',
          overlayPath: 'frames/emerald-motion.png',
          isActive: true,
        },
        { id: '3', name: 'Pioneer Grid', overlayPath: 'frames/pioneer-grid.png', isActive: true },
      ];
    }
    return body.data;
  }

  public async listTemplates(): Promise<ReviewTemplate[]> {
    const res = await fetch(`${API_BASE_URL}/api/templates`);
    const body: ApiResponse<ReviewTemplate[]> = await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to list templates');
    }
    return body.data;
  }

  public async selectFrame(sessionId: string, frameId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/frame`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ frameId }),
    });
    const body: ApiResponse = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || 'Failed to select frame');
    }
  }

  public async acknowledgeInstructions(sessionId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/instructions/acknowledge`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({}),
    });
    const body: ApiResponse = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || 'Failed to acknowledge instructions');
    }
  }

  public async uploadCoverPhoto(
    sessionId: string,
    photoBlob: Blob,
  ): Promise<{ coverIndex: number; totalCovers: number; state: string }> {
    const formData = new FormData();
    formData.append('file', photoBlob, 'cover.jpg');

    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/captures/cover`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData,
    });
    const body: ApiResponse<{ coverIndex: number; totalCovers: number; state: string }> =
      await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to upload cover photo');
    }
    return body.data;
  }

  public async uploadVideoClip(
    sessionId: string,
    videoBlob: Blob,
  ): Promise<{ videoIndex: number; totalVideos: number; state: string }> {
    const formData = new FormData();
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('file', videoBlob, `video.${ext}`);

    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/captures/video`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData,
    });
    const body: ApiResponse<{ videoIndex: number; totalVideos: number; state: string }> =
      await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to upload video clip');
    }
    return body.data;
  }

  public async submitFlipbookSelection(
    sessionId: string,
    coverIndex: number,
    videoIndex: number,
  ): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/flipbook/select`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ coverIndex, videoIndex }),
    });
    const body: ApiResponse = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || 'Failed to record selection');
    }
  }

  public async processFlipbookGif(
    sessionId: string,
  ): Promise<{ outputId: string; publicId: string; qrUrl: string; state: string }> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/flipbook/process`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({}),
    });
    const body: ApiResponse<{ outputId: string; publicId: string; qrUrl: string; state: string }> =
      await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(
        body.error?.message || 'GIF processing took too long. Please recapture this flipbook.',
      );
    }
    return body.data;
  }

  public async resetRecovery(sessionId: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/flipbook/reset-recovery`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({}),
    });
  }

  public async selectTemplate(sessionId: string, templateId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/template`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ templateId }),
    });
    const body: ApiResponse = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || 'Failed to select template');
    }
  }

  public async uploadPhotoCapture(
    sessionId: string,
    photoBlob: Blob,
    captureIndex: number,
    isRetake: boolean = false,
  ): Promise<{ captureIndex: number; retakeCount: number; state: string }> {
    const formData = new FormData();
    formData.append('file', photoBlob, `photo_${captureIndex}.jpg`);
    formData.append('captureIndex', String(captureIndex));
    if (isRetake) {
      formData.append('isRetake', 'true');
    }

    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/captures/photo`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData,
    });
    const body: ApiResponse<{ captureIndex: number; retakeCount: number; state: string }> =
      await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to upload photo capture');
    }
    return body.data;
  }

  public async confirmPhotoStrip(
    sessionId: string,
  ): Promise<{ outputId: string; publicId: string; qrUrl: string; filePath: string }> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/photo-strip/confirm`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({}),
    });
    const body: ApiResponse<{
      outputId: string;
      publicId: string;
      qrUrl: string;
      filePath: string;
    }> = await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to confirm photo strip');
    }
    return body.data;
  }

  public async recordPrint(sessionId: string, copies: number = 1): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/print`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ copies }),
    });
    const body: ApiResponse = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || 'Failed to record print');
    }
  }
}

export const boothApi = new BoothApiClient();
