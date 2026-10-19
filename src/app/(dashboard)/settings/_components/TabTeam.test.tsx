import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabTeam from './TabTeam';
import { useTenant } from '@/contexts/TenantContext';

vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

// gestao-de-acesso-f3-portal-cliente RF-21, CA-11: a equipe passa a ser gerida
// no Portal do Cliente; a aba vira um link para a tela Usuários, na empresa ativa.
describe('TabTeam — equipe no Portal do Cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTenant).mockReturnValue({ activeTenantId: 'tenant-B' } as ReturnType<typeof useTenant>);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('explica a mudança e leva à tela Usuários do Portal na empresa ativa', () => {
    vi.stubEnv('NEXT_PUBLIC_CUSTOMERS_URL', '');
    render(<TabTeam />);
    expect(screen.getByRole('heading', { name: 'A equipe agora fica no Portal do Cliente' })).toBeInTheDocument();
    expect(screen.getByText('Lá você convida pessoas e escolhe o que cada uma pode fazer no CRM, no Blog e nas Páginas.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Usuários no Portal' })).toHaveAttribute(
      'href',
      'https://customer.unumpeople.com.br/usuarios?tenant_id=tenant-B',
    );
  });

  it('usa NEXT_PUBLIC_CUSTOMERS_URL e codifica a empresa', () => {
    vi.stubEnv('NEXT_PUBLIC_CUSTOMERS_URL', 'http://localhost:3002');
    vi.mocked(useTenant).mockReturnValue({ activeTenantId: 'a b&c' } as ReturnType<typeof useTenant>);
    render(<TabTeam />);
    expect(screen.getByRole('link', { name: 'Abrir Usuários no Portal' })).toHaveAttribute(
      'href',
      'http://localhost:3002/usuarios?tenant_id=a%20b%26c',
    );
  });

  it('sem empresa ativa, o link vai sem tenant_id', () => {
    vi.stubEnv('NEXT_PUBLIC_CUSTOMERS_URL', '');
    vi.mocked(useTenant).mockReturnValue({ activeTenantId: '' } as ReturnType<typeof useTenant>);
    render(<TabTeam />);
    expect(screen.getByRole('link', { name: 'Abrir Usuários no Portal' })).toHaveAttribute('href', 'https://customer.unumpeople.com.br/usuarios');
  });

  it('a aba não lista, não convida, não muda papel e não remove mais', () => {
    render(<TabTeam />);
    expect(screen.queryByRole('button', { name: /Convidar/ })).not.toBeInTheDocument();
  });
});
