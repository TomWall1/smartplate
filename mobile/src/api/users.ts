import client from './client';
import { User } from '../types';

export async function getProfile(): Promise<User> {
  const response = await client.get<User>('/api/users/profile');
  return response.data;
}

export async function updateState(state: string): Promise<void> {
  await client.post('/api/users/state', { state });
}

/**
 * Persist the user's store choice server-side so it survives a reinstall or a
 * new device. Mirrors updateState; the backend writes users.selected_store.
 */
export async function updateSelectedStore(store: string): Promise<void> {
  await client.put('/api/users/preferences', { selected_store: store });
}

/**
 * How many people this account usually cooks for. Drives per-serve costing and
 * the scaled shopping figures on a recipe, so it is a durable fact worth
 * storing server-side rather than a device setting.
 */
export async function updateHouseholdSize(size: number): Promise<void> {
  await client.put('/api/users/preferences', { household_size: size });
}

/**
 * Permanently delete the signed-in account. Required in-app by App Store
 * Guideline 5.1.1(v). The server takes the id from the JWT, so there is
 * nothing to pass.
 */
export async function deleteAccount(): Promise<void> {
  await client.delete('/api/users/me');
}
