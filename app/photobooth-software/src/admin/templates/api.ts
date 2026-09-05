import type { Template, TemplateDraft } from './types';

const API_URL =
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const assetUrl = (relativeUrl: string | null, version?: string) => {
  if (!relativeUrl) return null;
  const url = new URL(relativeUrl, API_URL);
  if (version) url.searchParams.set('v', version);
  return url.toString();
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as { data: T };
  return body.data;
}

const stripPaths = (draft: TemplateDraft): TemplateDraft => ({
  ...draft,
  overlays: draft.overlays.map(({ path: _path, ...overlay }) => overlay),
});

export const templateApi = {
  list: (type?: Template['type']) => request<Template[]>(`/templates${type ? `?type=${type}` : ''}`),
  get: (id: string) => request<Template>(`/templates/${id}`),
  duplicate: (id: string) =>
    request<Template>(`/templates/${id}/duplicate`, { method: 'POST' }),
  create: (draft: TemplateDraft) =>
    request<Template>('/templates', { method: 'POST', body: JSON.stringify(stripPaths(draft)) }),
  update: (id: string, draft: TemplateDraft) =>
    request<Template>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(stripPaths(draft)),
    }),
  setActive: (id: string, active: boolean) =>
    request<Template>(`/templates/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  reorder: (orderedIds: string[]) =>
    request<Template[]>('/templates/order', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    }),
  remove: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
  uploadBackground: (id: string, file: File) => upload<Template>(`/templates/${id}/background`, file),
  uploadCover: (id: string, file: File) => upload<Template>(`/templates/${id}/cover`, file),
  uploadOverlay: (id: string, overlayId: string, file: File) =>
    upload<Template>(`/templates/${id}/overlays?overlayId=${encodeURIComponent(overlayId)}`, file),
  importArchive: (file: File) => upload<Template[]>(`/templates/import`, file),
};

async function upload<T>(path: string, file: File) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: (() => {
      const form = new FormData();
      form.append('file', file);
      return form;
    })(),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
  }
  return ((await response.json()) as { data: T }).data;
}
