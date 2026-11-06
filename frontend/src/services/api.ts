import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

let onSessionExpired = () => {};

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session auth answers 403, not 401, when nobody is logged in.
    const detail = error.response?.data?.detail;
    if (error.response?.status === 403 && typeof detail === 'string' && detail.includes('credentials')) {
      onSessionExpired();
    }
    return Promise.reject(error);
  },
);

/** The server's own explanation if it sent one, otherwise the fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === 'object') {
    const first = Object.values(data as Record<string, unknown>)[0];
    const message = Array.isArray(first) ? first[0] : first;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

export default api;
