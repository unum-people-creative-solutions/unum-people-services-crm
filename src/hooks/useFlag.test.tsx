import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFlag } from './useFlag';
import { FlagsService } from '@/services/api';
import { useTenant } from '@/contexts/TenantContext';

// spec: crm-agendamento-e-lembretes RF-77 / CA-78.

vi.mock('@/services/api', () => ({
  FlagsService: { get: vi.fn() },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: vi.fn(),
}));

function Sonda() {
  return <p>flag: {String(useFlag('crm-agendamento'))}</p>;
}

function tenantAtivo(id: string | null) {
  (useTenant as any).mockReturnValue({ activeTenantId: id });
}

describe('useFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantAtivo('t1');
  });

  it('vale false enquanto a leitura não chega', () => {
    (FlagsService.get as any).mockReturnValue(new Promise(() => {}));
    render(<Sonda />);
    expect(screen.getByText('flag: false')).toBeInTheDocument();
    expect(FlagsService.get).toHaveBeenCalledWith('t1');
  });

  it('vale true quando a API devolve a chave ligada', async () => {
    (FlagsService.get as any).mockResolvedValue({ 'crm-agendamento': true, demonstracao: false });
    render(<Sonda />);
    expect(await screen.findByText('flag: true')).toBeInTheDocument();
  });

  it.each([
    ['desligada', { 'crm-agendamento': false }],
    ['ausente', { demonstracao: true }],
  ])('vale false com a chave %s', async (_nome, flags) => {
    (FlagsService.get as any).mockResolvedValue(flags);
    render(<Sonda />);
    await waitFor(() => expect(FlagsService.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('flag: false')).toBeInTheDocument();
  });

  it('vale false e registra no console quando a leitura falha', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    (FlagsService.get as any).mockRejectedValue(new Error('rede'));
    render(<Sonda />);
    await waitFor(() => expect(erro).toHaveBeenCalled());
    expect(screen.getByText('flag: false')).toBeInTheDocument();
    erro.mockRestore();
  });

  it('sem empresa ativa não chama a API', () => {
    tenantAtivo(null);
    render(<Sonda />);
    expect(FlagsService.get).not.toHaveBeenCalled();
    expect(screen.getByText('flag: false')).toBeInTheDocument();
  });

  it('na troca de empresa volta a false e relê com o id novo', async () => {
    (FlagsService.get as any).mockResolvedValueOnce({ 'crm-agendamento': true });
    const { rerender } = render(<Sonda />);
    expect(await screen.findByText('flag: true')).toBeInTheDocument();

    (FlagsService.get as any).mockReturnValueOnce(new Promise(() => {}));
    tenantAtivo('t2');
    rerender(<Sonda />);
    expect(screen.getByText('flag: false')).toBeInTheDocument();
    expect(FlagsService.get).toHaveBeenLastCalledWith('t2');
  });

  it('só a leitura mais recente vale', async () => {
    let resolverPrimeira: (v: unknown) => void = () => {};
    (FlagsService.get as any)
      .mockReturnValueOnce(new Promise((r) => { resolverPrimeira = r; }))
      .mockResolvedValueOnce({ 'crm-agendamento': false });
    const { rerender } = render(<Sonda />);
    tenantAtivo('t2');
    rerender(<Sonda />);
    await waitFor(() => expect(FlagsService.get).toHaveBeenLastCalledWith('t2'));
    resolverPrimeira({ 'crm-agendamento': true });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('flag: false')).toBeInTheDocument();
  });
});
