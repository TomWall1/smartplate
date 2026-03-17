import client from './client';
import { User } from '../types';

export async function getProfile(): Promise<User> {
  const response = await client.get<User>('/api/users/profile');
  return response.data;
}

export async function updateState(state: string): Promise<void> {
  await client.post('/api/users/state', { state });
}
