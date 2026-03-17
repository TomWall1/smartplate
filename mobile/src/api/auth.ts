import client from './client';
import { AuthResponse } from '../types';

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await client.post<AuthResponse>('/auth/login', { email, password });
  return response.data;
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  const response = await client.post<AuthResponse>('/auth/signup', { email, password });
  return response.data;
}

export async function forgotPassword(email: string): Promise<void> {
  await client.post('/api/users/forgot-password', { email });
}
