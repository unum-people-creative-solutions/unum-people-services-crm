import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SettingsPage from './page';
import { useAuthStore } from '@/store/authStore';
import * as pushHooks from '@/hooks/usePushNotifications';
import { TenantService } from '@/services/api';
import { useTenant } from '@/contexts/TenantContext';

// Mocks
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/store/authStore', () => {
  const store = vi.fn();
  (store as any).getState = vi.fn(() => ({
    session: {
      name: 'Jared Evans',
      email: 'jared@test.com',
      tenantName: 'Unum Corp',
      role: 'Admin',
      tenantId: 't-123'
    },
    logout: vi.fn()
  }));
  return { useAuthStore: store };
});

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(() => ({
    isSubscribed: false,
    subscribeUser: vi.fn(),
    unsubscribeUser: vi.fn(),
    loading: false,
    permission: 'default',
  })),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: vi.fn(),
}));

const podeNoPortal = vi.hoisted(() => vi.fn());
const leitura = vi.hoisted(() => ({ erro: false }));
vi.mock('@/contexts/AcessosContext', () => ({
  useAcessosDoCRM: () => ({ carregando: false, erro: leitura.erro, pode: () => false, podeNoPortal }),
}));

vi.mock('@/services/api', () => ({
  TenantService: {
    deleteAccount: vi.fn().mockResolvedValue({}),
  }
}));

// Mock do Blob e URL
class MockBlob {
  content: any[];
  options: any;
  constructor(content: any[], options: any) {
    this.content = content;
    this.options = options;
  }
}
global.Blob = MockBlob as any;
global.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
global.URL.revokeObjectURL = vi.fn();

