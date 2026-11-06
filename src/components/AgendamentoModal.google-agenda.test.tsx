import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgendamentoModal } from './AgendamentoModal';
import api from '@/services/api';
import naoConectada from '@/services/__fixtures__/google-agenda-nao-conectada.json';
import conectada from '@/services/__fixtures__/google-agenda-conectada.json';
import caida from '@/services/__fixtures__/google-agenda-caida.json';
import ocupado from '@/services/__fixtures__/google-agenda-ocupado.json';

// crm-google-agenda RF-22, RF-23 / CA-23, CA-24 (modal) e CA-28 (modal sem a integração).
// O GoogleAgendaService é o de verdade; só o axios responde, por URL, com o JSON real
// da API (fixtures do teste com DynamoDB Local).

type Props = Parameters<typeof AgendamentoModal>[0];

const TEXTO_ATALHO = 'Conecte o Google Agenda para o horário ir direto para a sua agenda.';
const TEXTO_CAIDA = 'A conexão com o Google Agenda caiu. Reconecte em Configurações.';

let situacao: unknown;
let respostaOcupado: () => Promise<unknown>;
let get: ReturnType<typeof vi.spyOn>;

const chamadasOcupado = () => get.mock.calls.map((c: unknown[]) => c[0] as string).filter((u: string) => u.startsWith('/integracoes/google-agenda/ocupado'));

function montar(over: Partial<Props> = {}, google: Partial<NonNullable<Props['googleAgenda']>> = {}) {
  const props: Props = {
    aberto: true,
    modo: 'mover',
    nomeDoLead: 'Maria Clara Souza',
    enviando: false,
    erro: null,
    onConfirmar: vi.fn(),
    onCancelar: vi.fn(),
    googleAgenda: { tenantId: 'tenant-1', leadId: 'l1', podeConectar: true, temEvento: false, ...google },
    ...over,
  };
  render(<AgendamentoModal {...props} />);
  return props;
}

// A situação da integração chega por promessa: esvazia a fila antes de olhar a tela.
const carregar = () => act(async () => {});

function preencher(data: string, hora: string) {
  fireEvent.change(screen.getByLabelText('Data'), { target: { value: data } });
  fireEvent.change(screen.getByLabelText('Hora'), { target: { value: hora } });
}

