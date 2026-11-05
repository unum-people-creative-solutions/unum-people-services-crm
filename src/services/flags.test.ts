import { vi, describe, it, expect, beforeAll } from 'vitest';

// spec: crm-agendamento-e-lembretes RF-76 / CA-77 (leitura de /me/flags da empresa ativa).
// Corpo no formato do FlagsHandler.MeFlags da API: {"flags": {"<chave>": bool}}.

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockImplementation(() => ({
      get: mockGet,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

let mod: typeof import('./api');

beforeAll(async () => {
  mod = await import('./api');
});

describe('FlagsService.get', () => {
  it('faz GET /me/flags com o id codificado e devolve o mapa de flags', async () => {
    mockGet.mockResolvedValue({ data: { flags: { 'crm-agendamento': true } } });
    const flags = await mod.FlagsService.get('t 1');
    expect(mockGet).toHaveBeenCalledWith('/me/flags?tenant_id=t%201');
    expect(flags).toEqual({ 'crm-agendamento': true });
  });
});
