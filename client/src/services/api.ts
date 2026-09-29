import axios, { type AxiosResponse } from 'axios';
import type { ApiErrorBody, ApiSuccess } from '../types/api';

const TOKEN_KEY = 'prompt-shield.token';

/** JWT storage. The token is sent as a Bearer header, never in URLs. */
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
  timeout: 90_000,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type UnauthorizedHandler = (code: string) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** The AuthProvider registers a handler so expired sessions log the user out everywhere. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

const SESSION_ERRORS = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'SESSION_REVOKED', 'UNAUTHORIZED']);

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
      const code = error.response?.data?.error?.code;
      if (error.response?.status === 401 && code && SESSION_ERRORS.has(code) && tokenStore.get()) {
        unauthorizedHandler?.(code);
      }
    }
    return Promise.reject(error);
  },
);

export async function unwrap<T>(request: Promise<AxiosResponse<ApiSuccess<T>>>): Promise<T> {
  const response = await request;
  return response.data.data;
}
