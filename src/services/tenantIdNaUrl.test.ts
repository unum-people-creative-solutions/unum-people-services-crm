import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Toda chamada do cliente HTTP cai aqui; o primeiro argumento é a URL.
const chamada = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: chamada,
      post: chamada,
      put: chamada,
      patch: chamada,
      delete: chamada,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

// O tenant de demonstração tem "#" no ID (TENANT#DEMO_REVIEW). Sem codificar,
// o "#" corta a URL e a API recebe tenant_id=TENANT (log da crm-core, 16/10).
const id = 'TENANT#DEMO_REVIEW';
const query = 'tenant_id=TENANT%23DEMO_REVIEW';

let api: typeof import('./api');
let notificacoes: typeof import('./notificationService');

beforeAll(async () => {
  api = await import('./api');
  notificacoes = await import('./notificationService');
});

beforeEach(() => {
  chamada.mockReset();
  chamada.mockResolvedValue({ data: { subscribed: false, pending: [] } });
});

describe('ID do tenant na query', () => {
  const subscription = { toJSON: () => ({}) } as unknown as PushSubscription;

  it.each<[string, () => Promise<unknown>]>([
    ['LeadService.create', () => api.LeadService.create({} as Parameters<typeof api.LeadService.create>[0], id)],
    ['LeadService.updateStatus', () => api.LeadService.updateStatus('l1', 'novo', undefined, undefined, id)],
    ['LeadService.update', () => api.LeadService.update('l1', { nome: 'N', telefone: '1' }, id)],
    ['LeadService.searchCustomers', () => api.LeadService.searchCustomers('ana', id)],
    ['LeadService.addSale', () => api.LeadService.addSale('l1', 10, '2026-10-16', id)],
    ['LeadService.delete', () => api.LeadService.delete('l1', id)],
    ['TermsService.getStatus', () => api.TermsService.getStatus(id)],
    // riscos-acesso-empresa RF-08: a equipe age na empresa selecionada.
    ['NotificationService.subscribe', () => notificacoes.NotificationService.subscribe(subscription, id)],
    ['NotificationService.checkStatus', () => notificacoes.NotificationService.checkStatus('https://x', id)],
    ['NotificationService.unsubscribe', () => notificacoes.NotificationService.unsubscribe('https://x', id)],
  ])('%s codifica o ID', async (_nome, chamar) => {
    await chamar();

    const url = String(chamada.mock.calls[0][0]);
    expect(url).toContain(query);
    expect(url).not.toContain('#');
  });
});
