import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcessosProvider, useAcessosDoCRM, type PermissaoDoCRM } from './AcessosContext';
import { AcessosService, type MeusAcessos } from '@/services/api';
import { useTenant } from '@/contexts/TenantContext';

// spec: gestao-de-acesso-f4-aplicacao RF-05 (leitura de /me/acessos da empresa ativa).

vi.mock('@/services/api', () => ({
  AcessosService: { get: vi.fn() },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: vi.fn(),
}));

const todas: PermissaoDoCRM[] = ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar', 'crm.lead.excluir', 'crm.integracoes.gerir'];

function acessosCom(tenantId: string, crm: string[]): MeusAcessos {
  return {
    tenant_id: tenantId,
    operador: false,
    ferramentas: [
      // O Portal traz permissões com nome parecido: só as da ferramenta crm contam.
      { id: 'portal', nome: 'Portal do Cliente', contratada: true, papel: { id: 'administrador', nome: 'Administrador', sistema: true, implicito: false }, permissoes: ['portal.empresa.ver', 'crm.lead.excluir'] },
      { id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'vendedor', nome: 'Vendedor', sistema: true, implicito: false }, permissoes: crm },
    ],
  };
}

function Sonda() {
  const { carregando, erro, pode } = useAcessosDoCRM();
  return (
    <ul>
      <li>carregando: {String(carregando)}</li>
      <li>erro: {String(erro)}</li>
      {todas.map((p) => (
        <li key={p}>{p}: {String(pode(p))}</li>
      ))}
    </ul>
  );
}

function tenantAtivo(id: string) {
  (useTenant as any).mockReturnValue({ activeTenantId: id });
}

