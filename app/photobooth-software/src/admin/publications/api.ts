import type { Publication, FlipbookPublicationData } from './types';

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
  removeLocal: (id: string) => request<void>(`/api/publications/${id}/local`, { method: 'DELETE' }),
  removeCloud: (id: string) => request<Publication>(`/api/publications/${id}/cloud`, { method: 'DELETE' }),
  getFlipbookData: (id: string) =>
    request<FlipbookPublicationData>(`/api/publications/${id}/flipbook-data`),
  print: (id: string, options?: { copies?: number; recordOnly?: boolean }) =>
    request<{ jobId?: string; copiesPrinted?: number }>(`/api/publications/${id}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    }),
  getPdfBlob: async (id: string): Promise<Blob | null> => {
    const res = await fetch(`${API_URL}/api/publications/${id}/pdf`);
    if (!res.ok) return null;
    return await res.blob();
  },
  savePdf: async (id: string, pdfBlob: Blob): Promise<void> => {
    const formData = new FormData();
    formData.append('file', pdfBlob, 'output.pdf');
    const res = await fetch(`${API_URL}/api/publications/${id}/pdf`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      console.warn(`Failed to save PDF for publication ${id}: ${res.status}`);
    }
  },
};
