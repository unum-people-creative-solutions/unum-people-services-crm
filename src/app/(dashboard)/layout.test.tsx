import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DashboardLayout from './layout';
import { useAcessosDoCRM } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { AcessosService, TenantService } from '@/services/api';

// spec: gestao-de-acesso-f4-aplicacao RF-05 — o Kanban e a Navbar leem as
// permissões do provider; sem ele no layout, tudo ficaria escondido.

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  TenantService: { list: vi.fn(), listMyTenants: vi.fn() },
  AcessosService: { get: vi.fn() },
}));

const Sonda = () => {
  const { carregando, pode } = useAcessosDoCRM();
  return <div>{carregando ? 'carregando' : `ver: ${pode('crm.lead.ver')}`}</div>;
};

describe('(dashboard) layout', () => {
  it('envolve os filhos com o AcessosProvider da empresa ativa', async () => {
    (useAuthStore as any).mockReturnValue({ session: { tenantId: 't-1', role: 'USER' } });
    (TenantService.listMyTenants as any).mockResolvedValue([{ id: 't-1', nome_negocio: 'Loja' }]);
    (AcessosService.get as any).mockResolvedValue({
      tenant_id: 't-1',
      operador: false,
      ferramentas: [{ id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'vendedor', nome: 'Vendedor', sistema: true, implicito: false }, permissoes: ['crm.lead.ver'] }],
    });

    render(
      <DashboardLayout>
        <Sonda />
      </DashboardLayout>
    );

    expect(await screen.findByText('ver: true')).toBeInTheDocument();
    expect(AcessosService.get).toHaveBeenCalledWith('t-1');
  });
});
