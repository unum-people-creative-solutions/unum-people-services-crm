import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import type { MeusAcessos } from './api';

// spec: gestao-de-acesso-f4-aplicacao RF-05 (leitura de /me/acessos e recusa por permissão).

const interceptores = vi.hoisted(() => ({ erro: null as any }));
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockImplementation(() => ({
      get: mockGet,
      interceptors: {
        request: { use: vi.fn() },
        response: {
          use: vi.fn((_ok, erro) => {
            interceptores.erro = erro;
          }),
        },
      },
    })),
  },
}));

let mod: typeof import('./api');

beforeAll(async () => {
  mod = await import('./api');
});

const acessosDoVendedor: MeusAcessos = {
  tenant_id: 'TENANT#DEMO_REVIEW',
  operador: false,
  ferramentas: [
    { id: 'portal', nome: 'Portal do Cliente', contratada: true, papel: { id: 'membro', nome: 'Membro', sistema: true, implicito: false }, permissoes: ['portal.empresa.ver'] },
    { id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'vendedor', nome: 'Vendedor', sistema: true, implicito: false }, permissoes: ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar'] },
  ],
};

describe('AcessosService.get', () => {
  beforeEach(() => vi.clearAllMocks());

  it('faz GET /me/acessos da empresa ativa, com o id codificado, e devolve o corpo', async () => {
    mockGet.mockResolvedValue({ data: acessosDoVendedor });
    const resultado: MeusAcessos = await mod.AcessosService.get('TENANT#DEMO_REVIEW');
    expect(mockGet).toHaveBeenCalledWith('/me/acessos?tenant_id=TENANT%23DEMO_REVIEW');
    expect(resultado).toEqual(acessosDoVendedor);
  });
});

describe('recusa por permissão (403 com permissao)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as any).location;
    window.location = { ...originalLocation, href: 'http://localhost/kanban', pathname: '/kanban' } as any;
  });

  afterEach(() => {
    delete (window as any).location;
    window.location = originalLocation as any;
  });

  it('não leva para /acesso-negado: a tela mostra a mensagem', async () => {
    const erro = { response: { status: 403, data: { error: 'forbidden', permissao: 'crm.lead.excluir' } } };
    await expect(interceptores.erro(erro)).rejects.toEqual(erro);
    expect(window.location.href).toBe('http://localhost/kanban');
  });

  it('403 sem permissão nomeada continua indo para /acesso-negado', async () => {
    const erro = { response: { status: 403, data: { error: 'forbidden', permissao: '' } } };
    await expect(interceptores.erro(erro)).rejects.toEqual(erro);
    expect(window.location.href).toBe('/acesso-negado');
  });

  it('mensagemDeErro troca a mensagem padrão pela de permissão só no 403 com permissao', () => {
    const recusa = { response: { status: 403, data: { error: 'forbidden', permissao: 'crm.lead.excluir' } } };
    expect(mod.mensagemDeErro(recusa, 'Falha ao excluir lead')).toBe('Você não tem permissão para fazer isso nesta empresa.');
    expect(mod.mensagemDeErro({ response: { status: 500, data: {} } }, 'Falha ao excluir lead')).toBe('Falha ao excluir lead');
    expect(mod.mensagemDeErro(new Error('rede'), 'Falha ao excluir lead')).toBe('Falha ao excluir lead');
  });
});
