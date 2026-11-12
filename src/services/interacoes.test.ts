import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fixture from './__fixtures__/get-interacoes.json';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mockGet,
      post: mockPost,
      patch: mockPatch,
      delete: mockDelete,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  },
}));

let InteracaoService: typeof import('./api').InteracaoService;

beforeAll(async () => {
  InteracaoService = (await import('./api')).InteracaoService;
});

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPatch.mockReset();
  mockDelete.mockReset();
});

const CHAVES_DO_ITEM = ['autor_email', 'autor_nome', 'criada_em', 'editada_em', 'id', 'ocorrida_em', 'texto', 'tipo'];

describe('InteracaoService (INT-01 a INT-04)', () => {
  it('a fixture é {itens, cursor} e cada item tem o contrato', () => {
    expect(Object.keys(fixture).sort()).toEqual(['cursor', 'itens']);
    expect(fixture.cursor).toBe('');
    expect(fixture.itens.length).toBeGreaterThan(0);
    for (const item of fixture.itens) {
      expect(Object.keys(item).sort()).toEqual(CHAVES_DO_ITEM);
    }
  });

  it('GET /leads/{id}/interacoes?tenant_id= devolve o corpo e não manda cursor vazio', async () => {
    mockGet.mockResolvedValue({ data: fixture });

    const pagina = await InteracaoService.listar('l1', 't1');

    expect(mockGet).toHaveBeenCalledWith('/leads/l1/interacoes?tenant_id=t1');
    expect(pagina).toEqual(fixture);
  });

  it('GET com cursor pede a página seguinte', async () => {
    mockGet.mockResolvedValue({ data: { itens: [], cursor: '' } });

    await InteracaoService.listar('l1', 't 1', 'pagina-2');

    expect(mockGet).toHaveBeenCalledWith('/leads/l1/interacoes?tenant_id=t+1&cursor=pagina-2');
  });

  it('POST manda {tipo, texto} e, com data, inclui ocorrida_em', async () => {
    const criada = fixture.itens[0];
    mockPost.mockResolvedValue({ data: criada, status: 201 });

    await expect(InteracaoService.criar('l1', 't1', { tipo: 'nota', texto: 'oi' })).resolves.toEqual(criada);
    expect(mockPost).toHaveBeenNthCalledWith(1, '/leads/l1/interacoes?tenant_id=t1', { tipo: 'nota', texto: 'oi' });
    expect(Object.keys(mockPost.mock.calls[0][1])).toEqual(['tipo', 'texto']);

    await InteracaoService.criar('l1', 't1', { tipo: 'ligacao', texto: 'ontem', ocorrida_em: '2026-11-10T15:00:00Z' });
    expect(mockPost).toHaveBeenLastCalledWith(
      '/leads/l1/interacoes?tenant_id=t1',
      { tipo: 'ligacao', texto: 'ontem', ocorrida_em: '2026-11-10T15:00:00Z' },
    );
  });

  it('PATCH manda só as chaves presentes', async () => {
    mockPatch.mockResolvedValue({ data: {} });

    await InteracaoService.alterar('l1', 'i1', 't1', { texto: 'novo' });
    expect(mockPatch).toHaveBeenLastCalledWith('/leads/l1/interacoes/i1?tenant_id=t1', { texto: 'novo' });

    await InteracaoService.alterar('l1', 'i1', 't1', { ocorrida_em: '2026-11-10T15:00:00Z' });
    expect(mockPatch).toHaveBeenLastCalledWith(
      '/leads/l1/interacoes/i1?tenant_id=t1',
      { ocorrida_em: '2026-11-10T15:00:00Z' },
    );
  });

  it('DELETE chama a rota da interação', async () => {
    mockDelete.mockResolvedValue({ status: 204, data: '' });

    await InteracaoService.apagar('l1', 'i1', 't1');

    expect(mockDelete).toHaveBeenCalledWith('/leads/l1/interacoes/i1?tenant_id=t1');
  });

  it('erro da API sobe para quem chamou', async () => {
    const erro = { response: { status: 400, data: { error: 'interacao_invalida', motivo: 'texto' } } };
    mockPost.mockRejectedValue(erro);
    mockPatch.mockRejectedValue(erro);
    mockDelete.mockRejectedValue(erro);
    mockGet.mockRejectedValue(erro);

    await expect(InteracaoService.criar('l1', 't1', { tipo: 'nota', texto: '' })).rejects.toBe(erro);
    await expect(InteracaoService.alterar('l1', 'i1', 't1', { texto: 'x' })).rejects.toBe(erro);
    await expect(InteracaoService.apagar('l1', 'i1', 't1')).rejects.toBe(erro);
    await expect(InteracaoService.listar('l1', 't1')).rejects.toBe(erro);
  });
});
