import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOrigens } from './useOrigens';
import { OrigensService, type Origens } from '@/services/api';
import { useTenant } from '@/contexts/TenantContext';
import origensPadraoJson from '@/services/__fixtures__/get-crm-origens-padrao.json';
import origensSalvasJson from '@/services/__fixtures__/put-crm-origens-feira.json';

// spec: crm-origens-personalizadas T15 (hook), RF-OR-04, RF-OR-10.

const origensPadrao = origensPadraoJson as Origens;
const origensSalvas = origensSalvasJson as Origens;

vi.mock('@/services/api', async () => {
  const real = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  return { ORIGENS_PADRAO: real.ORIGENS_PADRAO, OrigensService: { ler: vi.fn() } };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: vi.fn(),
}));

function Sonda() {
  const { origens, carregando, erro, recarregar, substituir } = useOrigens();
  return (
    <div>
      <p>carregando: {String(carregando)}</p>
      <p>erro: {String(erro)}</p>
      <p>versao: {origens ? String(origens.versao) : 'null'}</p>
      <p>itens: {origens ? origens.itens.join(',') : 'null'}</p>
      <button type="button" onClick={recarregar}>Recarregar</button>
      <button type="button" onClick={() => substituir(origensSalvas)}>Substituir</button>
    </div>
  );
}

function tenantAtivo(id: string | null) {
  (useTenant as any).mockReturnValue({ activeTenantId: id });
}

describe('useOrigens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantAtivo('t1');
  });

  it('carrega as origens da empresa ativa', async () => {
    let resolver: (v: Origens) => void = () => {};
    (OrigensService.ler as any).mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<Sonda />);

    expect(OrigensService.ler).toHaveBeenCalledWith('t1');
    expect(screen.getByText('carregando: true')).toBeInTheDocument();
    expect(screen.getByText('itens: null')).toBeInTheDocument();

    resolver(origensPadrao);
    expect(await screen.findByText('versao: 0')).toBeInTheDocument();
    expect(screen.getByText('itens: Indicação,WhatsApp,Instagram,Facebook,Outro')).toBeInTheDocument();
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();
  });

  it('na troca de empresa descarta as origens anteriores e relê com o id novo', async () => {
    (OrigensService.ler as any).mockResolvedValueOnce(origensSalvas);
    const { rerender } = render(<Sonda />);
    expect(await screen.findByText('versao: 1')).toBeInTheDocument();

    (OrigensService.ler as any).mockReturnValueOnce(new Promise(() => {}));
    tenantAtivo('t2');
    rerender(<Sonda />);

    expect(screen.getByText('itens: null')).toBeInTheDocument();
    expect(OrigensService.ler).toHaveBeenLastCalledWith('t2');
  });

  it('erro de leitura deixa erro true e origens null', async () => {
    (OrigensService.ler as any).mockRejectedValue(new Error('rede'));
    render(<Sonda />);
    expect(await screen.findByText('erro: true')).toBeInTheDocument();
    expect(screen.getByText('itens: null')).toBeInTheDocument();
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
  });

  it('recarregar lê de novo', async () => {
    (OrigensService.ler as any).mockResolvedValueOnce(origensPadrao).mockResolvedValueOnce(origensSalvas);
    render(<Sonda />);
    expect(await screen.findByText('versao: 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(await screen.findByText('versao: 1')).toBeInTheDocument();
    expect(OrigensService.ler).toHaveBeenCalledTimes(2);
  });

  it('substituir mostra a lista recebida e a leitura atrasada não a apaga', async () => {
    let resolver: (v: Origens) => void = () => {};
    (OrigensService.ler as any).mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<Sonda />);

    fireEvent.click(screen.getByRole('button', { name: 'Substituir' }));
    expect(screen.getByText('versao: 1')).toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();

    resolver(origensPadrao);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('versao: 1')).toBeInTheDocument();
  });

  it('sem empresa ativa não chama a API', () => {
    tenantAtivo(null);
    render(<Sonda />);
    expect(OrigensService.ler).not.toHaveBeenCalled();
    expect(screen.getByText('itens: null')).toBeInTheDocument();
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
  });
});
