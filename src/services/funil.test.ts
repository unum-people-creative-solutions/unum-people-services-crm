import { describe, it, expect, vi, afterEach } from 'vitest';
import api, { FunilService } from './api';
import funilPadrao from './__fixtures__/get-crm-funil-padrao.json';
import funilSalvo from './__fixtures__/put-crm-funil-6-etapas.json';

// spec: crm-funil-e-atividades-f1 FUN-01 / D-F1-6 (T20).
// Fixtures no formato do TECH-DESIGN D-F1-6. A etapa nova da resposta do PUT
// usa o id de exemplo E7K2M9QXA4B (T22), que casa com ^E[A-Z0-9]{10}$.

const funilPadraoEsperado = {
  versao: 0,
  etapas: [
    { id: 'NOVO', nome: 'Novos Leads', papel: 'novo', removivel: false, movivel: false },
    { id: 'ATENDIMENTO', nome: 'Em Atendimento', papel: 'comum', removivel: true, movivel: true },
    { id: 'AGENDADO', nome: 'Agendados', papel: 'agendado', removivel: true, movivel: true },
    { id: 'GANHO', nome: 'Ganho (Conversão)', papel: 'ganho', removivel: false, movivel: false },
    { id: 'PERDIDO', nome: 'Perdido', papel: 'perdido', removivel: false, movivel: false },
  ],
};

describe('FunilService (D-F1-6)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ler faz GET /crm/funil com o tenant_id codificado e devolve o funil padrão', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: funilPadrao });

    await expect(FunilService.ler('t 1')).resolves.toEqual(funilPadraoEsperado);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/crm/funil?tenant_id=t%201');
    expect(funilPadrao).toEqual(funilPadraoEsperado);
  });

  it('salvar faz PUT com {versao, etapas} e a etapa nova sem id; devolve o funil de 6 etapas', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: funilSalvo });
    const etapas = [
      { id: 'NOVO', nome: 'Novos Leads' },
      { id: 'ATENDIMENTO', nome: 'Em Atendimento' },
      { nome: 'Proposta enviada' },
      { id: 'AGENDADO', nome: 'Agendados' },
      { id: 'GANHO', nome: 'Ganho (Conversão)' },
      { id: 'PERDIDO', nome: 'Perdido' },
    ];

    const salvo = await FunilService.salvar(0, etapas, 't 1');

    expect(put).toHaveBeenCalledTimes(1);
    const [url, corpo] = put.mock.calls[0] as [string, { versao: number; etapas: { id?: string; nome: string }[] }];
    expect(url).toBe('/crm/funil?tenant_id=t%201');
    expect(corpo).toEqual({ versao: 0, etapas: etapas.map((etapa) => ({ ...etapa, acao: 'nenhuma' })) });
    expect(corpo.etapas[2]).toEqual({ nome: 'Proposta enviada', acao: 'nenhuma' });
    expect(corpo.etapas[2]).not.toHaveProperty('id');

    expect(salvo.versao).toBe(1);
    expect(salvo.etapas.map((e) => e.id)).toEqual([
      'NOVO', 'ATENDIMENTO', 'E7K2M9QXA4B', 'AGENDADO', 'GANHO', 'PERDIDO',
    ]);
    expect(salvo.etapas[2]).toEqual({
      id: 'E7K2M9QXA4B',
      nome: 'Proposta enviada',
      papel: 'comum',
      removivel: true,
      movivel: true,
    });
    expect(salvo.etapas[2].id).toMatch(/^E[A-Z0-9]{10}$/);
    expect(salvo).toEqual(funilSalvo);
  });

  it('codifica o tenant_id com encodeURIComponent no GET e no PUT', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: funilPadrao });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: funilSalvo });

    await FunilService.ler('TENANT#DEMO_REVIEW');
    await FunilService.salvar(0, [{ id: 'NOVO', nome: 'Novos Leads' }], 'TENANT#DEMO_REVIEW');

    expect(get).toHaveBeenCalledWith('/crm/funil?tenant_id=TENANT%23DEMO_REVIEW');
    expect(put).toHaveBeenCalledWith(
      '/crm/funil?tenant_id=TENANT%23DEMO_REVIEW',
      { versao: 0, etapas: [{ id: 'NOVO', nome: 'Novos Leads', acao: 'nenhuma' }] },
    );
    expect(String(get.mock.calls[0][0])).not.toContain('#');
    expect(String(put.mock.calls[0][0])).not.toContain('#');
  });
});
