import type { ApiSuccess, AuthResponse, User } from '../types/api';
import { api, unwrap } from './api';

export const authService = {
  login: (email: string, password: string) =>
    unwrap(api.post<ApiSuccess<AuthResponse>>('/auth/login', { email, password })),
  register: (name: string, email: string, password: string) =>
    unwrap(api.post<ApiSuccess<AuthResponse>>('/auth/register', { name, email, password })),
  me: () => unwrap(api.get<ApiSuccess<User>>('/auth/me')),
  logout: () => api.post('/auth/logout').catch(() => undefined),
  updateProfile: (name: string) => unwrap(api.put<ApiSuccess<User>>('/auth/me', { name })),
  changePassword: (currentPassword: string, newPassword: string) =>
    unwrap(api.put<ApiSuccess<AuthResponse>>('/auth/password', { currentPassword, newPassword })),
  deleteAccount: (password: string) => api.delete('/auth/me', { data: { password } }),
};
