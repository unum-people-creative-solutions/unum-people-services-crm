import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fixture from './__fixtures__/get-atividades.json';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mockGet,
      post: mockPost,
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  },
}));

let AtividadeService: typeof import('./api').AtividadeService;

beforeAll(async () => {
  AtividadeService = (await import('./api')).AtividadeService;
});

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

const OBRIGATORIAS = ['criada_em', 'criada_por', 'descricao', 'id', 'situacao', 'tipo', 'vence_em'];
const OPCIONAIS = ['duracao_min', 'lembrar_antes_min'];
const TIPOS = ['consulta', 'ligar', 'whatsapp', 'email', 'reuniao', 'tarefa', 'retomar'];

describe('AtividadeService (ATV-06)', () => {
  it('a fixture é {itens} e cada item segue o contrato', () => {
    expect(Object.keys(fixture).sort()).toEqual(['itens']);
    expect(fixture.itens.map((item) => item.tipo).sort()).toEqual([...TIPOS].sort());
    for (const item of fixture.itens) {
      const chaves = Object.keys(item);
      for (const chave of OBRIGATORIAS) expect(chaves).toContain(chave);
      for (const chave of chaves) expect([...OBRIGATORIAS, ...OPCIONAIS]).toContain(chave);
    }
    expect(fixture.itens.some((item) => !('lembrar_antes_min' in item))).toBe(true);
    expect(fixture.itens.some((item) => 'lembrar_antes_min' in item && item.lembrar_antes_min === 0)).toBe(true);
    expect(fixture.itens.some((item) => 'duracao_min' in item && item.duracao_min === 50)).toBe(true);
  });

  it('GET /leads/{id}/atividades?tenant_id= devolve {itens}', async () => {
    mockGet.mockResolvedValue({ data: fixture });

    const pagina = await AtividadeService.listar('l1', 't1');

    expect(mockGet).toHaveBeenCalledWith('/leads/l1/atividades?tenant_id=t1');
    expect(pagina).toEqual(fixture);
    expect(pagina.itens[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      tipo: 'consulta',
      descricao: 'Retorno da avaliação',
      vence_em: '2026-11-12T16:00:00Z',
      duracao_min: 50,
      lembrar_antes_min: 15,
      situacao: 'pendente',
      criada_em: '2026-11-11T12:00:00Z',
      criada_por: 'ana@exemplo.com',
    });
  });

  it('POST manda {tipo, descricao, vence_em} e só inclui duração e lembrete quando existem', async () => {
    const criada = fixture.itens[0];
    mockPost.mockResolvedValue({ data: criada, status: 201 });

    await expect(AtividadeService.criar('l1', 't1', {
      tipo: 'tarefa',
      descricao: 'oi',
      vence_em: '2026-11-12T18:00:00Z',
    })).resolves.toEqual(criada);
    expect(mockPost).toHaveBeenNthCalledWith(1, '/leads/l1/atividades?tenant_id=t1', {
      tipo: 'tarefa',
      descricao: 'oi',
      vence_em: '2026-11-12T18:00:00Z',
    });
    expect(Object.keys(mockPost.mock.calls[0][1]).sort()).toEqual(['descricao', 'tipo', 'vence_em']);

    await AtividadeService.criar('l 1', 't 1', {
      tipo: 'consulta',
      descricao: 'retorno',
      vence_em: '2026-11-12T18:30:00Z',
      duracao_min: 50,
      lembrar_antes_min: 0,
    });
    expect(mockPost).toHaveBeenLastCalledWith(
      '/leads/l%201/atividades?tenant_id=t+1',
      {
        tipo: 'consulta',
        descricao: 'retorno',
        vence_em: '2026-11-12T18:30:00Z',
        duracao_min: 50,
        lembrar_antes_min: 0,
      },
    );
  });

  it('POST concluir e cancelar devolvem o item', async () => {
    const feita = { ...fixture.itens[0], situacao: 'feita' };
    const cancelada = { ...fixture.itens[0], situacao: 'cancelada' };
    mockPost.mockResolvedValueOnce({ data: feita, status: 200 });
    mockPost.mockResolvedValueOnce({ data: cancelada, status: 200 });

    await expect(AtividadeService.concluir('l1', 'a/1', 't1')).resolves.toEqual(feita);
    expect(mockPost).toHaveBeenNthCalledWith(1, '/leads/l1/atividades/a%2F1/concluir?tenant_id=t1');

    await expect(AtividadeService.cancelar('l1', 'a1', 't1')).resolves.toEqual(cancelada);
    expect(mockPost).toHaveBeenNthCalledWith(2, '/leads/l1/atividades/a1/cancelar?tenant_id=t1');
  });

  it('erro da API sobe para quem chamou', async () => {
    const erro = { response: { status: 400, data: { error: 'atividade_invalida', motivo: 'descricao' } } };
    mockGet.mockRejectedValue(erro);
    mockPost.mockRejectedValue(erro);

    await expect(AtividadeService.listar('l1', 't1')).rejects.toBe(erro);
    await expect(AtividadeService.criar('l1', 't1', { tipo: 'tarefa', descricao: '', vence_em: '2026-11-12T18:00:00Z' })).rejects.toBe(erro);
    await expect(AtividadeService.concluir('l1', 'a1', 't1')).rejects.toBe(erro);
    await expect(AtividadeService.cancelar('l1', 'a1', 't1')).rejects.toBe(erro);
  });
});
