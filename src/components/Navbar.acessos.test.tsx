import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Navbar from './Navbar';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { AcessosService, type MeusAcessos } from '@/services/api';

// A conexão do Google Ads ficou na aba Configurações. O menu não oferece mais o link,
// nem para quem tem crm.integracoes.gerir nem para o GlobalAdmin.

vi.mock('@/lib/pkce', () => ({ logoutFromHostedUI: vi.fn() }));
vi.mock('next/image', () => ({ default: ({ src, alt }: any) => <img src={src} alt={alt} /> }));
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));
vi.mock('@/services/api', () => ({ AcessosService: { get: vi.fn() } }));

function acessos(crm: string[]): MeusAcessos {
  return {
    tenant_id: 'tenant-A',
    operador: false,
    ferramentas: [{ id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'gestor', nome: 'Gestor', sistema: true, implicito: false }, permissoes: crm }],
  };
}

function sessao(role: string) {
  (useAuthStore as any).mockReturnValue({ session: { name: 'Ana', role }, logout: vi.fn() });
}

async function abrirMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
  await screen.findAllByRole('link', { name: /Central de Ajuda/i });
}

describe('Navbar: o menu não conecta o Google Ads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessao('User');
    (useTenant as any).mockReturnValue({
      activeTenantId: 'tenant-A',
      activeTenantName: 'Alpha',
      availableTenants: [{ id: 'tenant-A', nome_negocio: 'Alpha' }],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
  });

  it('não aparece nem com crm.integracoes.gerir', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(['crm.lead.ver', 'crm.integracoes.gerir']));
    render(<AcessosProvider><Navbar /></AcessosProvider>);
    await abrirMenu();
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /MCC|Agência/i })).not.toBeInTheDocument();
  });

  it('não aparece sem crm.integracoes.gerir', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar']));
    render(<AcessosProvider><Navbar /></AcessosProvider>);
    await abrirMenu();
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
  });

  it('o operador sem empresa ativa também não vê o link', async () => {
    sessao('GlobalAdmin');
    (useTenant as any).mockReturnValue({
      activeTenantId: null,
      activeTenantName: '',
      availableTenants: [],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
    render(<Navbar />);
    await abrirMenu();
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
  });

  it('o operador com empresa ativa conecta pela aba, não pelo menu', async () => {
    sessao('GlobalAdmin');
    render(<Navbar />);
    await abrirMenu();
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Agência/i)).not.toBeInTheDocument();
  });
});
