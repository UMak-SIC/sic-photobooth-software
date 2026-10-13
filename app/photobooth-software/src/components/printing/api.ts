import { API_BASE_URL, type ApiResponse } from '../../services/api';
import type { PrintJob } from './types';

async function response<T>(res: Response): Promise<T> {
  const body: ApiResponse<T> = await res.json();
  if (!res.ok || !body.success || !body.data) throw new Error(body.error?.message || 'Printing request failed.');
  return body.data;
}

export function createSessionPrintJob(sessionId: string, token: string | null, copies: number, requestKey: string) {
  return fetch(`${API_BASE_URL}/api/sessions/${sessionId}/print-jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Token': token } : {}) }, body: JSON.stringify({ copies, requestKey }) }).then(response<PrintJob>);
}
export function getSessionPrintJob(sessionId: string, token: string | null, jobId: string) {
  return fetch(`${API_BASE_URL}/api/sessions/${sessionId}/print-jobs/${jobId}`, { headers: token ? { 'X-Session-Token': token } : {} }).then(response<PrintJob>);
}
