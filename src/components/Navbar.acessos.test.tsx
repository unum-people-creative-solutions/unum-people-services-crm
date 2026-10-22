import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Navbar from './Navbar';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { AcessosService, type MeusAcessos } from '@/services/api';
import { getGoogleAdsAuthUrl } from '@/lib/google-ads';

// spec: gestao-de-acesso-f4-aplicacao RF-05 (Conectar o Google Ads exige crm.integracoes.gerir).

vi.mock('@/lib/pkce', () => ({ logoutFromHostedUI: vi.fn() }));
vi.mock('next/image', () => ({ default: ({ src, alt }: any) => <img src={src} alt={alt} /> }));
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/lib/google-ads', () => ({ getGoogleAdsAuthUrl: vi.fn(() => 'https://ads-auth-url.com') }));
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

describe('Navbar: Conectar o Google Ads', () => {
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

  it('aparece com crm.integracoes.gerir', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(['crm.lead.ver', 'crm.integracoes.gerir']));
    const user = userEvent.setup();
    render(<AcessosProvider><Navbar /></AcessosProvider>);
    await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
    expect((await screen.findAllByRole('link', { name: /Conectar Google Ads/i })).length).toBeGreaterThan(0);
  });

  it('some sem crm.integracoes.gerir', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar']));
    const user = userEvent.setup();
    render(<AcessosProvider><Navbar /></AcessosProvider>);
    await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
    await screen.findAllByRole('link', { name: /Central de Ajuda/i });
    expect(AcessosService.get).toHaveBeenCalledWith('tenant-A');
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
  });

  // Verifier I2: sem empresa ativa o link levaria ao Google e falharia na volta.
  it('o operador sem empresa ativa não vê o link', async () => {
    sessao('GlobalAdmin');
    (useTenant as any).mockReturnValue({
      activeTenantId: null,
      activeTenantName: '',
      availableTenants: [],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
    const user = userEvent.setup();
    render(<Navbar />);
    await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
    await screen.findAllByRole('link', { name: /Central de Ajuda/i });
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
  });

  // google-ads-conectar-no-admin RF-06: a conta da plataforma se conecta só pelo
  // painel admin; no CRM o operador conecta o tenant ativo, como todo mundo.
  it('o operador conecta o tenant ativo, sem "(MCC)" nem "agência"', async () => {
    sessao('GlobalAdmin');
    const user = userEvent.setup();
    render(<Navbar />);
    await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
    expect(screen.getAllByRole('link', { name: 'Conectar Google Ads' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /MCC/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Agência/i)).not.toBeInTheDocument();
    expect(getGoogleAdsAuthUrl).toHaveBeenCalledWith('tenant-A');
    expect(getGoogleAdsAuthUrl).not.toHaveBeenCalledWith('MASTER');
  });
});
