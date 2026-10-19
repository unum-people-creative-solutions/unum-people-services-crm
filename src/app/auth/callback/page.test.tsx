import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AuthCallbackPage from './page';
import { useRouter, useSearchParams } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import { useAuthStore } from '@/store/authStore';
import { TenantService } from '@/services/api';
import { exchangeCodeForTokens, redirectToHostedUI } from '@/lib/pkce';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  TenantService: {
    listMyTenants: vi.fn(),
  },
}));

vi.mock('@/lib/pkce', () => ({
  exchangeCodeForTokens: vi.fn(),
  redirectToHostedUI: vi.fn(),
  PKCE_VERIFIER_STORAGE_KEY: 'pkce_code_verifier',
  AUTH_RETURN_TO_STORAGE_KEY: 'auth_return_to',
}));

describe('AuthCallbackPage (TASK-FE-CRM-002)', () => {
  const mockPush = vi.fn();
  const mockSetSession = vi.fn();

  const makeSearchParams = (code: string | null) => ({
    get: (key: string) => (key === 'code' ? code : null),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (useAuthStore as any).mockImplementation((selector: any) =>
      selector({ setSession: mockSetSession })
    );
    (jwtDecode as any).mockReturnValue({
      email: 'user@example.com',
      name: 'User Example',
      'custom:tenant_id': 'tenant-jwt-default',
      'cognito:groups': [],
    });
    (exchangeCodeForTokens as any).mockResolvedValue({
      id_token: 'id-token-abc',
      access_token: 'access-token-abc',
      expires_in: 3600,
      token_type: 'Bearer',
    });
  });

  it('exibe erro e não troca código quando o code_verifier não está em sessionStorage (sessão de PKCE perdida)', async () => {
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    // sessionStorage sem 'pkce_code_verifier'

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText(/sessão de login inválida ou expirada/i)).toBeInTheDocument();
    });
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('troca code+verifier por tokens, decodifica claims e chama setSession (RNF-PCT-03)', async () => {
    window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    (TenantService.listMyTenants as any)
      .mockResolvedValueOnce([{ id: 'tenant-1', nome_negocio: 'Empresa 1' }]) // allMyTenants
      .mockResolvedValueOnce([{ id: 'tenant-1', nome_negocio: 'Empresa 1' }]); // myTenants (crm)

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(exchangeCodeForTokens).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'auth-code-123', codeVerifier: 'verifier-abc' })
      );
    });

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          tenantId: 'tenant-1',
          tenantName: 'Empresa 1',
          role: 'USER',
          token: 'id-token-abc',
        })
      );
    });
  });

  it('consome o code_verifier uma única vez (removido de sessionStorage após a leitura)', async () => {
    window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    (TenantService.listMyTenants as any).mockResolvedValue([{ id: 't1', nome_negocio: 'E1' }]);

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(exchangeCodeForTokens).toHaveBeenCalled();
    });
    expect(window.sessionStorage.getItem('pkce_code_verifier')).toBeNull();
  });

  it('redireciona para a rota originalmente pretendida (auth_return_to) quando o usuário tem plano compatível', async () => {
    window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
    window.sessionStorage.setItem('auth_return_to', '/kanban/board-42');
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    (TenantService.listMyTenants as any).mockResolvedValue([{ id: 't1', nome_negocio: 'E1' }]);

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/kanban/board-42');
    });
  });

  it('redireciona para /onboarding quando o usuário não possui nenhum tenant', async () => {
    window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    (TenantService.listMyTenants as any).mockResolvedValueOnce([]); // allMyTenants vazio

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('bloqueia com mensagem de plano quando o usuário tem tenant mas nenhum compatível com CRM (não-GlobalAdmin)', async () => {
    window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    (TenantService.listMyTenants as any)
      .mockResolvedValueOnce([{ id: 't1', nome_negocio: 'E1' }]) // allMyTenants
      .mockResolvedValueOnce([]); // myTenants (crm) vazio

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText(/não faz parte do seu plano atual/i)).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalledWith('/kanban');
    expect(mockPush).not.toHaveBeenCalledWith('/tenants');
  });

  it('GlobalAdmin sem tenant compatível com CRM é redirecionado para /tenants (não bloqueado pelo plano)', async () => {
    window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    (jwtDecode as any).mockReturnValue({
      email: 'admin@example.com',
      'custom:tenant_id': 'tenant-x',
      'cognito:groups': ['GlobalAdmin'],
    });
    (TenantService.listMyTenants as any)
      .mockResolvedValueOnce([{ id: 't1', nome_negocio: 'E1' }]) // allMyTenants
      .mockResolvedValueOnce([]); // myTenants (crm) vazio

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/tenants');
    });
  });

  it('falha na troca de código nunca autentica silenciosamente — mostra erro e não chama setSession', async () => {
    window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
    (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
    (exchangeCodeForTokens as any).mockRejectedValue(new Error('invalid_grant'));

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText(/não foi possível concluir o login/i)).toBeInTheDocument();
    });
    // Nunca autentica silenciosamente: setSession nunca recebe uma sessão válida (com token) neste cenário.
    expect(mockSetSession).not.toHaveBeenCalledWith(expect.objectContaining({ token: expect.anything() }));
  });

  it('botão de "tentar novamente" no erro aciona redirectToHostedUI', async () => {
    (useSearchParams as any).mockReturnValue(makeSearchParams(null));

    render(<AuthCallbackPage />);

    const retryButton = await screen.findByText(/tentar novamente/i);
    retryButton.click();

    expect(redirectToHostedUI).toHaveBeenCalled();
  });

  // gestao-de-acesso-f5 RF-07: o grupo TenantAdmin não vira papel na sessão; só o operador é marcado.
  it('grupo TenantAdmin no token não vira role; GlobalAdmin vira', async () => {
    for (const [grupos, role] of [[['TenantAdmin'], 'USER'], [['TenantAdmin', 'Admins'], 'USER'], [['GlobalAdmin'], 'GlobalAdmin']] as const) {
      vi.clearAllMocks();
      (useRouter as any).mockReturnValue({ push: mockPush });
      (useAuthStore as any).mockImplementation((selector: any) => selector({ setSession: mockSetSession }));
      (exchangeCodeForTokens as any).mockResolvedValue({ id_token: 'id-token-abc', access_token: 'a', expires_in: 3600, token_type: 'Bearer' });
      (jwtDecode as any).mockReturnValue({ email: 'user@example.com', 'custom:tenant_id': 't1', 'cognito:groups': grupos });
      window.sessionStorage.setItem('pkce_code_verifier', 'verifier-abc');
      (useSearchParams as any).mockReturnValue(makeSearchParams('auth-code-123'));
      (TenantService.listMyTenants as any).mockResolvedValue([{ id: 't1', nome_negocio: 'E1' }]);

      const { unmount } = render(<AuthCallbackPage />);
      await waitFor(() => expect(mockSetSession).toHaveBeenCalled());
      expect(mockSetSession.mock.calls[0][0].role).toBe(role);
      unmount();
    }
  });
});
