import type { ReviewTemplate } from '../components/photostrip/PhotoStripReview';
import type { PhotoFilterType } from '../config/filters';

export const API_BASE_URL =
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const resolveAssetUrl = (relativeUrl: string | null): string | null => {
  if (!relativeUrl) return null;
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://') || relativeUrl.startsWith('data:')) {
    return relativeUrl;
  }
  return new URL(relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`, API_BASE_URL).toString();
};

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface EventItem {
  id: string;
  name: string;
  description?: string;
  date: string;
  operatorName: string;
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

  public async listEvents(): Promise<EventItem[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/events`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const body = await res.json();
      if (body.data && Array.isArray(body.data)) {
        return body.data;
      }
      return body;
    } catch {
      return [
        {
          id: '1',
          name: 'SIC General Assembly',
          description: 'Official photobooth for the SIC General Assembly',
          date: 'May 24, 2026',
          operatorName: 'Mika Santos',
        },
        {
          id: '2',
          name: 'College Week 2026',
          description: 'Annual college week celebration and exhibits',
          date: 'June 18, 2026',
          operatorName: 'Mika Santos',
        },
      ];
    }
  }

  public async createEvent(
    name: string,
    date: string,
    operatorName: string,
    description?: string,
  ): Promise<EventItem> {
    const res = await fetch(`${API_BASE_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        date,
        operatorName,
        description: description?.trim() || undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.data) {
      throw new Error(body.error?.message || 'Could not create event');
    }
    return body.data;
  }

  public async deleteEvent(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/events/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    const body: ApiResponse = await res.json().catch(() => ({ success: res.ok }));
    if (!res.ok || body.success === false) {
      throw new Error(body.error?.message || 'Could not delete event');
    }
  }

  public async listFrames(): Promise<FrameItem[]> {
    const defaultPlacements = [
      { captureIndex: 1, x: 290, y: 150, width: 620, height: 348.75 },
    ];
    const res = await fetch(`${API_BASE_URL}/api/frames`);
    const body: ApiResponse<FrameItem[]> = await res.json();
    if (!res.ok || !body.success || !body.data) {
      return [
        {
          id: '1',
          name: 'SIC Seal',
          overlayPath: 'frames/sic-seal.png',
          isActive: true,
          placements: defaultPlacements,
        },
        {
          id: '2',
          name: 'Emerald Motion',
          overlayPath: 'frames/emerald-motion.png',
          isActive: true,
          placements: defaultPlacements,
        },
        {
          id: '3',
          name: 'Pioneer Grid',
          overlayPath: 'frames/pioneer-grid.png',
          isActive: true,
          placements: defaultPlacements,
        },
      ];
    }
    return body.data;
  }

  public async listTemplates(): Promise<ReviewTemplate[]> {
    const res = await fetch(`${API_BASE_URL}/templates?type=photo_strip&active=true`);
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
    formData.append('captureIndex', String(captureIndex));
    if (isRetake) {
      formData.append('isRetake', 'true');
    }
    formData.append('file', photoBlob, `photo_${captureIndex}.jpg`);

    const queryParams = new URLSearchParams({
      captureIndex: String(captureIndex),
      ...(isRetake ? { isRetake: 'true' } : {}),
    });

    const res = await fetch(
      `${API_BASE_URL}/api/sessions/${sessionId}/captures/photo?${queryParams.toString()}`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: formData,
      },
    );
    const body: ApiResponse<{ captureIndex: number; retakeCount: number; state: string }> =
      await res.json();
    if (!res.ok || !body.success || !body.data) {
      throw new Error(body.error?.message || 'Failed to upload photo capture');
    }
    return body.data;
  }

  public async confirmPhotoStrip(
    sessionId: string,
    filter?: PhotoFilterType,
  ): Promise<{ outputId: string; publicId: string; qrUrl: string; filePath: string }> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/photo-strip/confirm`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ filter }),
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

  public async recordPrint(
    sessionId: string,
    copies: number = 1,
    recordOnly?: boolean,
  ): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/print`, {
      method: 'POST',
      headers: this.getHeaders('application/json'),
      body: JSON.stringify({ copies, recordOnly }),
    });
    const body: ApiResponse = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || 'Failed to record print');
    }
  }

  public async uploadSessionPdf(
    sessionId: string,
    pdfBlob: Blob,
  ): Promise<void> {
    if (!pdfBlob) return;
    try {
      const formData = new FormData();
      formData.append('file', pdfBlob, 'output.pdf');
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/pdf`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: formData,
      });
      const body: ApiResponse = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok || !body.success) {
        console.warn('Failed to upload session PDF to storage');
      }
    } catch (err) {
      console.warn('Failed to upload session PDF to storage:', err);
    }
  }
}

export const boothApi = new BoothApiClient();
