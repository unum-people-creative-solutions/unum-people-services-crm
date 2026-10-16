import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TabTeam from './TabTeam';
import { TenantService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';

vi.mock('@/services/api', () => ({
  TenantService: {
    listUsers: vi.fn(),
    addUser: vi.fn(),
    updateUserRole: vi.fn(),
    removeUser: vi.fn(),
  },
}));
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

// riscos-acesso-empresa RF-08: a aba lista a empresa selecionada e, antes,
// convidava, mudava papel e removia na empresa do token. As três ações levam
// agora a empresa selecionada.
describe('TabTeam — empresa selecionada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (useAuthStore as any).mockReturnValue({ session: { role: 'TenantAdmin', email: 'admin@x.com' } });
    (useTenant as any).mockReturnValue({ activeTenantId: 'tenant-B' });
    (TenantService.listUsers as any).mockResolvedValue([
      { email: 'admin@x.com', name: 'Admin', role: 'admin' },
      { email: 'outro@x.com', name: 'Outro', role: 'admin' },
      { email: 'membro@x.com', name: 'Membro', role: 'user' },
    ]);
    (TenantService.addUser as any).mockResolvedValue({});
    (TenantService.updateUserRole as any).mockResolvedValue({});
    (TenantService.removeUser as any).mockResolvedValue({});
  });

  it('convidar manda a empresa selecionada', async () => {
    render(<TabTeam />);
    await screen.findByText('membro@x.com');

    fireEvent.click(screen.getByRole('button', { name: /Convidar Membro/i }));
    fireEvent.change(screen.getByPlaceholderText('Ex: Ana Silva'), { target: { value: 'Nova Pessoa' } });
    fireEvent.change(screen.getByPlaceholderText('ana@empresa.com'), { target: { value: 'nova@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Convite/i }));

    await waitFor(() => expect(TenantService.addUser).toHaveBeenCalled());
    expect(TenantService.addUser).toHaveBeenCalledWith(
      { name: 'Nova Pessoa', email: 'nova@x.com', role: 'user' },
      'tenant-B',
    );
  });

  it('mudar papel e remover mandam a empresa selecionada', async () => {
    render(<TabTeam />);
    await screen.findByText('membro@x.com');

    const papeis = screen.getAllByRole('button', { name: 'Alterar Acesso' });
    fireEvent.click(papeis[papeis.length - 1]);
    await waitFor(() => expect(TenantService.updateUserRole).toHaveBeenCalled());
    expect(TenantService.updateUserRole).toHaveBeenCalledWith('membro@x.com', 'TenantAdmin', 'tenant-B');

    const remocoes = screen.getAllByRole('button', { name: 'Remover Membro' });
    fireEvent.click(remocoes[remocoes.length - 1]);
    await waitFor(() => expect(TenantService.removeUser).toHaveBeenCalled());
    expect(TenantService.removeUser).toHaveBeenCalledWith('membro@x.com', 'tenant-B');
  });
});
