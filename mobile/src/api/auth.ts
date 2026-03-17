import client from './client';
import { AuthResponse } from '../types';

// Supabase URL is public (anon key is publishable) — safe to embed in mobile app
export const SUPABASE_URL = 'https://bdzrpqydfrgosbqwodzu.supabase.co';

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await client.post<AuthResponse>('/api/auth/login', { email, password });
  return response.data;
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  const response = await client.post<AuthResponse>('/api/auth/signup', { email, password });
  return response.data;
}

export async function forgotPassword(email: string): Promise<void> {
  await client.post('/api/users/forgot-password', { email });
}
