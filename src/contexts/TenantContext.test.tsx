import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantProvider, useTenant } from './TenantContext';
import { useAuthStore } from '@/store/authStore';
import { TenantService } from '@/services/api';

// Mocks
vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  TenantService: {
    list: vi.fn(),
    listMyTenants: vi.fn(),
  },
}));

// Test helper component to consume the context
const TestComponent = () => {
  const {
    activeTenantId,
    activeTenantName,
    availableTenants,
    isMultiTenant,
    switchTenant,
    isLoadingTenants,
  } = useTenant();

  return (
    <div>
      <div data-testid="active-id">{activeTenantId}</div>
      <div data-testid="active-name">{activeTenantName}</div>
      <div data-testid="is-multi">{isMultiTenant.toString()}</div>
      <div data-testid="is-loading">{isLoadingTenants.toString()}</div>
      <div data-testid="available-count">{availableTenants.length}</div>
      <button data-testid="switch-btn" onClick={() => switchTenant('tenant-B')}>
        Switch
      </button>
    </div>
  );
};

describe('TenantContext', () => {
  const mockTenants = [
    { id: 'tenant-A', nome_negocio: 'Alpha' },
    { id: 'tenant-B', nome_negocio: 'Beta' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();

    // Mock do useAuthStore retornando o tenantId primário como 'tenant-A'
    (useAuthStore as any).mockReturnValue({
      session: { tenantId: 'tenant-A' },
    });

    // Mock do listMyTenants retornando a lista de inquilinos
    (TenantService.listMyTenants as any).mockResolvedValue(mockTenants);
  });

  it('T01 — TenantContext: inicialização com tenant primário', async () => {
    render(
      <TenantProvider>
        <TestComponent />
      </TenantProvider>
    );

    // Deve mostrar carregamento e chamar a API para listar inquilinos do CRM
    expect(TenantService.listMyTenants).toHaveBeenCalledWith('crm');

    // Esperar concluir o carregamento
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    // Validar os valores iniciais correspondentes
    expect(screen.getByTestId('active-id')).toHaveTextContent('tenant-A');
    expect(screen.getByTestId('active-name')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('is-multi')).toHaveTextContent('true');
    expect(screen.getByTestId('available-count')).toHaveTextContent('2');
  });

  it('T02 — TenantContext: troca de tenant via switchTenant', async () => {
    const user = userEvent.setup();
    render(
      <TenantProvider>
        <TestComponent />
      </TenantProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    // Clicar no botão para alternar para tenant-B
    await user.click(screen.getByTestId('switch-btn'));

    // Validar alteração de estado no contexto
    expect(screen.getByTestId('active-id')).toHaveTextContent('tenant-B');
    expect(screen.getByTestId('active-name')).toHaveTextContent('Beta');

    // Validar armazenamento no sessionStorage
    expect(sessionStorage.getItem('active-tenant')).toBe('tenant-B');
  });

  it('T03 — TenantContext: persistência via sessionStorage', async () => {
    // Definir previamente o tenant no sessionStorage
    sessionStorage.setItem('active-tenant', 'tenant-B');

    render(
      <TenantProvider>
        <TestComponent />
      </TenantProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    // Deve inicializar com tenant-B a partir do sessionStorage e não com o tenant-A da session
    expect(screen.getByTestId('active-id')).toHaveTextContent('tenant-B');
    expect(screen.getByTestId('active-name')).toHaveTextContent('Beta');
  });

  it('T04 — TenantContext: usuário GlobalAdmin carrega via TenantService.list() (sem filtro de serviço)', async () => {
    (useAuthStore as any).mockReturnValue({
      session: { tenantId: 'tenant-A', role: 'GlobalAdmin' },
    });
    (TenantService.list as any).mockResolvedValue(mockTenants);

    render(
      <TenantProvider>
        <TestComponent />
      </TenantProvider>
    );

    await waitFor(() => {
      expect(TenantService.list).toHaveBeenCalledWith();
    });
    expect(TenantService.listMyTenants).not.toHaveBeenCalled();
  });

  it('T05 — TenantContext: ordena a lista mantendo inquilinos bloqueados no final', async () => {
    const mockTenantsWithBlocked = [
      { id: 'tenant-A', nome_negocio: 'Alpha', is_blocked: false },
      { id: 'tenant-B', nome_negocio: 'Beta Bloqueada', is_blocked: true },
      { id: 'tenant-C', nome_negocio: 'Gamma', is_blocked: false },
    ];
    (TenantService.listMyTenants as any).mockResolvedValue(mockTenantsWithBlocked);

    const OrderProbe = () => {
      const { availableTenants } = useTenant();
      return (
        <ul>
          {availableTenants.map((t: any) => (
            <li key={t.id} data-testid="tenant-order">{t.id}</li>
          ))}
        </ul>
      );
    };

    render(
      <TenantProvider>
        <OrderProbe />
      </TenantProvider>
    );

    await waitFor(() => {
      const ids = screen.getAllByTestId('tenant-order').map((el) => el.textContent);
      expect(ids).toEqual(['tenant-A', 'tenant-C', 'tenant-B']);
    });
  });

  it('T06 — TenantContext: switchTenant não altera o tenant ativo se o destino estiver bloqueado', async () => {
    const mockTenantsWithBlocked = [
      { id: 'tenant-A', nome_negocio: 'Alpha', is_blocked: false },
      { id: 'tenant-B', nome_negocio: 'Beta Bloqueada', is_blocked: true },
    ];
    (TenantService.listMyTenants as any).mockResolvedValue(mockTenantsWithBlocked);

    const user = userEvent.setup();
    const SwitchProbe = () => {
      const { activeTenantId, switchTenant } = useTenant();
      return (
        <div>
          <div data-testid="active-id">{activeTenantId}</div>
          <button data-testid="switch-to-blocked" onClick={() => switchTenant('tenant-B')}>
            Switch
          </button>
        </div>
      );
    };

    render(
      <TenantProvider>
        <SwitchProbe />
      </TenantProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('tenant-A');
    });

    await user.click(screen.getByTestId('switch-to-blocked'));

    // Tentativa de troca para inquilino bloqueado é ignorada
    expect(screen.getByTestId('active-id')).toHaveTextContent('tenant-A');
  });

  // O PendingTermsGate fica fora do TenantProvider e lê o tenant ativo do
  // sessionStorage. A seleção automática precisa ficar gravada lá também, ou o
  // aviso consulta o tenant do token enquanto a tela mostra outra empresa.
  it('T07 — grava no sessionStorage o primeiro tenant escolhido automaticamente', async () => {
    (useAuthStore as any).mockReturnValue({ session: { tenantId: 'tenant-fora-da-lista' } });

    render(
      <TenantProvider>
        <TestComponent />
      </TenantProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('tenant-A');
    });
    expect(sessionStorage.getItem('active-tenant')).toBe('tenant-A');
  });

  it('T08 — grava no sessionStorage o tenant inicial vindo da sessão', async () => {
    render(
      <TenantProvider>
        <TestComponent />
      </TenantProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });
    expect(sessionStorage.getItem('active-tenant')).toBe('tenant-A');
  });

  it('T09 — avisa a troca de tenant com o evento active-tenant-change', async () => {
    const user = userEvent.setup();
    const recebidos: string[] = [];
    const ouvir = (e: Event) => recebidos.push((e as CustomEvent<string>).detail);
    window.addEventListener('active-tenant-change', ouvir);

    render(
      <TenantProvider>
        <TestComponent />
      </TenantProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });
    await user.click(screen.getByTestId('switch-btn'));

    window.removeEventListener('active-tenant-change', ouvir);
    expect(recebidos.at(-1)).toBe('tenant-B');
  });
});
