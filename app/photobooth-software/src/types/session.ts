export type SessionType = 'photo_strip' | 'flipbook';

export interface ActiveSession {
  id: string;
  type: SessionType;
  token?: string;
  state?: string;
  templateId?: string;
  templateSnapshot?: Record<string, unknown> | null;
  retakeCount?: number;
}