describe('AgendamentoModal com o Google Agenda', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    situacao = conectada;
    respostaOcupado = async () => ({ data: ocupado });
    get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/integracoes/google-agenda?tenant_id=tenant-1') return { data: situacao };
      if (url.startsWith('/integracoes/google-agenda/ocupado?')) return respostaOcupado();
      throw new Error(`GET inesperado: ${url}`);
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('integração ativa (RF-22)', () => {
    it('mover: "Duração (min)" com a duração padrão (15 a 240, passo 5) e a caixa marcada', async () => {
      montar();
      await carregar();
      const duracao = screen.getByRole('spinbutton', { name: 'Duração (min)' });
      expect(duracao).toHaveValue(50);
      expect(duracao).toHaveAttribute('min', '15');
      expect(duracao).toHaveAttribute('max', '240');
      expect(duracao).toHaveAttribute('step', '5');
      expect(screen.getByRole('checkbox', { name: 'Adicionar ao Google Agenda' })).toBeChecked();
    });

    it('alterar lead com evento: duração do lead e a caixa marcada', async () => {
      montar({ modo: 'alterar', valorInicial: '2026-11-11T18:00:00Z' }, { duracaoDoLead: 45, temEvento: true });
      await carregar();
      expect(screen.getByRole('spinbutton', { name: 'Duração (min)' })).toHaveValue(45);
      expect(screen.getByRole('checkbox', { name: 'Adicionar ao Google Agenda' })).toBeChecked();
    });

    it('alterar lead sem evento: a caixa vem desmarcada', async () => {
      montar({ modo: 'alterar', valorInicial: '2026-11-11T18:00:00Z' }, { temEvento: false });
      await carregar();
      expect(screen.getByRole('checkbox', { name: 'Adicionar ao Google Agenda' })).not.toBeChecked();
    });

    it('conflito: chama o RF-09 aos 400 ms da última mudança, e não aos 399 ms', async () => {
      montar({ modo: 'alterar', valorInicial: '2026-11-11T18:00:00Z' }, { temEvento: true, duracaoDoLead: 50 });
      await carregar();
      preencher('2026-11-11', '15:30');

      await act(async () => { vi.advanceTimersByTime(399); });
      expect(chamadasOcupado()).toEqual([]);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(chamadasOcupado()).toEqual([
        '/integracoes/google-agenda/ocupado?tenant_id=tenant-1&inicio=2026-11-11T18%3A30%3A00Z&fim=2026-11-11T19%3A20%3A00Z&lead=l1',
      ]);
    });

    it('mudar a duração também conta, e só a última mudança chama', async () => {
      montar();
      await carregar();
      preencher('2026-11-11', '15:30');
      await act(async () => { vi.advanceTimersByTime(300); });
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Duração (min)' }), { target: { value: '60' } });
      await act(async () => { vi.advanceTimersByTime(399); });
      expect(chamadasOcupado()).toEqual([]);
      await act(async () => { vi.advanceTimersByTime(1); });
      // Mover: sem o parâmetro lead.
      expect(chamadasOcupado()).toEqual([
        '/integracoes/google-agenda/ocupado?tenant_id=tenant-1&inicio=2026-11-11T18%3A30%3A00Z&fim=2026-11-11T19%3A30%3A00Z',
      ]);
    });

    it('com intervalos: o aviso com o texto exato em Brasília, e "Agendar" continua habilitado e envia', async () => {
      const props = montar();
      await carregar();
      preencher('2026-11-11', '15:30');
      await act(async () => { vi.advanceTimersByTime(400); });

      const aviso = screen.getByRole('status');
      expect(aviso.textContent).toBe('Esse horário já está ocupado na sua agenda (16:00–17:00).');
      const agendar = screen.getByRole('button', { name: 'Confirmar agendamento' });
      expect(agendar).toBeEnabled();
      fireEvent.click(agendar);
      expect(props.onConfirmar).toHaveBeenCalledWith('2026-11-11T18:30:00Z', { duracao_min: 50, google_agenda: true });
    });

    it('vários intervalos separados por ", "', async () => {
      const [primeiro] = ocupado.ocupado;
      respostaOcupado = async () => ({ data: { ocupado: [primeiro, { ...primeiro, inicio: '2026-11-11T21:30:00Z', fim: '2026-11-11T22:00:00Z' }] } });
      montar();
      await carregar();
      preencher('2026-11-11', '15:30');
      await act(async () => { vi.advanceTimersByTime(400); });
      expect(screen.getByRole('status').textContent).toBe('Esse horário já está ocupado na sua agenda (16:00–17:00, 18:30–19:00).');
    });

    it('com TZ=Asia/Tokyo, o aviso continua em Brasília', async () => {
      const fusoOriginal = process.env.TZ;
      process.env.TZ = 'Asia/Tokyo';
      try {
        // O fuso do processo mudou mesmo (19:00Z = 04:00 em Tóquio).
        expect(new Date('2026-11-11T19:00:00Z').getHours()).toBe(4);
        montar();
        await carregar();
        preencher('2026-11-11', '15:30');
        await act(async () => { vi.advanceTimersByTime(400); });
        expect(screen.getByRole('status').textContent).toBe('Esse horário já está ocupado na sua agenda (16:00–17:00).');
        expect(chamadasOcupado()[0]).toContain('inicio=2026-11-11T18%3A30%3A00Z');
      } finally {
        process.env.TZ = fusoOriginal;
      }
    });

    it('sem intervalos: nada', async () => {
      respostaOcupado = async () => ({ data: { ocupado: [] } });
      montar();
      await carregar();
      preencher('2026-11-11', '15:30');
      await act(async () => { vi.advanceTimersByTime(400); });
      expect(chamadasOcupado()).toHaveLength(1);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('erro do RF-09: nenhum aviso e "Agendar" não bloqueia', async () => {
      respostaOcupado = async () => Promise.reject({ response: { status: 502, data: { error: 'google_indisponivel' } } });
      const erroDoConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
      const props = montar();
      await carregar();
      preencher('2026-11-11', '15:30');
      await act(async () => { vi.advanceTimersByTime(400); });

      expect(chamadasOcupado()).toHaveLength(1);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByText(/ocupado/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
      expect(props.onConfirmar).toHaveBeenCalledWith('2026-11-11T18:30:00Z', { duracao_min: 50, google_agenda: true });
      expect(erroDoConsole).toHaveBeenCalled();
    });

    it('sem data ou hora válidas, não consulta', async () => {
      montar();
      await carregar();
      fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '15:30' } });
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(chamadasOcupado()).toEqual([]);
    });

    it('envio com a caixa desmarcada e outra duração: duracao_min e google_agenda=false', async () => {
      const props = montar();
      await carregar();
      preencher('2026-11-11', '15:30');
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Duração (min)' }), { target: { value: '30' } });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Adicionar ao Google Agenda' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
      expect(props.onConfirmar).toHaveBeenCalledWith('2026-11-11T18:30:00Z', { duracao_min: 30, google_agenda: false });
    });
  });

  describe('integração não conectada ou caída (RF-23)', () => {
    it('não conectada, quem gere integrações: o atalho com o link para a aba', async () => {
      situacao = naoConectada;
      const props = montar({}, { podeConectar: true });
      await carregar();
      expect(screen.getByText(TEXTO_ATALHO)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Conectar o Google Agenda' })).toHaveAttribute('href', '/settings?aba=google-agenda');
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      preencher('2026-11-11', '15:30');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
      expect(props.onConfirmar).toHaveBeenCalledWith('2026-11-11T18:30:00Z');
      expect(vi.mocked(props.onConfirmar).mock.calls[0]).toHaveLength(1);
    });

    it('não conectada, Vendedor: nada novo', async () => {
      situacao = naoConectada;
      montar({}, { podeConectar: false });
      await carregar();
      expect(screen.queryByText(TEXTO_ATALHO)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Conectar o Google Agenda' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Google Agenda/)).not.toBeInTheDocument();
    });

    it.each([[true], [false]])('caída (podeConectar=%s): todos veem o aviso, sem caixa e sem duração, e não consulta conflito', async (podeConectar) => {
      situacao = caida;
      const props = montar({}, { podeConectar });
      await carregar();
      expect(screen.getByText(TEXTO_CAIDA)).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      preencher('2026-11-11', '15:30');
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(chamadasOcupado()).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
      expect(vi.mocked(props.onConfirmar).mock.calls[0]).toEqual(['2026-11-11T18:30:00Z']);
    });

    it('falha ao ler a integração aparece no modal, e o agendamento segue', async () => {
      get.mockImplementation(async () => Promise.reject({ response: { status: 500, data: { error: 'erro_interno' } } }));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const props = montar();
      await carregar();
      expect(screen.getByRole('alert').textContent).toBe('Não foi possível ler o Google Agenda. O horário fica só no CRM.');
      preencher('2026-11-11', '15:30');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
      expect(vi.mocked(props.onConfirmar).mock.calls[0]).toEqual(['2026-11-11T18:30:00Z']);
    });
  });

  it('sem googleAgenda (flag desligada): nenhuma rota do RF-07, nenhum texto novo, onConfirmar só com o horário', async () => {
    const props = montar({ googleAgenda: undefined });
    await carregar();
    preencher('2026-11-11', '15:30');
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByText(/Google Agenda/)).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(vi.mocked(props.onConfirmar).mock.calls[0]).toEqual(['2026-11-11T18:30:00Z']);
  });
});
