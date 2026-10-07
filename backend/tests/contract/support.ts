import type { ContractApp } from './harness';
import { API } from './harness';

type Auth = Record<string, string>;

export const createSubstrate = async (
  app: ContractApp,
  auth: Auth,
  body: { name?: string; isPublic?: boolean } = {},
) => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/substrates`,
    headers: auth,
    json: { name: 'Aroid Mix', isPublic: false, ...body },
  });
  if (res.status !== 201) throw new Error(`createSubstrate failed: ${res.status} ${res.text}`);
  return res.body.data as { substrate_id: number; substrate_name: string };
};

export const createPlant = async (
  app: ContractApp,
  auth: Auth,
  substrateId: number,
  body: { name?: string; species?: string; isPublic?: boolean } = {},
) => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/plants`,
    headers: auth,
    json: {
      name: 'Monstera',
      species: 'Monstera deliciosa',
      substrateId,
      isPublic: false,
      ...body,
    },
  });
  if (res.status !== 201) throw new Error(`createPlant failed: ${res.status} ${res.text}`);
  return res.body.data as { plant_id: number; plant_name: string; plant_user_id: number };
};

export const createComponent = async (app: ContractApp, adminAuth: Auth, name = 'Perlite') => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/components`,
    headers: adminAuth,
    json: { name, fineness: 1 },
  });
  if (res.status !== 201) throw new Error(`createComponent failed: ${res.status} ${res.text}`);
  return res.body.data as { component_id: number; component_name: string };
};

export interface SseFrame {
  event: string;
  data: unknown;
}

/** Parses a buffered text/event-stream body; comment lines (heartbeats) are skipped. */
export const parseSse = (text: string): SseFrame[] =>
  text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(':'))
    .map((block) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      return { event, data: JSON.parse(data.join('\n')) as unknown };
    });

export const ticketFor = async (app: ContractApp, auth: Auth): Promise<string> => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/auth/ticket`,
    headers: auth,
  });
  return res.body.data.ticket as string;
};
