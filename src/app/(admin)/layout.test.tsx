import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AdminLayout from './layout';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/store/authStore';
import { AcessosService, TenantService } from '@/services/api';

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  TenantService: {
    list: vi.fn(),
    listMyTenants: vi.fn(),
  },
  AcessosService: {
    get: vi.fn(() => new Promise(() => {})),
  },
}));

// Componente sonda: qualquer página/Navbar do grupo (admin) chama useTenant()
// (ex.: Navbar.tsx). Se o layout não envolver os filhos com TenantProvider,
// isso lança "useTenant must be used within a TenantProvider".
const Probe = () => {
  const { isLoadingTenants } = useTenant();
  return <div data-testid="probe">{isLoadingTenants.toString()}</div>;
};

describe('(admin) layout', () => {
  it('deve envolver os filhos com TenantProvider, para que useTenant() não lance erro', async () => {
    (useAuthStore as any).mockReturnValue({ session: { tenantId: 't-1', role: 'GlobalAdmin' } });
    (TenantService.list as any).mockResolvedValue([]);

    render(
      <AdminLayout>
        <Probe />
      </AdminLayout>
    );

    expect(await screen.findByTestId('probe')).toBeInTheDocument();
  });

  // gestao-de-acesso-f4 RF-05: o Google Ads da Navbar lê as permissões da empresa ativa.
  it('deve envolver os filhos com AcessosProvider, que lê /me/acessos da empresa ativa', async () => {
    (useAuthStore as any).mockReturnValue({ session: { tenantId: 't-1', role: 'GlobalAdmin' } });
    (TenantService.list as any).mockResolvedValue([]);

    render(
      <AdminLayout>
        <Probe />
      </AdminLayout>
    );

    await screen.findByTestId('probe');
    expect(AcessosService.get).toHaveBeenCalledWith('t-1');
  });
});
