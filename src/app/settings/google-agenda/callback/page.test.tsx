import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleAgendaService } from '@/services/api';
import conectada from '@/services/__fixtures__/google-agenda-conectada.json';
import GoogleAgendaCallbackPage from './page';

// crm-google-agenda RF-21 / CA-22 (retorno): só chama o RF-01 com o state igual ao
// guardado; a chave sai antes da chamada; erros sempre na tela.
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push }),
}));
vi.mock('@/services/api', () => ({ GoogleAgendaService: { conectar: vi.fn() } }));

const MENSAGEM_GENERICA = 'Não foi possível conectar o Google Agenda. Tente de novo.';
const RETORNO = `${window.location.origin}/settings/google-agenda/callback`;

function guardar(state: string, tenant = 'tenant-1') {
  sessionStorage.setItem('google_agenda_oauth', JSON.stringify({ state, tenant_id: tenant }));
}

async function esperarFalhaGenerica() {
  expect(await screen.findByText(MENSAGEM_GENERICA)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Voltar às configurações' })).toHaveAttribute('href', '/settings?aba=google-agenda');
  expect(GoogleAgendaService.conectar).not.toHaveBeenCalled();
}

describe('Retorno do Google Agenda no CRM', () => {
  beforeEach(() => {
    sessionStorage.clear();
    nav.push.mockReset();
    vi.mocked(GoogleAgendaService.conectar).mockReset();
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'cliente-123.apps.googleusercontent.com');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('state diferente do guardado: não chama a API e mostra a mensagem', async () => {
    guardar('state-certo');
    nav.params = new URLSearchParams('code=4/codigo&state=state-outro');
    render(<GoogleAgendaCallbackPage />);
    await esperarFalhaGenerica();
  });

  it('error na URL: não chama a API', async () => {
    guardar('s1');
    nav.params = new URLSearchParams('error=access_denied&state=s1');
    render(<GoogleAgendaCallbackPage />);
    await esperarFalhaGenerica();
  });

  it('sem code: não chama a API', async () => {
    guardar('s1');
    nav.params = new URLSearchParams('state=s1');
    render(<GoogleAgendaCallbackPage />);
    await esperarFalhaGenerica();
  });

  it('nada guardado no sessionStorage: não chama a API', async () => {
    nav.params = new URLSearchParams('code=4/codigo&state=s1');
    render(<GoogleAgendaCallbackPage />);
    await esperarFalhaGenerica();
  });

  it('state igual: apaga a chave antes, chama o RF-01 com o tenant guardado e vai à aba', async () => {
    guardar('s1', 'tenant-guardado');
    let chaveNaHoraDaChamada: string | null = 'não lida';
    vi.mocked(GoogleAgendaService.conectar).mockImplementation(async () => {
      chaveNaHoraDaChamada = sessionStorage.getItem('google_agenda_oauth');
      return conectada as never;
    });
    nav.params = new URLSearchParams('code=4/codigo&state=s1');
    render(<GoogleAgendaCallbackPage />);

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/settings?aba=google-agenda'));
    expect(GoogleAgendaService.conectar).toHaveBeenCalledTimes(1);
    expect(GoogleAgendaService.conectar).toHaveBeenCalledWith('tenant-guardado', '4/codigo', RETORNO);
    expect(chaveNaHoraDaChamada).toBeNull();
    expect(sessionStorage.getItem('google_agenda_oauth')).toBeNull();
  });

  it('escopo_obrigatorio_negado: texto próprio e o link "Tentar de novo" volta ao consentimento', async () => {
    guardar('s1');
    vi.mocked(GoogleAgendaService.conectar).mockRejectedValue({ response: { status: 400, data: { error: 'escopo_obrigatorio_negado' } } });
    nav.params = new URLSearchParams('code=4/codigo&state=s1');
    render(<GoogleAgendaCallbackPage />);

    expect(await screen.findByText('Para conectar, permita que o CRM crie eventos na sua agenda.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Tentar de novo' });
    const url = new URL(link.getAttribute('href') as string);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const guardado = JSON.parse(sessionStorage.getItem('google_agenda_oauth') as string);
    expect(guardado.tenant_id).toBe('tenant-1');
    expect(url.searchParams.get('state')).toBe(guardado.state);
    expect(guardado.state).not.toBe('s1');
    expect(screen.queryByText(MENSAGEM_GENERICA)).not.toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('outro erro da API: mensagem genérica', async () => {
    guardar('s1');
    vi.mocked(GoogleAgendaService.conectar).mockRejectedValue({ response: { status: 400, data: { error: 'codigo_invalido' } } });
    nav.params = new URLSearchParams('code=4/codigo&state=s1');
    render(<GoogleAgendaCallbackPage />);

    expect(await screen.findByText(MENSAGEM_GENERICA)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar às configurações' })).toHaveAttribute('href', '/settings?aba=google-agenda');
    expect(nav.push).not.toHaveBeenCalled();
  });
});
