export type SessionType = 'photo-strip' | 'flipbook'

export interface ActiveSession {
  id: string
  type: SessionType
}
