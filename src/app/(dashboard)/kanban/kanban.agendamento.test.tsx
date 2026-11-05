import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KanbanPage from './page';
import { AcessosService, LeadService, TenantService, type LeadAgendamento, type MeusAcessos } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';

// spec crm-agendamento-e-lembretes: CA-53 a CA-58 (montado na página do quadro, L-043).
// "agora" = 2026-11-10T15:00:00Z (12:00 em Brasília); vitest com TZ=America/Sao_Paulo.

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/services/api', async () => {
  const real = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  return {
    default: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
    mensagemDeErro: real.mensagemDeErro,
    AcessosService: { get: vi.fn() },
    LeadService: {
      list: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      searchCustomers: vi.fn(),
      addSale: vi.fn(),
      delete: vi.fn(),
      listSalesByMonth: vi.fn(),
      agendar: vi.fn(),
    },
    TenantService: { list: vi.fn(), listMyTenants: vi.fn() },
  };
});

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

// Flag crm-agendamento (RF-78): os CA-53 a CA-58 rodam ligada (CA-80); o CA-79, desligada.
// A leitura de /me/flags é testada em src/hooks/useFlag.test.tsx.
const flag = vi.hoisted(() => ({ ligada: true }));
vi.mock('@/hooks/useFlag', () => ({ useFlag: (chave: string) => chave === 'crm-agendamento' && flag.ligada }));

// O DragDropContext guarda o onDragEnd que a página passa, para o teste arrastar.
const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((r: unknown) => Promise<void> | void) }));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  Droppable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), droppableProps: {} }, {}),
  Draggable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), dragHandleProps: {} }, {}),
}));

vi.mock('xlsx', () => ({
  utils: { book_new: vi.fn(() => ({})), json_to_sheet: vi.fn(() => ({ '!cols': [] })), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}));

// Lead como GET /leads devolve (tags json de domain.Lead; agendado_em RFC3339 UTC, omitzero).
type LeadDaApi = LeadAgendamento & {
  id: string;
  tenant_id: string;
  nome: string;
  telefone: string;
  email?: string;
  status: string;
  source: string;
  sync_ads: boolean;
  created_at: string;
  updated_at: string;
};

const lead = (over: Partial<LeadDaApi> & Pick<LeadDaApi, 'id' | 'nome' | 'status'>): LeadDaApi => ({
  tenant_id: 'tenant-1',
  telefone: '(81) 99999-0000',
  source: 'MANUAL',
  sync_ads: false,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-10T14:00:00Z',
  ...over,
});

const GESTOR = ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar', 'crm.lead.excluir', 'crm.integracoes.gerir'];
const LEITOR = ['crm.lead.ver'];

function acessos(crm: string[]): MeusAcessos {
  return {
    tenant_id: 'tenant-1',
    operador: false,
    ferramentas: [{ id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'p', nome: 'p', sistema: false, implicito: false }, permissoes: crm }],
  };
}

let quadro: Record<string, LeadDaApi[]> = {};

function renderKanban() {
  return render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );
}

async function arrastar(de: string, para: string, id = 'l1', indiceDestino = 0) {
  await act(async () => {
    await dnd.onDragEnd!({
      source: { droppableId: de, index: 0 },
      destination: { droppableId: para, index: indiceDestino },
      draggableId: id,
    });
  });
}

const preencher = (data: string, hora: string) => {
  fireEvent.change(screen.getByLabelText('Data'), { target: { value: data } });
  fireEvent.change(screen.getByLabelText('Hora'), { target: { value: hora } });
};

