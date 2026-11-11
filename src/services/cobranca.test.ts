import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type { ResumoDeCobranca } from '@/types/cobranca';
import { resumoEmAtraso, resumoEmDia } from './__fixtures__/cobranca';

// spec cobranca-e-plano-do-cliente RF2-20 e RF2-50 (T40): GET /me/cobranca da empresa pedida.

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

describe('CobrancaService.resumo (RF2-50)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('faz GET /me/cobranca?tenant_id= da empresa pedida, com o id codificado, e devolve o corpo tipado', async () => {
    mockGet.mockResolvedValue({ data: resumoEmAtraso });
    const resultado: ResumoDeCobranca = await mod.CobrancaService.resumo('TENANT#DEMO REVIEW');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/me/cobranca?tenant_id=TENANT%23DEMO%20REVIEW');
    expect(resultado).toEqual(resumoEmAtraso);
  });

  it('conta em dia volta exatamente o JSON do §4.1', async () => {
    mockGet.mockResolvedValue({ data: JSON.parse('{"situacao":"em_dia","fatura":null,"ferramentas_bloqueadas":[],"pode_gerir":true}') });
    const resultado = await mod.CobrancaService.resumo('t1');
    expect(mockGet).toHaveBeenCalledWith('/me/cobranca?tenant_id=t1');
    expect(resultado).toStrictEqual(resumoEmDia);
  });

  it('o erro da API sobe para quem chamou (não é engolido)', async () => {
    const erro = { response: { status: 500, data: { error: 'internal_error' } } };
    mockGet.mockRejectedValue(erro);
    await expect(mod.CobrancaService.resumo('t1')).rejects.toBe(erro);
  });
});