describe('AcessosProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantAtivo('t1');
  });

  it('enquanto carrega, nenhuma permissão vale', () => {
    (AcessosService.get as any).mockReturnValue(new Promise(() => {}));
    render(<AcessosProvider><Sonda /></AcessosProvider>);
    expect(screen.getByText('carregando: true')).toBeInTheDocument();
    for (const p of todas) expect(screen.getByText(`${p}: false`)).toBeInTheDocument();
  });

  it('carregado, vale só o que a ferramenta crm traz', async () => {
    (AcessosService.get as any).mockResolvedValue(acessosCom('t1', ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar']));
    render(<AcessosProvider><Sonda /></AcessosProvider>);
    await waitFor(() => expect(screen.getByText('carregando: false')).toBeInTheDocument());
    expect(AcessosService.get).toHaveBeenCalledWith('t1');
    expect(screen.getByText('crm.lead.ver: true')).toBeInTheDocument();
    expect(screen.getByText('crm.lead.criar: true')).toBeInTheDocument();
    expect(screen.getByText('crm.lead.editar: true')).toBeInTheDocument();
    expect(screen.getByText('crm.lead.excluir: false')).toBeInTheDocument();
    expect(screen.getByText('crm.integracoes.gerir: false')).toBeInTheDocument();
  });

  it('leitura falha: erro e nenhuma permissão (negar, nunca liberar)', async () => {
    (AcessosService.get as any).mockRejectedValue(new Error('rede'));
    render(<AcessosProvider><Sonda /></AcessosProvider>);
    await waitFor(() => expect(screen.getByText('erro: true')).toBeInTheDocument());
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
    for (const p of todas) expect(screen.getByText(`${p}: false`)).toBeInTheDocument();
  });

  it('troca de empresa relê, e a resposta atrasada da empresa anterior não vale', async () => {
    let responderT1: (v: MeusAcessos) => void = () => {};
    (AcessosService.get as any).mockImplementation((id: string) =>
      id === 't1'
        ? new Promise<MeusAcessos>((r) => { responderT1 = r; })
        : Promise.resolve(acessosCom('t2', ['crm.lead.ver'])),
    );
    const { rerender } = render(<AcessosProvider><Sonda /></AcessosProvider>);
    tenantAtivo('t2');
    rerender(<AcessosProvider><Sonda /></AcessosProvider>);
    await waitFor(() => expect(screen.getByText('crm.lead.ver: true')).toBeInTheDocument());
    await act(async () => {
      responderT1(acessosCom('t1', todas));
    });
    expect(AcessosService.get).toHaveBeenLastCalledWith('t2');
    expect(screen.getByText('crm.lead.excluir: false')).toBeInTheDocument();
  });

  it('na troca de empresa, as permissões da anterior deixam de valer antes da resposta nova', async () => {
    (AcessosService.get as any).mockImplementation((id: string) =>
      id === 't1' ? Promise.resolve(acessosCom('t1', todas)) : new Promise(() => {}),
    );
    const { rerender } = render(<AcessosProvider><Sonda /></AcessosProvider>);
    await waitFor(() => expect(screen.getByText('crm.lead.excluir: true')).toBeInTheDocument());
    tenantAtivo('t2');
    rerender(<AcessosProvider><Sonda /></AcessosProvider>);
    expect(screen.getByText('carregando: true')).toBeInTheDocument();
    for (const p of todas) expect(screen.getByText(`${p}: false`)).toBeInTheDocument();
  });

  it('sem empresa ativa, não lê e nada vale', () => {
    tenantAtivo('');
    render(<AcessosProvider><Sonda /></AcessosProvider>);
    expect(AcessosService.get).not.toHaveBeenCalled();
    for (const p of todas) expect(screen.getByText(`${p}: false`)).toBeInTheDocument();
  });

  it('fora do provider, nada vale', () => {
    render(<Sonda />);
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
    for (const p of todas) expect(screen.getByText(`${p}: false`)).toBeInTheDocument();
  });

  // gestao-de-acesso-f5 RF-07: Configurações decide a aba Equipe pela permissão do Portal, não por grupo ou role.
  it('podeNoPortal vale só o que a ferramenta portal traz, e nega enquanto carrega ou na falha', async () => {
    function SondaDoPortal() {
      const { podeNoPortal } = useAcessosDoCRM();
      return <p>portal.usuarios.gerir: {String(podeNoPortal('portal.usuarios.gerir'))}</p>;
    }
    const comGerir: MeusAcessos = {
      tenant_id: 't1',
      operador: false,
      ferramentas: [
        { id: 'portal', nome: 'Portal do Cliente', contratada: true, papel: { id: 'administrador', nome: 'Administrador', sistema: true, implicito: false }, permissoes: ['portal.empresa.ver', 'portal.usuarios.gerir'] },
        { id: 'crm', nome: 'CRM', contratada: true, papel: null, permissoes: ['portal.usuarios.gerir'] },
      ],
    };
    (AcessosService.get as any).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<AcessosProvider><SondaDoPortal /></AcessosProvider>);
    expect(screen.getByText('portal.usuarios.gerir: false')).toBeInTheDocument();
    unmount();

    (AcessosService.get as any).mockResolvedValue(comGerir);
    const r2 = render(<AcessosProvider><SondaDoPortal /></AcessosProvider>);
    await waitFor(() => expect(screen.getByText('portal.usuarios.gerir: true')).toBeInTheDocument());
    r2.unmount();

    // Membro: a permissão aparece só em outra ferramenta, não vale.
    (AcessosService.get as any).mockResolvedValue({ ...comGerir, ferramentas: [{ ...comGerir.ferramentas[0], permissoes: ['portal.empresa.ver'] }, comGerir.ferramentas[1]] });
    const r3 = render(<AcessosProvider><SondaDoPortal /></AcessosProvider>);
    await waitFor(() => expect(AcessosService.get).toHaveBeenCalledTimes(3));
    await act(async () => {});
    expect(screen.getByText('portal.usuarios.gerir: false')).toBeInTheDocument();
    r3.unmount();

    (AcessosService.get as any).mockRejectedValue(new Error('rede'));
    render(<AcessosProvider><SondaDoPortal /></AcessosProvider>);
    await act(async () => {});
    expect(screen.getByText('portal.usuarios.gerir: false')).toBeInTheDocument();
  });
});
