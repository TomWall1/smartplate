import client from './client';
import { Deal } from '../types';

export async function getDealsByStore(storeName: string): Promise<Deal[]> {
  const response = await client.get<Deal[]>(`/api/deals/store/${storeName}`);
  return Array.isArray(response.data) ? response.data : [];
}
