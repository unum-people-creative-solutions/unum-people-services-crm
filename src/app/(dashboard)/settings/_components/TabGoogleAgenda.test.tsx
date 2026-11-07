import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TabGoogleAgenda from './TabGoogleAgenda';
import { useTenant } from '@/contexts/TenantContext';
import api from '@/services/api';
import naoConectada from '@/services/__fixtures__/google-agenda-nao-conectada.json';
import conectada from '@/services/__fixtures__/google-agenda-conectada.json';
import caida from '@/services/__fixtures__/google-agenda-caida.json';
import agendas from '@/services/__fixtures__/google-agenda-agendas.json';

// crm-google-agenda RF-19 / CA-21: os três estados com os textos literais, com o JSON
// real da API (fixtures do teste com DynamoDB Local, inclusive a "não conectada"). As
// chamadas passam pelo GoogleAgendaService de verdade; só o axios responde, por URL.
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

// RF-19a: os três erros da aba.
const ERRO_CARREGAR = 'Não foi possível carregar o Google Agenda. Recarregue a página para tentar de novo.';
const ERRO_AGENDAS = 'Não foi possível carregar as suas agendas. Recarregue a página para tentar de novo.';
const ERRO_DESCONECTAR = 'Não foi possível desconectar. Tente de novo.';

const TEXTO_CONECTAR = 'Os horários marcados no CRM vão para a sua agenda do Google, e o CRM avisa quando o horário já está ocupado.';
const TEXTO_SEM_CONFLITO = 'Sem permissão para ver horários ocupados: o CRM não vai avisar conflitos. Reconecte e permita ver a disponibilidade.';
const TEXTO_CAIDA = 'A conexão com o Google Agenda caiu. Reconecte para os próximos horários irem para a sua agenda.';
const TEXTO_DESCONECTAR = 'Desconectar o Google Agenda? O CRM para de usar a sua agenda, e os eventos já criados continuam nela. Para tirar também o acesso na sua Conta Google, remova o Unum People CRM nas permissões da conta.';

let situacao: unknown;
let get: ReturnType<typeof vi.spyOn>;
let put: ReturnType<typeof vi.spyOn>;
let del: ReturnType<typeof vi.spyOn>;
const assign = vi.fn();
const locationOriginal = window.location;

function rotear(respostaDoPut: () => Promise<unknown> = async () => ({ data: conectada })) {
  get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/integracoes/google-agenda?tenant_id=tenant-A') return { data: situacao };
    if (url === '/integracoes/google-agenda/agendas?tenant_id=tenant-A') return { data: agendas };
    throw new Error(`GET inesperado: ${url}`);
  });
  put = vi.spyOn(api, 'put').mockImplementation(respostaDoPut as never);
  del = vi.spyOn(api, 'delete').mockResolvedValue({ status: 204, data: '' });
}

