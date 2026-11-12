import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFunil } from './useFunil';
import { FunilService, type Funil } from '@/services/api';
import { useTenant } from '@/contexts/TenantContext';
import funilPadraoJson from '@/services/__fixtures__/get-crm-funil-padrao.json';
import funilSalvoJson from '@/services/__fixtures__/put-crm-funil-6-etapas.json';

// spec: crm-funil-e-atividades-f1 FUN-02, FUN-04 (T21).

const funilPadrao = funilPadraoJson as Funil;
const funilSalvo = funilSalvoJson as Funil;
const idsPadrao = 'NOVO,ATENDIMENTO,AGENDADO,GANHO,PERDIDO';
const idsSalvo = 'NOVO,ATENDIMENTO,E7K2M9QXA4B,AGENDADO,GANHO,PERDIDO';

vi.mock('@/services/api', () => ({
  FunilService: { ler: vi.fn() },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: vi.fn(),
}));

function Sonda() {
  const { funil, carregando, erro, recarregar, substituir } = useFunil();
  const ids = funil ? funil.etapas.map((etapa) => etapa.id).join(',') : 'null';
  return (
    <div>
      <p>carregando: {String(carregando)}</p>
      <p>erro: {String(erro)}</p>
      <p>versao: {funil ? String(funil.versao) : 'null'}</p>
      <p>funil: {ids}</p>
      <button type="button" onClick={recarregar}>Recarregar</button>
      <button type="button" onClick={() => substituir(funilSalvo)}>Substituir</button>
    </div>
  );
}

function tenantAtivo(id: string | null) {
  (useTenant as any).mockReturnValue({ activeTenantId: id });
}

describe('useFunil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantAtivo('t1');
  });

  it('carrega o funil da empresa ativa', async () => {
    let resolver: (v: Funil) => void = () => {};
    (FunilService.ler as any).mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<Sonda />);

    expect(FunilService.ler).toHaveBeenCalledWith('t1');
    expect(screen.getByText('carregando: true')).toBeInTheDocument();
    expect(screen.getByText('funil: null')).toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();

    resolver(funilPadrao);
    expect(await screen.findByText('versao: 0')).toBeInTheDocument();
    expect(screen.getByText(`funil: ${idsPadrao}`)).toBeInTheDocument();
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();
  });

  it('na troca de empresa volta o funil a null e relê com o id novo', async () => {
    (FunilService.ler as any).mockResolvedValueOnce(funilPadrao);
    const { rerender } = render(<Sonda />);
    expect(await screen.findByText('versao: 0')).toBeInTheDocument();
    expect(screen.getByText(`funil: ${idsPadrao}`)).toBeInTheDocument();

    (FunilService.ler as any).mockReturnValueOnce(new Promise(() => {}));
    tenantAtivo('t2');
    rerender(<Sonda />);

    expect(screen.getByText('funil: null')).toBeInTheDocument();
    expect(screen.queryByText('versao: 0')).not.toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();
    expect(FunilService.ler).toHaveBeenLastCalledWith('t2');
  });

  it('descarta a resposta atrasada da empresa anterior', async () => {
    let resolverPrimeira: (v: Funil) => void = () => {};
    (FunilService.ler as any)
      .mockReturnValueOnce(new Promise((r) => { resolverPrimeira = r; }))
      .mockResolvedValueOnce(funilSalvo);
    const { rerender } = render(<Sonda />);

    tenantAtivo('t2');
    rerender(<Sonda />);
    expect(await screen.findByText('versao: 1')).toBeInTheDocument();
    expect(screen.getByText(`funil: ${idsSalvo}`)).toBeInTheDocument();

    resolverPrimeira(funilPadrao);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('versao: 1')).toBeInTheDocument();
    expect(screen.getByText(`funil: ${idsSalvo}`)).toBeInTheDocument();
    expect(screen.queryByText(`funil: ${idsPadrao}`)).not.toBeInTheDocument();
  });

  it('erro de leitura deixa erro true e funil null', async () => {
    (FunilService.ler as any).mockRejectedValue(new Error('rede'));
    render(<Sonda />);
    expect(await screen.findByText('erro: true')).toBeInTheDocument();
    expect(screen.getByText('funil: null')).toBeInTheDocument();
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
  });

  it('recarregar lê o funil de novo', async () => {
    let resolverPrimeira: (v: Funil) => void = () => {};
    let resolverSegunda: (v: Funil) => void = () => {};
    (FunilService.ler as any)
      .mockReturnValueOnce(new Promise((r) => { resolverPrimeira = r; }))
      .mockReturnValueOnce(new Promise((r) => { resolverSegunda = r; }));
    render(<Sonda />);
    resolverPrimeira(funilPadrao);
    expect(await screen.findByText('versao: 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(FunilService.ler).toHaveBeenCalledTimes(2);
    expect(FunilService.ler).toHaveBeenLastCalledWith('t1');

    resolverSegunda(funilSalvo);
    expect(await screen.findByText('versao: 1')).toBeInTheDocument();
    expect(screen.getByText(`funil: ${idsSalvo}`)).toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();
  });

  it('substituir mostra o funil recebido e a leitura atrasada não o apaga', async () => {
    let resolver: (v: Funil) => void = () => {};
    (FunilService.ler as any).mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<Sonda />);

    fireEvent.click(screen.getByRole('button', { name: 'Substituir' }));
    expect(screen.getByText('versao: 1')).toBeInTheDocument();
    expect(screen.getByText(`funil: ${idsSalvo}`)).toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();
    expect(FunilService.ler).toHaveBeenCalledTimes(1);

    resolver(funilPadrao);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('versao: 1')).toBeInTheDocument();
    expect(screen.getByText(`funil: ${idsSalvo}`)).toBeInTheDocument();
  });

  it('sem empresa ativa não chama a API e o funil fica null', () => {
    tenantAtivo(null);
    render(<Sonda />);
    expect(FunilService.ler).not.toHaveBeenCalled();
    expect(screen.getByText('funil: null')).toBeInTheDocument();
    expect(screen.getByText('erro: false')).toBeInTheDocument();
    expect(screen.getByText('carregando: false')).toBeInTheDocument();
  });
});
