import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import api from '@/services/api';
import conectada from '@/services/__fixtures__/google-agenda-conectada.json';
import agendas from '@/services/__fixtures__/google-agenda-agendas.json';

// crm-google-agenda RF-19 (quem vê a aba), RF-21 (retorno abre a aba) e RF-28 / CA-28
// (flags desligadas: nenhuma rota do RF-07 e nenhum texto novo em Configurações).
vi.mock('next/navigation', () => ({ useRouter: vi.fn(), useSearchParams: vi.fn(() => new URLSearchParams()) }));
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ isSubscribed: false, subscribeUser: vi.fn(), unsubscribeUser: vi.fn(), loading: false, permission: 'default' }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));
vi.mock('./_components/TabGoogleAds', () => ({ default: () => <p>conteúdo da aba Google Ads</p> }));

const podeNoCRM = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AcessosContext', () => ({
  useAcessosDoCRM: () => ({ carregando: false, erro: false, pode: podeNoCRM, podeNoPortal: () => false }),
}));

const flags = vi.hoisted(() => ({ 'crm-google-agenda': true, 'crm-agendamento': true } as Record<string, boolean>));
vi.mock('@/hooks/useFlag', () => ({ useFlag: (chave: string) => flags[chave] === true }));

const GESTOR = (p: string) => p === 'crm.integracoes.gerir' || p === 'crm.lead.editar';
const VENDEDOR = (p: string) => p === 'crm.lead.editar' || p === 'crm.lead.ver';

let urls: string[] = [];

function sessao(role = 'USER') {
  (useAuthStore as any).mockReturnValue({ session: { name: 'A', email: 'a@x.com', role, tenantId: 't-123' } });
}

describe('Configurações: aba "Google Agenda"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    urls = [];
    flags['crm-google-agenda'] = true;
    flags['crm-agendamento'] = true;
    (useTenant as any).mockReturnValue({ activeTenantId: 't-123', activeTenantName: 'Unum Corp' });
    for (const metodo of ['get', 'post', 'put', 'delete'] as const) {
      vi.spyOn(api, metodo).mockImplementation(async (url: string) => {
        urls.push(`${metodo.toUpperCase()} ${url}`);
        if (url.startsWith('/integracoes/google-agenda/agendas')) return { data: agendas };
        return { data: conectada };
      });
    }
    window.history.replaceState({}, '', '/settings');
  });
  afterEach(() => vi.restoreAllMocks());

  it('aparece para quem gere integrações e abre a aba com a conexão', async () => {
    sessao();
    podeNoCRM.mockImplementation(GESTOR);
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Google Agenda' }));
    expect(await screen.findByText('Conectada como consultorio@gmail.com')).toBeInTheDocument();
  });

  it('aparece para GlobalAdmin', () => {
    sessao('GlobalAdmin');
    podeNoCRM.mockReturnValue(false);
    render(<SettingsPage />);
    expect(screen.getByRole('tab', { name: 'Google Agenda' })).toBeInTheDocument();
  });

  it('não aparece para um Vendedor', () => {
    sessao();
    podeNoCRM.mockImplementation(VENDEDOR);
    render(<SettingsPage />);
    expect(screen.queryByRole('tab', { name: 'Google Agenda' })).not.toBeInTheDocument();
    expect(urls.filter((u) => u.includes('/integracoes/google-agenda'))).toEqual([]);
  });

  it('?aba=google-agenda (retorno do consentimento) abre direto na aba', async () => {
    sessao();
    podeNoCRM.mockImplementation(GESTOR);
    window.history.replaceState({}, '', '/settings?aba=google-agenda');
    render(<SettingsPage />);
    expect(await screen.findByText('Conectada como consultorio@gmail.com')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Google Agenda' })).toHaveAttribute('aria-selected', 'true');
  });

  it.each([
    ['crm-google-agenda desligada', 'crm-google-agenda'],
    ['crm-agendamento desligada', 'crm-agendamento'],
  ])('%s: sem aba, sem texto novo e sem nenhuma rota do RF-07', async (_nome, chave) => {
    flags[chave] = false;
    sessao('GlobalAdmin');
    podeNoCRM.mockImplementation(GESTOR);
    window.history.replaceState({}, '', '/settings?aba=google-agenda');
    render(<SettingsPage />);

    expect(screen.getByRole('tab', { name: /google ads/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Google Agenda' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Agenda/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /google ads/i }));
    expect(urls.filter((u) => u.includes('/integracoes/google-agenda') || u.includes('/google-agenda'))).toEqual([]);
  });
});