describe('TabGoogleAgenda', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(useTenant).mockReturnValue({ activeTenantId: 'tenant-A' } as ReturnType<typeof useTenant>);
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'cliente-123.apps.googleusercontent.com');
    assign.mockReset();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...locationOriginal, origin: locationOriginal.origin, assign } });
    situacao = conectada;
    rotear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Object.defineProperty(window, 'location', { configurable: true, value: locationOriginal });
  });

  it('não conectada: título, texto e "Conectar Google Agenda" leva ao consentimento com state guardado', async () => {
    situacao = naoConectada;
    render(<TabGoogleAgenda />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Google Agenda' })).toBeInTheDocument();
    expect(screen.getByText(TEXTO_CONECTAR)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Conectar Google Agenda' }));

    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const guardado = JSON.parse(sessionStorage.getItem('google_agenda_oauth') as string);
    expect(guardado).toEqual({ state: url.searchParams.get('state'), tenant_id: 'tenant-A' });
    // Sem conexão, não lista agendas.
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('conectada: e-mail, seletor com as agendas, duração, Salvar e Desconectar', async () => {
    render(<TabGoogleAgenda />);

    expect(await screen.findByText('Conectada como consultorio@gmail.com')).toBeInTheDocument();
    const seletor = screen.getByRole('combobox', { name: 'Agenda' });
    await waitFor(() => expect(within(seletor).getAllByRole('option').map((o) => o.textContent)).toEqual(['consultorio@gmail.com', 'Atendimentos']));
    // A fixture guarda o id real da principal (RF-01 da rodada 1).
    expect(seletor).toHaveValue('consultorio@gmail.com');
    expect(screen.getByRole('spinbutton', { name: 'Duração padrão da consulta (min)' })).toHaveValue(50);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeEnabled();
    expect(screen.queryByText(TEXTO_SEM_CONFLITO)).not.toBeInTheDocument();
    expect(screen.queryByText(TEXTO_CONECTAR)).not.toBeInTheDocument();
  });

  it('conectada sem conflito: mostra o aviso', async () => {
    situacao = { ...conectada, conflito: false };
    render(<TabGoogleAgenda />);
    expect(await screen.findByText(TEXTO_SEM_CONFLITO)).toBeInTheDocument();
  });

  it('caída: o alerta e "Reconectar", que leva ao consentimento', async () => {
    situacao = caida;
    render(<TabGoogleAgenda />);

    expect(await screen.findByText(TEXTO_CAIDA)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reconectar' }));
    expect(new URL(assign.mock.calls[0][0]).searchParams.get('state')).toBe(
      JSON.parse(sessionStorage.getItem('google_agenda_oauth') as string).state,
    );
    // Caída: não chama a lista de agendas (o token não vale).
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('"Salvar" envia {agenda_id, duracao_padrao_min} e mostra "Salvo."', async () => {
    render(<TabGoogleAgenda />);
    const seletor = await screen.findByRole('combobox', { name: 'Agenda' });
    await waitFor(() => expect(within(seletor).getAllByRole('option')).toHaveLength(2));

    await userEvent.selectOptions(seletor, 'y@group.calendar.google.com');
    const duracao = screen.getByRole('spinbutton', { name: 'Duração padrão da consulta (min)' });
    await userEvent.clear(duracao);
    await userEvent.type(duracao, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]).toEqual([
      '/integracoes/google-agenda?tenant_id=tenant-A',
      { agenda_id: 'y@group.calendar.google.com', duracao_padrao_min: 45 },
    ]);
  });

  // CA-21a (RF-19a): item em "primary" (conexão antiga ou sem lista) e a lista com a
  // principal de id real: "Salvar" sem mexer no seletor envia o id real.
  it('item em "primary": "Salvar" sem mexer no seletor envia o id real da principal', async () => {
    situacao = { ...conectada, agenda_id: 'primary' };
    render(<TabGoogleAgenda />);
    const seletor = await screen.findByRole('combobox', { name: 'Agenda' });
    await waitFor(() => expect(within(seletor).getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
    expect(put.mock.calls).toEqual([
      ['/integracoes/google-agenda?tenant_id=tenant-A', { agenda_id: 'consultorio@gmail.com', duracao_padrao_min: 50 }],
    ]);
  });

  it('falha ao ler a integração mostra o erro da aba (RF-19a)', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/integracoes/google-agenda?tenant_id=tenant-A') throw { response: { status: 500, data: { error: 'erro_interno' } } };
      throw new Error(`GET inesperado: ${url}`);
    });
    render(<TabGoogleAgenda />);

    expect((await screen.findByRole('alert')).textContent).toBe(ERRO_CARREGAR);
    expect(screen.queryByRole('button', { name: 'Conectar Google Agenda' })).not.toBeInTheDocument();
  });

  it('falha ao listar as agendas mostra o erro da aba (RF-19a)', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/integracoes/google-agenda?tenant_id=tenant-A') return { data: conectada };
      if (url === '/integracoes/google-agenda/agendas?tenant_id=tenant-A') throw { response: { status: 502, data: { error: 'google_indisponivel' } } };
      throw new Error(`GET inesperado: ${url}`);
    });
    render(<TabGoogleAgenda />);

    expect((await screen.findByRole('alert')).textContent).toBe(ERRO_AGENDAS);
    expect(screen.getByText('Conectada como consultorio@gmail.com')).toBeInTheDocument();
  });

  it('falha ao desconectar mostra o erro na confirmação (RF-19a)', async () => {
    del.mockRejectedValue({ response: { status: 500, data: { error: 'erro_interno' } } });
    render(<TabGoogleAgenda />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desconectar' }));

    expect((await within(dialogo).findByRole('alert')).textContent).toBe(ERRO_DESCONECTAR);
    expect(del).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Conectar Google Agenda' })).not.toBeInTheDocument();
  });

  it('erro ao salvar aparece na tela', async () => {
    rotear(async () => Promise.reject({ response: { status: 400, data: { error: 'duracao_invalida' } } }));
    render(<TabGoogleAgenda />);
    await screen.findByRole('combobox', { name: 'Agenda' });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar. Tente de novo.');
    expect(screen.queryByText('Salvo.')).not.toBeInTheDocument();
  });

  it('"Desconectar" pede confirmação com o link das permissões; "Cancelar" não chama o DELETE', async () => {
    render(<TabGoogleAgenda />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText((_, el) => el?.tagName === 'P' && el.textContent === TEXTO_DESCONECTAR)).toBeInTheDocument();
    const link = within(dialogo).getByRole('link', { name: 'permissões da conta' });
    expect(link).toHaveAttribute('href', 'https://myaccount.google.com/connections');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(del).not.toHaveBeenCalled();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByText('Conectada como consultorio@gmail.com')).toBeInTheDocument();
  });

  it('confirmar "Desconectar" chama o DELETE e volta ao estado não conectado', async () => {
    render(<TabGoogleAgenda />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desconectar' }));

    expect(await screen.findByRole('button', { name: 'Conectar Google Agenda' })).toBeInTheDocument();
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith('/integracoes/google-agenda?tenant_id=tenant-A');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
