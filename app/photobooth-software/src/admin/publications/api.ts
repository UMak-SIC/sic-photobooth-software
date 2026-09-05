import type { Publication } from './types';

const API_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body?.data as T;
}

export const publicationApi = {
  list: () => request<Publication[]>('/api/publications'),
  retry: (id: string) => request<Publication>(`/api/publications/${id}/retry`, { method: 'POST' }),
};