describe('SettingsPage', () => {
  const mockSession = {
    name: 'Jared Evans',
    email: 'jared@test.com',
    tenantName: 'Unum Corp',
    role: 'Admin',
    tenantId: 't-123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    podeNoPortal.mockImplementation((p: string) => p === 'portal.usuarios.gerir');
    leitura.erro = false;
    (useAuthStore as any).mockReturnValue({ session: mockSession });
    // Reset para o mock padrão do hook
    (pushHooks.usePushNotifications as any).mockReturnValue({
      isSubscribed: false,
      subscribeUser: vi.fn(),
      unsubscribeUser: vi.fn(),
      loading: false,
      permission: 'default',
    });
    (useTenant as any).mockReturnValue({
      activeTenantId: 't-123',
      activeTenantName: 'Unum Corp',
      availableTenants: [{ id: 't-123', nome_negocio: 'Unum Corp' }],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
  });

  it('deve renderizar as informações do usuário e do vínculo profissional corretamente', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Jared Evans')).toBeInTheDocument();
    expect(screen.getByText('jared@test.com')).toBeInTheDocument();
    expect(screen.getByText('Unum Corp')).toBeInTheDocument();
    expect(screen.getByText('Vínculo Profissional')).toBeInTheDocument();
    expect(screen.getByText('Nome do Negócio / Empresa')).toBeInTheDocument();
  });

  it('deve exibir aviso quando a permissão de notificação for negada', () => {
    (pushHooks.usePushNotifications as any).mockReturnValue({
      isSubscribed: false,
      subscribeUser: vi.fn(),
      unsubscribeUser: vi.fn(),
      loading: false,
      permission: 'denied',
    });

    render(<SettingsPage />);

    expect(screen.getByText(/Notificações bloqueadas no seu navegador/i)).toBeInTheDocument();
  });

  it('deve disparar o fluxo de exportação de dados (LGPD)', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const exportBtn = screen.getByText(/Exportar Meus Dados/i).closest('button');
    if (!exportBtn) throw new Error('Botão não encontrado');
    
    await user.click(exportBtn);

    expect(screen.getByText('Processando...')).toBeInTheDocument();
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('deve abrir o modal de exclusão, exigir a palavra "excluir" e confirmar', async () => {
    const user = userEvent.setup();
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<SettingsPage />);

    const openModalBtn = screen.getByRole('button', { name: /Solicitar Exclusão/i });
    await user.click(openModalBtn);

    // Verifica se o modal abriu e mostra os avisos
    expect(screen.getByText('Confirmar Exclusão?')).toBeInTheDocument();
    expect(screen.getByText('Atenção Crítica')).toBeInTheDocument();
    expect(screen.getAllByText(/Você perderá acesso imediato ao sistema/i).length).toBeGreaterThanOrEqual(1);

    const confirmBtn = screen.getByRole('button', { name: /Sim, excluir permanentemente/i });
    const input = screen.getByPlaceholderText('Digite excluir');

    // Botão deve estar desabilitado inicialmente
    expect(confirmBtn).toBeDisabled();

    // Digitar algo incorreto
    await user.type(input, 'cancelar');
    expect(confirmBtn).toBeDisabled();

    // Digitar "excluir"
    await user.clear(input);
    await user.type(input, 'excluir');
    expect(confirmBtn).not.toBeDisabled();

    // Confirmar
    await user.click(confirmBtn);
    expect(alertMock).toHaveBeenCalledWith('Sua conta foi desativada e a solicitação de exclusão foi registrada.');

    alertMock.mockRestore();
  });

  describe('SettingsPage - Tabs & Team Management (QA RED)', () => {
    it('T01 - deve ver a aba "Minha Conta" ativa e o conteúdo pessoal ao carregar a página', () => {
      render(<SettingsPage />);
      
      const tabMyAccount = screen.getByRole('tab', { name: /minha conta/i });
      expect(tabMyAccount).toBeInTheDocument();
      // Em uma biblioteca de abas moderna, a aba ativa costuma ter aria-selected="true" ou atributo similar
      expect(tabMyAccount).toHaveAttribute('aria-selected', 'true');
      
      // Verifica se o conteúdo pessoal (já testado acima, mas garantindo a visibilidade na aba certa)
      expect(screen.getByText('Jared Evans')).toBeInTheDocument();
      expect(screen.getByText('jared@test.com')).toBeInTheDocument();
    });

    // gestao-de-acesso-f5 RF-07: a aba Equipe depende de portal.usuarios.gerir, não do role nem do grupo TenantAdmin.
    it('T02 - oculta a aba "Equipe" sem portal.usuarios.gerir, mesmo com role ou grupo antigo de admin', () => {
      podeNoPortal.mockReturnValue(false);
      const token = `x.${btoa(JSON.stringify({ 'cognito:groups': ['TenantAdmin', 'admin'] }))}.y`;
      (useAuthStore as any).mockReturnValue({
        session: { ...mockSession, role: 'TenantAdmin', token }
      });
      render(<SettingsPage />);

      expect(screen.queryByRole('tab', { name: /equipe/i })).not.toBeInTheDocument();
    });

    it('T02 - exibe a aba "Equipe" para quem tem portal.usuarios.gerir na empresa ativa', () => {
      (useAuthStore as any).mockReturnValue({ session: { ...mockSession, role: 'USER' } });
      render(<SettingsPage />);

      expect(podeNoPortal).toHaveBeenCalledWith('portal.usuarios.gerir');
      expect(screen.getByRole('tab', { name: /equipe/i })).toBeInTheDocument();
    });

    it('T02 - exibe a aba "Equipe" para o operador (GlobalAdmin)', () => {
      podeNoPortal.mockReturnValue(false);
      (useAuthStore as any).mockReturnValue({ session: { ...mockSession, role: 'GlobalAdmin' } });
      render(<SettingsPage />);

      expect(screen.getByRole('tab', { name: /equipe/i })).toBeInTheDocument();
    });

    // A aba Equipe some quando /me/acessos falha (negar, nunca liberar); a pessoa precisa saber por quê.
    it('T02 - avisa quando as permissões não carregaram, em vez de só esconder a aba', () => {
      leitura.erro = true;
      podeNoPortal.mockReturnValue(false);
      (useAuthStore as any).mockReturnValue({ session: { ...mockSession, role: 'USER' } });
      render(<SettingsPage />);

      expect(screen.queryByRole('tab', { name: /equipe/i })).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar suas permissões nesta empresa. A aba Equipe pode não aparecer. Recarregue a página para tentar de novo.');
    });

    it('T02 - sem falha na leitura, não há aviso', () => {
      render(<SettingsPage />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // gestao-de-acesso-f3-portal-cliente RF-21: a gestão da equipe (convite, papel,
    // remoção — antes T03 a T09) foi para o Portal do Cliente; a aba leva para lá.
    it('T03 - a aba "Equipe" leva à tela Usuários do Portal do Cliente, na empresa ativa', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: /equipe/i }));

      expect(screen.getByRole('link', { name: 'Abrir Usuários no Portal' })).toHaveAttribute(
        'href',
        expect.stringMatching(/\/usuarios\?tenant_id=t-123$/),
      );
      expect(screen.queryByRole('button', { name: /convidar membro/i })).not.toBeInTheDocument();
    });
  });
});
