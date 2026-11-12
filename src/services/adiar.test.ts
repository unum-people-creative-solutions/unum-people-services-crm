import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fixture from './__fixtures__/get-atividades.json';

const mockPost = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: vi.fn(),
      post: mockPost,
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  },
}));

let LeadService: typeof import('./api').LeadService;

beforeAll(async () => {
  LeadService = (await import('./api')).LeadService;
});

beforeEach(() => {
  mockPost.mockReset();
});

const retomar = fixture.itens.find((item) => item.tipo === 'retomar');

describe('LeadService.adiar (ADI-01)', () => {
  it('POST /leads/{id}/adiar?tenant_id= manda {vence_em} e devolve a atividade', async () => {
    mockPost.mockResolvedValue({ data: retomar, status: 201 });

    await expect(LeadService.adiar('l1', 't1', { vence_em: '2026-11-13T12:00:00Z' })).resolves.toEqual(retomar);
    expect(mockPost).toHaveBeenCalledWith('/leads/l1/adiar?tenant_id=t1', {
      vence_em: '2026-11-13T12:00:00Z',
    });
    expect(Object.keys(mockPost.mock.calls[0][1])).toEqual(['vence_em']);
  });

  it('inclui descricao só quando o motivo vem preenchido e codifica id e tenant', async () => {
    mockPost.mockResolvedValue({ data: retomar, status: 201 });

    await LeadService.adiar('l 1', 't 1', {
      vence_em: '2026-11-19T12:00:00Z',
      descricao: 'cliente viaja',
    });

    expect(mockPost).toHaveBeenCalledWith('/leads/l%201/adiar?tenant_id=t+1', {
      vence_em: '2026-11-19T12:00:00Z',
      descricao: 'cliente viaja',
    });
  });

  it('erro da API sobe para quem chamou', async () => {
    const invalido = { response: { status: 400, data: { error: 'adiar_invalido', motivo: 'vence_em' } } };
    const indisponivel = { response: { status: 409, data: { error: 'adiar_indisponivel' } } };
    mockPost.mockRejectedValueOnce(invalido);
    mockPost.mockRejectedValueOnce(indisponivel);

    await expect(LeadService.adiar('l1', 't1', { vence_em: '2026-11-13T12:00:00Z' })).rejects.toBe(invalido);
    await expect(LeadService.adiar('l1', 't1', { vence_em: '2026-11-13T12:00:00Z' })).rejects.toBe(indisponivel);
  });
});