describe('Quadro: agendamento', () => {
  const alertOriginal = window.alert;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    window.alert = vi.fn();
    dnd.onDragEnd = null;
    flag.ligada = true;
    quadro = { NOVO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'NOVO' })] };
    (useAuthStore as any).mockReturnValue({
      session: { email: 'user@test.com', name: 'User', tenantId: 'tenant-1', role: 'USER' },
      logout: vi.fn(),
      setSession: vi.fn(),
    });
    (useTenant as any).mockReturnValue({
      activeTenantId: 'tenant-1',
      activeTenantName: 'Consultório Ana Lima',
      availableTenants: [{ id: 'tenant-1', nome_negocio: 'Consultório Ana Lima' }],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
    (TenantService.listMyTenants as any).mockResolvedValue([{ id: 'tenant-1', nome_negocio: 'Consultório Ana Lima' }]);
    (AcessosService.get as any).mockResolvedValue(acessos(GESTOR));
    (LeadService.list as any).mockImplementation((status: string) => Promise.resolve(quadro[status] ?? []));
    (LeadService.listSalesByMonth as any).mockResolvedValue([]);
    (LeadService.agendar as any).mockResolvedValue({ message: 'Lead updated successfully' });
    (LeadService.updateStatus as any).mockResolvedValue({ message: 'Lead updated successfully' });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.alert = alertOriginal;
  });

  describe('CA-53 — arrastar para "Agendados" abre o modal', () => {
    it('de NOVO: mostra "Agendar horário" e não "Mover para trás?"', async () => {
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');

      expect(screen.getByRole('dialog', { name: 'Agendar horário' })).toBeInTheDocument();
      expect(screen.queryByText('Mover para trás?')).not.toBeInTheDocument();
      expect(LeadService.updateStatus).not.toHaveBeenCalled();
    });

    it('Cancelar movimento: nenhuma escrita e o quadro recarrega (o cartão volta à origem)', async () => {
      renderKanban();
      await screen.findByText('Maria Silva');
      await waitFor(() => expect(LeadService.list).toHaveBeenCalled());
      await arrastar('NOVO', 'AGENDADO');
      const chamadasAntes = (LeadService.list as any).mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar movimento' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(LeadService.agendar).not.toHaveBeenCalled();
      expect(LeadService.updateStatus).not.toHaveBeenCalled();
      await waitFor(() => expect((LeadService.list as any).mock.calls.length).toBeGreaterThan(chamadasAntes));
    });

    it('Esc também cancela sem escrita e recarrega', async () => {
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');
      const chamadasAntes = (LeadService.list as any).mock.calls.length;

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(LeadService.agendar).not.toHaveBeenCalled();
      await waitFor(() => expect((LeadService.list as any).mock.calls.length).toBeGreaterThan(chamadasAntes));
    });

    it('confirmar 2026-11-12 15:30 → LeadService.agendar("l1", "2026-11-12T18:30:00Z", "tenant-1") uma vez', async () => {
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');

      preencher('2026-11-12', '15:30');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(LeadService.agendar).toHaveBeenCalledTimes(1);
      expect(LeadService.agendar).toHaveBeenCalledWith('l1', '2026-11-12T18:30:00Z', 'tenant-1');
      expect(LeadService.updateStatus).not.toHaveBeenCalled();
    });

    it('clique duplo em Confirmar envia uma única vez e mostra Salvando…', async () => {
      (LeadService.agendar as any).mockReturnValue(new Promise(() => {}));
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');

      preencher('2026-11-12', '15:30');
      const confirmar = screen.getByRole('button', { name: 'Confirmar agendamento' });
      fireEvent.click(confirmar);
      fireEvent.click(confirmar);

      expect(await screen.findByRole('button', { name: 'Salvando…' })).toBeDisabled();
      expect(LeadService.agendar).toHaveBeenCalledTimes(1);
    });

    it('de GANHO para AGENDADO abre o mesmo modal (não o "Mover para trás?")', async () => {
      quadro = { GANHO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'GANHO' })] };
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('GANHO', 'AGENDADO');

      expect(screen.getByRole('dialog', { name: 'Agendar horário' })).toBeInTheDocument();
      expect(screen.queryByText('Mover para trás?')).not.toBeInTheDocument();
    });

    it('falha da API → role="alert" com a mensagem e o modal continua aberto', async () => {
      (LeadService.agendar as any).mockRejectedValue({ response: { status: 500, data: { error: 'Failed to schedule lead' } } });
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');

      preencher('2026-11-12', '15:30');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

      const alerta = await within(screen.getByRole('dialog')).findByRole('alert');
      expect(alerta.textContent).toBe('Não foi possível salvar o horário. Tente de novo.');
      expect(screen.getByRole('dialog', { name: 'Agendar horário' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar agendamento' })).toBeEnabled();
      expect(screen.getByLabelText('Data')).toHaveValue('2026-11-12');
    });

    it('403 com permissão nomeada mostra o texto de permissão do CRM', async () => {
      (LeadService.agendar as any).mockRejectedValue({ response: { status: 403, data: { error: 'forbidden', permissao: 'crm.lead.editar' } } });
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');

      preencher('2026-11-12', '15:30');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

      const alerta = await within(screen.getByRole('dialog')).findByRole('alert');
      expect(alerta.textContent).toBe('Você não tem permissão para fazer isso nesta empresa.');
    });

    it('reordenar dentro de "Agendados" não abre o modal nem grava (a ordem é pela data)', async () => {
      quadro = {
        AGENDADO: [
          lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z' }),
          lead({ id: 'l2', nome: 'Ana Souza', status: 'AGENDADO', agendado_em: '2026-11-13T18:30:00Z' }),
        ],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('AGENDADO', 'AGENDADO', 'l1', 1);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(LeadService.agendar).not.toHaveBeenCalled();
      expect(LeadService.updateStatus).not.toHaveBeenCalled();
    });

    it('sem crm.lead.editar, arrastar não abre o modal', async () => {
      (AcessosService.get as any).mockResolvedValue(acessos(LEITOR));
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(LeadService.agendar).not.toHaveBeenCalled();
    });

    it('de outra coluna para fora de "Agendados" continua como antes (updateStatus)', async () => {
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'ATENDIMENTO');

      expect(screen.queryByRole('dialog', { name: 'Agendar horário' })).not.toBeInTheDocument();
      await waitFor(() => expect(LeadService.updateStatus).toHaveBeenCalledWith('l1', 'ATENDIMENTO', 0, undefined, 'tenant-1'));
    });
  });

  describe('CA-55 — cartão em "Agendados"', () => {
    it('futuro: "Agendado para qui 12/11 às 15:30" e o botão "Alterar horário"', async () => {
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z' })] };
      renderKanban();
      await screen.findByText('Maria Silva');

      expect(screen.getByText('Agendado para qui 12/11 às 15:30').textContent).toBe('Agendado para qui 12/11 às 15:30');
      const alterar = screen.getByRole('button', { name: 'Alterar horário' });
      expect(alterar.textContent).toBe('Alterar horário');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('passado: a mesma linha, o aviso em role="status" e o botão "Alterar horário"', async () => {
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-09T18:30:00Z' })] };
      renderKanban();
      await screen.findByText('Maria Silva');

      expect(screen.getByText('Agendado para seg 09/11 às 15:30')).toBeInTheDocument();
      expect(screen.getByRole('status').textContent).toBe('O horário passou: registre o que aconteceu.');
      expect(screen.getByRole('button', { name: 'Alterar horário' })).toBeInTheDocument();
    });

    it('sem agendado_em (legado): "Sem horário marcado" e o botão "Marcar horário"', async () => {
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO' })] };
      renderKanban();
      await screen.findByText('Maria Silva');

      expect(screen.getByText('Sem horário marcado').textContent).toBe('Sem horário marcado');
      expect(screen.getByRole('button', { name: 'Marcar horário' }).textContent).toBe('Marcar horário');
      expect(screen.queryByRole('button', { name: 'Alterar horário' })).not.toBeInTheDocument();
    });

    it('sem crm.lead.editar: nenhum "Alterar horário" nem "Marcar horário" (a data continua visível)', async () => {
      (AcessosService.get as any).mockResolvedValue(acessos(LEITOR));
      quadro = {
        AGENDADO: [
          lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z' }),
          lead({ id: 'l2', nome: 'Ana Souza', status: 'AGENDADO' }),
        ],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      await screen.findAllByRole('button', { name: 'Ver lead' });

      expect(screen.getByText('Agendado para qui 12/11 às 15:30')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alterar horário' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Marcar horário' })).not.toBeInTheDocument();
    });

    it('lead em NOVO com agendado_em: nada do bloco de agendamento', async () => {
      quadro = { NOVO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'NOVO', agendado_em: '2026-11-12T18:30:00Z' })] };
      renderKanban();
      await screen.findByText('Maria Silva');

      expect(screen.queryByText(/^Agendado para/)).not.toBeInTheDocument();
      expect(screen.queryByText('Sem horário marcado')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alterar horário' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Marcar horário' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Lembrar pelo WhatsApp' })).not.toBeInTheDocument();
    });

    it('"Alterar horário" abre o modal alterar com o horário atual; salvar chama agendar', async () => {
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z' })] };
      renderKanban();
      await screen.findByText('Maria Silva');

      fireEvent.click(screen.getByRole('button', { name: 'Alterar horário' }));
      expect(screen.getByRole('dialog', { name: 'Alterar horário' })).toBeInTheDocument();
      expect(screen.getByLabelText('Data')).toHaveValue('2026-11-12');
      expect(screen.getByLabelText('Hora')).toHaveValue('15:30');

      fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '16:00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar horário' }));
      await waitFor(() => expect(LeadService.agendar).toHaveBeenCalledWith('l1', '2026-11-12T19:00:00Z', 'tenant-1'));
    });

    it('"Alterar horário" + Cancelar: nenhuma escrita e o quadro não recarrega', async () => {
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z' })] };
      renderKanban();
      await screen.findByText('Maria Silva');
      await waitFor(() => expect(LeadService.list).toHaveBeenCalled());
      const chamadasAntes = (LeadService.list as any).mock.calls.length;

      const alterar = screen.getByRole('button', { name: 'Alterar horário' });
      act(() => alterar.focus());
      fireEvent.click(alterar);
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(LeadService.agendar).not.toHaveBeenCalled();
      expect((LeadService.list as any).mock.calls.length).toBe(chamadasAntes);
      expect(screen.getByRole('button', { name: 'Alterar horário' })).toHaveFocus();
    });

    it('"Marcar horário" abre o modal alterar com os campos vazios', async () => {
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO' })] };
      renderKanban();
      await screen.findByText('Maria Silva');

      fireEvent.click(screen.getByRole('button', { name: 'Marcar horário' }));
      expect(screen.getByRole('dialog', { name: 'Alterar horário' })).toBeInTheDocument();
      expect(screen.getByLabelText('Data')).toHaveValue('');
      expect(screen.getByLabelText('Hora')).toHaveValue('');
    });
  });

  describe('CA-56 — ordem de "Agendados"', () => {
    const coluna = (titulo: string) => screen.getByRole('heading', { name: new RegExp(`^${titulo}`) }).parentElement as HTMLElement;
    const nomesNaColuna = (titulo: string) =>
      within(coluna(titulo)).queryAllByText(/^Lead [ABCD]$/).map((el) => el.textContent);

    beforeEach(() => {
      quadro = {
        AGENDADO: [
          lead({ id: 'a', nome: 'Lead A', status: 'AGENDADO', agendado_em: '2026-11-12T12:00:00Z' }),
          lead({ id: 'b', nome: 'Lead B', status: 'AGENDADO' }),
          lead({ id: 'c', nome: 'Lead C', status: 'AGENDADO', agendado_em: '2026-11-09T12:00:00Z' }),
          lead({ id: 'd', nome: 'Lead D', status: 'AGENDADO', agendado_em: '2026-11-11T12:00:00Z' }),
        ],
      };
    });

    it('a coluna mostra c, d, a, b (mais próximo em cima, sem data no fim)', async () => {
      renderKanban();
      await screen.findByText('Lead A');
      expect(nomesNaColuna('Agendados')).toEqual(['Lead C', 'Lead D', 'Lead A', 'Lead B']);
    });

    it('a ordem está no estado: arrastar o índice 0 leva o Lead C', async () => {
      (LeadService.updateStatus as any).mockReturnValue(new Promise(() => {}));
      renderKanban();
      await screen.findByText('Lead A');
      await arrastar('AGENDADO', 'ATENDIMENTO', 'c', 0);

      expect(nomesNaColuna('Em Atendimento')).toEqual(['Lead C']);
      expect(nomesNaColuna('Agendados')).toEqual(['Lead D', 'Lead A', 'Lead B']);
    });
  });

  describe('CA-57 — inatividade pela referência', () => {
    it('em "Agendados" com horário futuro, cartão antigo não tem "Inatividade crítica"', async () => {
      quadro = {
        AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-11T12:00:00Z' })],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      expect(screen.queryByText(/^Inatividade crítica/)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Atenção: /)).not.toBeInTheDocument();
    });

    it('o mesmo cartão em "Em Atendimento" tem "Inatividade crítica"', async () => {
      quadro = {
        ATENDIMENTO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'ATENDIMENTO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-11T12:00:00Z' })],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      expect(screen.getByText(/^Inatividade crítica/).textContent).toBe(
        'Inatividade crítica: mais de 231h sem atualizações. Recomendado: Contato urgente.',
      );
    });

    it('em "Agendados" com o horário passado há 25h, conta a partir do horário (laranja)', async () => {
      quadro = {
        AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-09T14:00:00Z' })],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      expect(screen.getByText(/^Atenção: /).textContent).toBe('Atenção: 25h de inatividade. Recomendado: Enviar follow-up.');
      expect(screen.queryByText(/^Inatividade crítica/)).not.toBeInTheDocument();
    });
  });

  describe('CA-58 — "Lembrar pelo WhatsApp"', () => {
    const mensagem =
      'Olá, Maria! Lembrando do seu horário com Consultório Ana Lima: quinta-feira, 12/11, às 15:30. Se precisar remarcar, é só responder esta mensagem.';

    it('href exato com a mensagem pronta, target _blank e rel noopener noreferrer', async () => {
      quadro = {
        AGENDADO: [
          lead({
            id: 'l1',
            nome: 'Maria Silva',
            status: 'AGENDADO',
            telefone: '(81) 99999-0000',
            email: 'maria@exemplo.com',
            agendado_em: '2026-11-12T18:30:00Z',
          }),
        ],
      };
      renderKanban();
      await screen.findByText('Maria Silva');

      const link = screen.getByRole('link', { name: 'Lembrar pelo WhatsApp' });
      expect(link.textContent).toBe('Lembrar pelo WhatsApp');
      expect(link).toHaveAttribute('href', 'https://wa.me/5581999990000?text=' + encodeURIComponent(mensagem));
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      const descricao = document.getElementById(link.getAttribute('aria-describedby') as string);
      expect(descricao?.textContent).toBe('Agendado para qui 12/11 às 15:30');
    });

    it('a mensagem não leva anotação, e-mail nem telefone do lead', async () => {
      quadro = {
        AGENDADO: [
          {
            ...lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', email: 'maria@exemplo.com', agendado_em: '2026-11-12T18:30:00Z' }),
            anotacoes: 'ansiedade, primeira consulta',
          } as LeadDaApi,
        ],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      const texto = decodeURIComponent(
        (screen.getByRole('link', { name: 'Lembrar pelo WhatsApp' }).getAttribute('href') as string).split('?text=')[1],
      );
      expect(texto).toBe(mensagem);
      expect(texto).not.toContain('ansiedade');
      expect(texto).not.toContain('maria@exemplo.com');
    });

    it('horário passado: nenhum link', async () => {
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-09T18:30:00Z' })] };
      renderKanban();
      await screen.findByText('Maria Silva');
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Lembrar pelo WhatsApp' })).not.toBeInTheDocument();
    });

    it('telefone inutilizável ou sem horário: nenhum link', async () => {
      quadro = {
        AGENDADO: [
          lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', telefone: '99990000', agendado_em: '2026-11-12T18:30:00Z' }),
          lead({ id: 'l2', nome: 'Ana Souza', status: 'AGENDADO' }),
        ],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      expect(screen.queryByRole('link', { name: 'Lembrar pelo WhatsApp' })).not.toBeInTheDocument();
    });

    it('só com crm.lead.ver, o link aparece (é só leitura) e "Alterar horário" não', async () => {
      (AcessosService.get as any).mockResolvedValue(acessos(LEITOR));
      quadro = { AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z' })] };
      renderKanban();
      await screen.findByText('Maria Silva');
      await screen.findAllByRole('button', { name: 'Ver lead' });
      expect(screen.getByRole('link', { name: 'Lembrar pelo WhatsApp' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alterar horário' })).not.toBeInTheDocument();
    });
  });

  describe('CA-54 — "Mover lead" → "Agendados"', () => {
    it('abre o dialog "Agendar horário" e não chama updateStatus', async () => {
      const user = userEvent.setup();
      renderKanban();
      await screen.findByText('Maria Silva');

      await user.click(screen.getByRole('button', { name: 'Mover lead' }));
      await user.click(screen.getByRole('button', { name: 'Agendados' }));

      expect(screen.getByRole('dialog', { name: 'Agendar horário' })).toBeInTheDocument();
      expect(LeadService.updateStatus).not.toHaveBeenCalled();

      preencher('2026-11-12', '15:30');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
      await waitFor(() => expect(LeadService.agendar).toHaveBeenCalledWith('l1', '2026-11-12T18:30:00Z', 'tenant-1'));
      expect(LeadService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('CA-79 — flag desligada: o quadro de antes da feature', () => {
    const coluna = (titulo: string) => screen.getByRole('heading', { name: new RegExp(`^${titulo}`) }).parentElement as HTMLElement;
    const nomesNaColuna = (titulo: string) =>
      within(coluna(titulo)).queryAllByText(/^Lead [ABC]$/).map((el) => el.textContent);

    beforeEach(() => {
      flag.ligada = false;
    });

    it('arrastar NOVO → AGENDADO não abre o modal e grava pelo updateStatus', async () => {
      renderKanban();
      await screen.findByText('Maria Silva');
      await arrastar('NOVO', 'AGENDADO');

      expect(screen.queryByRole('dialog', { name: 'Agendar horário' })).not.toBeInTheDocument();
      await waitFor(() => expect(LeadService.updateStatus).toHaveBeenCalledTimes(1));
      expect((LeadService.updateStatus as any).mock.calls[0].slice(0, 2)).toEqual(['l1', 'AGENDADO']);
      expect(LeadService.agendar).not.toHaveBeenCalled();
    });

    it('"Mover lead" → "Agendados" não abre o modal e grava pelo updateStatus', async () => {
      const user = userEvent.setup();
      renderKanban();
      await screen.findByText('Maria Silva');

      await user.click(screen.getByRole('button', { name: 'Mover lead' }));
      await user.click(screen.getByRole('button', { name: 'Agendados' }));

      expect(screen.queryByRole('dialog', { name: 'Agendar horário' })).not.toBeInTheDocument();
      await waitFor(() => expect(LeadService.updateStatus).toHaveBeenCalledTimes(1));
      expect((LeadService.updateStatus as any).mock.calls[0].slice(0, 2)).toEqual(['l1', 'AGENDADO']);
      expect(LeadService.agendar).not.toHaveBeenCalled();
    });

    it('reordenar dentro de "Agendados" segue o fluxo antigo (updateStatus)', async () => {
      quadro = {
        AGENDADO: [
          lead({ id: 'a', nome: 'Lead A', status: 'AGENDADO' }),
          lead({ id: 'b', nome: 'Lead B', status: 'AGENDADO' }),
        ],
      };
      renderKanban();
      await screen.findByText('Lead A');
      await arrastar('AGENDADO', 'AGENDADO', 'a', 1);

      await waitFor(() => expect(LeadService.updateStatus).toHaveBeenCalledTimes(1));
      expect((LeadService.updateStatus as any).mock.calls[0].slice(0, 2)).toEqual(['a', 'AGENDADO']);
    });

    it('o cartão em "Agendados" não mostra data, aviso, botões nem o lembrete', async () => {
      quadro = {
        AGENDADO: [
          lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z' }),
          lead({ id: 'l2', nome: 'João Souza', status: 'AGENDADO', agendado_em: '2026-11-09T18:30:00Z' }),
          lead({ id: 'l3', nome: 'Ana Lima', status: 'AGENDADO' }),
        ],
      };
      renderKanban();
      await screen.findByText('Maria Silva');

      expect(screen.queryByText(/^Agendado para /)).not.toBeInTheDocument();
      expect(screen.queryByText('Sem horário marcado')).not.toBeInTheDocument();
      expect(screen.queryByText('O horário passou: registre o que aconteceu.')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alterar horário' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Marcar horário' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Lembrar pelo WhatsApp' })).not.toBeInTheDocument();
    });

    it('"Agendados" fica na ordem da API', async () => {
      quadro = {
        AGENDADO: [
          lead({ id: 'a', nome: 'Lead A', status: 'AGENDADO', agendado_em: '2026-11-12T12:00:00Z' }),
          lead({ id: 'b', nome: 'Lead B', status: 'AGENDADO' }),
          lead({ id: 'c', nome: 'Lead C', status: 'AGENDADO', agendado_em: '2026-11-09T12:00:00Z' }),
        ],
      };
      renderKanban();
      await screen.findByText('Lead A');
      expect(nomesNaColuna('Agendados')).toEqual(['Lead A', 'Lead B', 'Lead C']);
    });

    it('a inatividade conta só de updated_at, mesmo com horário futuro', async () => {
      quadro = {
        AGENDADO: [lead({ id: 'l1', nome: 'Maria Silva', status: 'AGENDADO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-11T12:00:00Z' })],
      };
      renderKanban();
      await screen.findByText('Maria Silva');
      expect(screen.getByText(/^Inatividade crítica/).textContent).toBe(
        'Inatividade crítica: mais de 231h sem atualizações. Recomendado: Contato urgente.',
      );
    });

    it('CA-80: a flag ligando depois da carga reordena "Agendados" pela data', async () => {
      quadro = {
        AGENDADO: [
          lead({ id: 'a', nome: 'Lead A', status: 'AGENDADO', agendado_em: '2026-11-12T12:00:00Z' }),
          lead({ id: 'b', nome: 'Lead B', status: 'AGENDADO' }),
          lead({ id: 'c', nome: 'Lead C', status: 'AGENDADO', agendado_em: '2026-11-09T12:00:00Z' }),
        ],
      };
      const { rerender } = renderKanban();
      await screen.findByText('Lead A');
      expect(nomesNaColuna('Agendados')).toEqual(['Lead A', 'Lead B', 'Lead C']);

      flag.ligada = true;
      rerender(
        <AcessosProvider>
          <KanbanPage />
        </AcessosProvider>,
      );
      await waitFor(() => expect(nomesNaColuna('Agendados')).toEqual(['Lead C', 'Lead A', 'Lead B']));
    });
  });
});
