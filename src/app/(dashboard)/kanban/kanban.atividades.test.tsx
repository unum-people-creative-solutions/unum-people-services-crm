import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KanbanPage from './page';
import { AcessosService, AtividadeService, FunilService, GoogleAgendaService, LeadService, type MeusAcessos } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import atividades from '@/services/__fixtures__/get-atividades.json';
import funilPadrao from '@/services/__fixtures__/get-crm-funil-padrao.json';

// spec: crm-funil-e-atividades-f3 ATV-06 e decisões de 12/11/2026.
// "agora" = 2026-11-12T15:00:00Z (12:00 em Brasília).

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: () => nav.params,
}));

vi.mock('@/services/api', async () => {
  const real = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  const { default: funil } = await import('@/services/__fixtures__/get-crm-funil-padrao.json');
  return {
    default: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
    mensagemDeErro: real.mensagemDeErro,
    MENSAGEM_SEM_PERMISSAO: real.MENSAGEM_SEM_PERMISSAO,
    AcessosService: { get: vi.fn() },
    FunilService: { ler: vi.fn(async () => funil), salvar: vi.fn() },
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
    AtividadeService: { listar: vi.fn(), criar: vi.fn(), concluir: vi.fn(), cancelar: vi.fn(), sincronizar: vi.fn() },
    GoogleAgendaService: { situacao: vi.fn() },
    InteracaoService: { listar: vi.fn(), criar: vi.fn(), alterar: vi.fn(), apagar: vi.fn() },
    TenantService: { list: vi.fn(), listMyTenants: vi.fn() },
  };
});

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

const flags = vi.hoisted(() => ({ atividades: true, agendamento: true, interacoes: true, googleAgenda: false }));
vi.mock('@/hooks/useFlag', () => ({
  useFlag: (chave: string) => {
    if (chave === 'crm-atividades') return flags.atividades;
    if (chave === 'crm-agendamento') return flags.agendamento;
    if (chave === 'crm-interacoes') return flags.interacoes;
    if (chave === 'crm-google-agenda') return flags.googleAgenda;
    return false;
  },
}));

const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((r: unknown) => Promise<void> | void) }));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  Droppable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), droppableProps: {} }, {}),
  Draggable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), dragHandleProps: {} }, {}),
}));

vi.mock('xlsx', () => ({ utils: {}, writeFile: vi.fn() }));

const GESTOR: MeusAcessos = {
  tenant_id: 'tenant-1',
  operador: false,
  ferramentas: [{
    id: 'crm',
    nome: 'CRM',
    contratada: true,
    papel: { id: 'gestor', nome: 'Gestor', sistema: true, implicito: false },
    permissoes: ['crm.lead.ver', 'crm.lead.editar', 'crm.lead.excluir'],
  }],
};

const LEITOR: MeusAcessos = {
  tenant_id: 'tenant-1',
  operador: false,
  ferramentas: [{
    id: 'crm',
    nome: 'CRM',
    contratada: true,
    papel: { id: 'leitor', nome: 'Leitor', sistema: false, implicito: false },
    permissoes: ['crm.lead.ver'],
  }],
};

const CONSULTA = '11111111-1111-4111-8111-111111111111';
const TAREFA = '22222222-2222-4222-8222-222222222222';

function lead(parcial: { id: string; nome: string; status: string; updated_at?: string; sales?: { id: string; valor: number; data: string }[] }) {
  return {
    telefone: '11988887777',
    email: 'maria@exemplo.com',
    origem: 'Indicação',
    updated_at: '2026-11-12T14:00:00Z',
    created_at: '2026-11-01T00:00:00Z',
    sales: [],
    ...parcial,
  };
}

let quadro: Record<string, ReturnType<typeof lead>[]> = {};
let porLead: Record<string, { itens: typeof atividades.itens }> = {};

function renderKanban() {
  return render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );
}

async function arrastar(de: string, para: string, id = 'lead-hoje') {
  await act(async () => {
    await dnd.onDragEnd?.({
      source: { droppableId: de, index: 0 },
      destination: { droppableId: para, index: 0 },
      draggableId: id,
    });
  });
}

function erroApi(status: number, data: Record<string, string>) {
  return { response: { status, data } };
}

describe('Atividades no quadro (ATV-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    flags.atividades = true;
    flags.agendamento = true;
    flags.googleAgenda = false;
    flags.interacoes = true;
    nav.params = new URLSearchParams();
    dnd.onDragEnd = null;
    quadro = { NOVO: [lead({ id: 'lead-hoje', nome: 'Maria Hoje', status: 'NOVO' })] };
    porLead = { 'lead-hoje': atividades };
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { email: 'user@test.com', name: 'User', tenantId: 'tenant-1', role: 'USER' },
      logout: vi.fn(),
      setSession: vi.fn(),
    });
    (useTenant as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTenantId: 'tenant-1',
      activeTenantName: 'Consultório',
      availableTenants: [{ id: 'tenant-1', nome_negocio: 'Consultório' }],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
    (AcessosService.get as ReturnType<typeof vi.fn>).mockResolvedValue(GESTOR);
    (FunilService.ler as ReturnType<typeof vi.fn>).mockResolvedValue(funilPadrao);
    (LeadService.list as ReturnType<typeof vi.fn>).mockImplementation((status: string) => Promise.resolve(quadro[status] ?? []));
    (LeadService.listSalesByMonth as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (LeadService.updateStatus as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (AtividadeService.listar as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => porLead[id] ?? { itens: [] });
    (AtividadeService.criar as ReturnType<typeof vi.fn>).mockImplementation(async (_id: string, _tenant: string, corpo: { tipo: string; descricao: string; vence_em: string }) => ({
      id: 'nova-atividade',
      situacao: 'pendente',
      criada_em: '2026-11-12T15:00:00Z',
      criada_por: 'user@test.com',
      ...corpo,
    }));
    (AtividadeService.concluir as ReturnType<typeof vi.fn>).mockImplementation(async (_lead: string, id: string) => ({
      ...atividades.itens[0],
      id,
      situacao: 'feita',
    }));
    (AtividadeService.cancelar as ReturnType<typeof vi.fn>).mockImplementation(async (_lead: string, id: string) => ({
      ...atividades.itens[1],
      id,
      situacao: 'cancelada',
    }));
    (GoogleAgendaService.situacao as ReturnType<typeof vi.fn>).mockResolvedValue({ conectada: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('o cartão mostra a pendente de vence_em mais cedo, em Brasília', async () => {
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    const proxima = await within(coluna).findByRole('article', { name: 'Próxima atividade: Consulta' });

    expect(proxima).toHaveTextContent('qui 12/11 às 13:00');
    expect(proxima).toHaveTextContent('Retorno da avaliação');
    expect(within(coluna).queryByRole('article', { name: 'Próxima atividade: Ligar' })).not.toBeInTheDocument();
    expect(within(coluna).queryByText('Já liguei')).not.toBeInTheDocument();
    expect(AtividadeService.listar).toHaveBeenCalledWith('lead-hoje', 'tenant-1');
  });

  it('filtro Hoje mostra pendente que vence no dia de Brasília e deixa Ganho e Perdido de fora', async () => {
    const user = userEvent.setup();
    quadro = {
      NOVO: [
        lead({ id: 'lead-hoje', nome: 'Maria Hoje', status: 'NOVO' }),
        lead({ id: 'lead-amanha', nome: 'Bruno Amanha', status: 'NOVO' }),
      ],
      ATENDIMENTO: [
        lead({ id: 'lead-noite', nome: 'Noite Limite', status: 'ATENDIMENTO' }),
        lead({ id: 'lead-virada', nome: 'Virada Dia', status: 'ATENDIMENTO' }),
      ],
      GANHO: [lead({ id: 'lead-ganho', nome: 'Convertido Ganho', status: 'GANHO' })],
      PERDIDO: [lead({ id: 'lead-perdido', nome: 'Desistiu Perdido', status: 'PERDIDO' })],
    };
    porLead = {
      'lead-hoje': atividades,
      'lead-amanha': { itens: [{ ...atividades.itens[0], id: 'amanha', tipo: 'ligar', descricao: 'Amanhã cedo', vence_em: '2026-11-13T15:00:00Z', situacao: 'pendente' }] },
      'lead-noite': { itens: [{ ...atividades.itens[0], id: 'noite', tipo: 'ligar', descricao: 'Ainda hoje', vence_em: '2026-11-13T02:30:00Z', situacao: 'pendente' }] },
      'lead-virada': { itens: [{ ...atividades.itens[0], id: 'virada', tipo: 'ligar', descricao: 'Já é outro dia', vence_em: '2026-11-13T03:00:00Z', situacao: 'pendente' }] },
      'lead-ganho': { itens: [{ ...atividades.itens[0], id: 'ganho', vence_em: '2026-11-12T18:00:00Z', situacao: 'pendente' }] },
      'lead-perdido': { itens: [{ ...atividades.itens[0], id: 'perdido', vence_em: '2026-11-12T18:00:00Z', situacao: 'pendente' }] },
    };
    renderKanban();
    expect(await screen.findByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('Bruno Amanha')).toBeInTheDocument();
    expect(screen.getByText('Convertido Ganho')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));

    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Maria Hoje')).toBeInTheDocument();
    expect(screen.getByText('Noite Limite')).toBeInTheDocument();
    expect(screen.queryByText('Bruno Amanha')).not.toBeInTheDocument();
    expect(screen.queryByText('Virada Dia')).not.toBeInTheDocument();
    expect(screen.queryByText('Convertido Ganho')).not.toBeInTheDocument();
    expect(screen.queryByText('Desistiu Perdido')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByText('Virada Dia')).toBeInTheDocument();
    expect(screen.getByText('Convertido Ganho')).toBeInTheDocument();
    expect(screen.getByText('Desistiu Perdido')).toBeInTheDocument();
  });

  it('lead com pendente no futuro não mostra inatividade', async () => {
    quadro = {
      NOVO: [
        lead({ id: 'lead-antigo', nome: 'Antigo Parado', status: 'NOVO', updated_at: '2026-11-01T00:00:00Z' }),
        lead({ id: 'lead-futuro', nome: 'Futuro Ativo', status: 'NOVO', updated_at: '2026-11-01T00:00:00Z' }),
      ],
    };
    porLead = {
      'lead-antigo': { itens: [] },
      'lead-futuro': { itens: [{ ...atividades.itens[6], vence_em: '2026-11-20T15:00:00Z', situacao: 'pendente' }] },
    };
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await within(coluna).findByRole('article', { name: 'Próxima atividade: Retomar contato' });

    expect(within(coluna).getAllByText(/inatividade/i)).toHaveLength(1);
    expect(within(coluna).getByText(/Inatividade crítica/)).toBeInTheDocument();
  });

  it('Ações registra a consulta à mão e o POST omite o lembrete vazio', async () => {
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    expect(within(coluna).queryByRole('button', { name: 'Agendar consulta' })).not.toBeInTheDocument();
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Ações' }));

    expect(within(dialog).getByRole('tab', { name: 'Ações' })).toHaveAttribute('aria-selected', 'true');
    const form = within(dialog).getByRole('form', { name: 'Nova atividade' });
    expect(within(form).getByRole('combobox', { name: 'Tipo' })).toHaveValue('consulta');
    for (const nome of ['Consulta', 'Ligar', 'WhatsApp', 'E-mail', 'Reunião', 'Tarefa', 'Retomar contato']) {
      expect(within(form).getByRole('option', { name: nome })).toBeInTheDocument();
    }
    for (const nome of ['Sem lembrete', 'Na hora', '15 min', '1 hora', '1 dia']) {
      expect(within(form).getByRole('option', { name: nome })).toBeInTheDocument();
    }

    const nova = within(dialog).getByRole('form', { name: 'Nova atividade' });
    await user.type(within(nova).getByRole('textbox', { name: 'Descrição' }), 'Retorno marcado');
    fireEvent.change(within(nova).getByLabelText('Data'), { target: { value: '2026-11-12' } });
    fireEvent.change(within(nova).getByLabelText('Hora'), { target: { value: '15:30' } });
    fireEvent.change(within(nova).getByLabelText('Duração (min)'), { target: { value: '50' } });
    await user.click(within(nova).getByRole('button', { name: 'Registrar atividade' }));

    await waitFor(() => expect(AtividadeService.criar).toHaveBeenCalledWith('lead-hoje', 'tenant-1', {
      tipo: 'consulta',
      descricao: 'Retorno marcado',
      vence_em: '2026-11-12T18:30:00Z',
      duracao_min: 50,
    }));
    const corpo = (AtividadeService.criar as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(corpo.lembrar_antes_min).toBeUndefined();
    expect(LeadService.updateStatus).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('tab', { name: 'Atividades' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Na hora manda lembrar_antes_min 0; 1 hora manda 60', async () => {
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Ações' }));
    const form = within(dialog).getByRole('form', { name: 'Nova atividade' });
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Tipo' }), 'tarefa');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Lembrete' }), '0');
    await user.type(within(form).getByRole('textbox', { name: 'Descrição' }), 'Ligar na hora');
    fireEvent.change(within(form).getByLabelText('Data'), { target: { value: '2026-11-12' } });
    fireEvent.change(within(form).getByLabelText('Hora'), { target: { value: '16:00' } });
    await user.click(within(form).getByRole('button', { name: 'Registrar atividade' }));

    await waitFor(() => expect(AtividadeService.criar).toHaveBeenCalledWith('lead-hoje', 'tenant-1', {
      tipo: 'tarefa',
      descricao: 'Ligar na hora',
      vence_em: '2026-11-12T19:00:00Z',
      lembrar_antes_min: 0,
    }));

    await user.click(within(dialog).getByRole('tab', { name: 'Ações' }));
    const deNovo = within(dialog).getByRole('form', { name: 'Nova atividade' });
    await user.selectOptions(within(deNovo).getByRole('combobox', { name: 'Tipo' }), 'email');
    await user.selectOptions(within(deNovo).getByRole('combobox', { name: 'Lembrete' }), '60');
    await user.type(within(deNovo).getByRole('textbox', { name: 'Descrição' }), 'E-mail em uma hora');
    fireEvent.change(within(deNovo).getByLabelText('Data'), { target: { value: '2026-11-13' } });
    fireEvent.change(within(deNovo).getByLabelText('Hora'), { target: { value: '09:00' } });
    await user.click(within(deNovo).getByRole('button', { name: 'Registrar atividade' }));

    await waitFor(() => expect(AtividadeService.criar).toHaveBeenLastCalledWith('lead-hoje', 'tenant-1', {
      tipo: 'email',
      descricao: 'E-mail em uma hora',
      vence_em: '2026-11-13T12:00:00Z',
      lembrar_antes_min: 60,
    }));
  });

  it('400 atividade_invalida mostra o motivo no alerta e o rascunho fica', async () => {
    (AtividadeService.criar as ReturnType<typeof vi.fn>).mockRejectedValue(
      erroApi(400, { error: 'atividade_invalida', motivo: 'descricao' }),
    );
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Ações' }));
    const form = within(dialog).getByRole('form', { name: 'Nova atividade' });
    await user.type(within(form).getByRole('textbox', { name: 'Descrição' }), 'rascunho que fica');
    fireEvent.change(within(form).getByLabelText('Data'), { target: { value: '2026-11-12' } });
    fireEvent.change(within(form).getByLabelText('Hora'), { target: { value: '15:30' } });
    await user.click(within(form).getByRole('button', { name: 'Registrar atividade' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Atividade inválida: descricao.');
    expect(within(form).getByRole('textbox', { name: 'Descrição' })).toHaveValue('rascunho que fica');
  });

  it('sem data e hora avisa e não chama o POST', async () => {
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Ações' }));
    const form = within(dialog).getByRole('form', { name: 'Nova atividade' });
    await user.type(within(form).getByRole('textbox', { name: 'Descrição' }), 'rascunho que fica');
    fireEvent.change(within(form).getByLabelText('Data'), { target: { value: '2026-11-12' } });
    await user.click(within(form).getByRole('button', { name: 'Registrar atividade' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Informe a data e a hora.');
    expect(AtividadeService.criar).not.toHaveBeenCalled();
    expect(within(form).getByRole('textbox', { name: 'Descrição' })).toHaveValue('rascunho que fica');
  });

  it('Concluir e Cancelar nas pendentes atualizam a lista', async () => {
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Atividades' }));
    const consulta = await within(dialog).findByRole('article', { name: 'Consulta: Retorno da avaliação' });
    expect(consulta).toHaveTextContent('qui 12/11 às 13:00');
    expect(consulta).toHaveTextContent('Pendente');
    expect(within(consulta).getByRole('button', { name: 'Concluir' })).toBeInTheDocument();
    expect(within(within(dialog).getByRole('article', { name: 'Ligar: Já liguei' })).queryByRole('button', { name: 'Concluir' })).not.toBeInTheDocument();

    await user.click(within(consulta).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(AtividadeService.concluir).toHaveBeenCalledWith('lead-hoje', CONSULTA, 'tenant-1'));
    const consultaFeita = within(dialog).getByRole('article', { name: 'Consulta: Retorno da avaliação' });
    expect(consultaFeita).toHaveTextContent('Feita');
    expect(within(consultaFeita).queryByRole('button', { name: 'Concluir' })).not.toBeInTheDocument();

    const tarefa = within(dialog).getByRole('article', { name: 'Tarefa: Enviar proposta' });
    await user.click(within(tarefa).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(AtividadeService.cancelar).toHaveBeenCalledWith('lead-hoje', TAREFA, 'tenant-1'));
    expect(within(dialog).getByRole('article', { name: 'Tarefa: Enviar proposta' })).toHaveTextContent('Cancelada');
  });

  it('sem crm.lead.editar a lista aparece e não há formulário nem Concluir', async () => {
    (AcessosService.get as ReturnType<typeof vi.fn>).mockResolvedValue(LEITOR);
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    expect(within(coluna).queryByRole('button', { name: 'Agendar consulta' })).not.toBeInTheDocument();
    await user.click(within(coluna).getByRole('button', { name: 'Ver lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Atividades' }));

    expect(await within(dialog).findByRole('article', { name: 'Consulta: Retorno da avaliação' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('form', { name: 'Nova atividade' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Concluir' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Agendar consulta' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Sincronizar' })).not.toBeInTheDocument();
  });

  it('checkbox marcado com a conta conectada; desabilitado sem conta; a lista sincroniza', async () => {
    flags.googleAgenda = true;
    (GoogleAgendaService.situacao as ReturnType<typeof vi.fn>).mockResolvedValue({
      conectada: true,
      situacao: 'ativa',
      email: 'a@b.c',
      agenda_id: 'primary',
      agenda_nome: 'Agenda',
      duracao_padrao_min: 50,
      conflito: false,
      lista_agendas: true,
    });
    (AtividadeService.sincronizar as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TAREFA,
      tipo: 'tarefa',
      descricao: 'Enviar proposta',
      vence_em: '2026-11-12T21:00:00Z',
      situacao: 'pendente',
      criada_em: '2026-11-12T15:00:00Z',
      criada_por: 'user@test.com',
      google_situacao: 'ok',
      google_evento_link: 'https://www.google.com/calendar/event?eid=abc',
    });
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Ações' }));
    const caixa = await within(dialog).findByRole('checkbox', { name: 'Sincronizar com o Google Calendar' });
    expect(caixa).toBeChecked();
    expect(caixa).toBeEnabled();

    await user.click(within(dialog).getByRole('tab', { name: 'Atividades' }));
    const tarefa = await within(dialog).findByRole('article', { name: 'Tarefa: Enviar proposta' });
    expect(within(tarefa).queryByRole('link', { name: 'Abrir evento' })).not.toBeInTheDocument();
    await user.click(within(tarefa).getByRole('button', { name: 'Sincronizar' }));
    await waitFor(() => expect(AtividadeService.sincronizar).toHaveBeenCalledWith('lead-hoje', TAREFA, 'tenant-1'));
    expect(within(dialog).getByRole('article', { name: 'Tarefa: Enviar proposta' })).toHaveTextContent('Na agenda');
    expect(within(dialog).getByRole('link', { name: 'Abrir evento' })).toHaveAttribute('href', 'https://www.google.com/calendar/event?eid=abc');
    expect(within(dialog).queryByRole('button', { name: 'Remover evento' })).not.toBeInTheDocument();
  });

  it('sem conta Google o checkbox fica desabilitado e avisa para conectar', async () => {
    flags.googleAgenda = true;
    (GoogleAgendaService.situacao as ReturnType<typeof vi.fn>).mockResolvedValue({ conectada: false });
    const user = userEvent.setup();
    renderKanban();
    await screen.findByText('Maria Hoje');
    await user.click(screen.getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(dialog).getByRole('tab', { name: 'Ações' }));
    const caixa = await within(dialog).findByRole('checkbox', { name: 'Sincronizar com o Google Calendar' });
    expect(caixa).toBeDisabled();
    expect(caixa).not.toBeChecked();
    expect(within(dialog).getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/settings?aba=google-agenda');
  });

  it('falha ao listar as atividades do quadro aparece no alerta', async () => {
    (AtividadeService.listar as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('rede'));
    renderKanban();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as atividades.');
  });

  it('com a flag ligada, mover para a coluna de papel agendado não abre o modal antigo', async () => {
    const user = userEvent.setup();
    const quadroInicial = renderKanban();
    await screen.findByText('Maria Hoje');
    await arrastar('NOVO', 'AGENDADO');

    expect(screen.queryByRole('dialog', { name: 'Agendar horário' })).not.toBeInTheDocument();
    await waitFor(() => expect(LeadService.updateStatus).toHaveBeenCalled());
    expect((LeadService.updateStatus as ReturnType<typeof vi.fn>).mock.calls[0].slice(0, 2)).toEqual(['lead-hoje', 'AGENDADO']);
    expect(LeadService.agendar).not.toHaveBeenCalled();

    quadroInicial.unmount();
    quadro = { NOVO: [lead({ id: 'lead-hoje', nome: 'Maria Hoje', status: 'NOVO' })] };
    renderKanban();
    await screen.findByText('Maria Hoje');
    await user.click(screen.getByRole('button', { name: 'Mover lead' }));
    await user.click(screen.getByRole('button', { name: 'Agendados' }));
    expect(screen.queryByRole('dialog', { name: 'Agendar horário' })).not.toBeInTheDocument();
    await waitFor(() => expect(LeadService.updateStatus).toHaveBeenCalledTimes(2));
  });

  it('a aba Dados não mostra venda; a lista fica na aba Vendas', async () => {
    quadro = {
      NOVO: [lead({
        id: 'lead-hoje',
        nome: 'Maria Hoje',
        status: 'NOVO',
        sales: [{ id: 's1', valor: 150, data: '2026-11-01T00:00:00Z' }],
      })],
    };
    const user = userEvent.setup();
    renderKanban();
    await screen.findByText('Maria Hoje');
    const coluna = screen.getByRole('region', { name: 'Novos Leads' });
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });

    const dados = within(dialog).getByRole('tabpanel', { name: 'Dados' });
    expect(within(dados).queryByRole('heading', { name: 'Vendas do mês' })).not.toBeInTheDocument();
    expect(within(dados).queryByText(/150/)).not.toBeInTheDocument();
    expect(within(dados).queryByRole('button', { name: 'Registrar venda' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Vendas' }));
    expect(within(dialog).getByRole('article', { name: /Venda R\$\s*150,00/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('form', { name: 'Nova venda' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Registrar venda' })).toBeInTheDocument();
    const venda = within(dialog).getByRole('form', { name: 'Nova venda' });
    fireEvent.change(within(venda).getByLabelText('Valor'), { target: { value: '80' } });
    fireEvent.change(within(venda).getByLabelText('Data'), { target: { value: '2026-11-12' } });
    await user.click(within(venda).getByRole('button', { name: 'Registrar venda' }));
    await waitFor(() => expect(LeadService.addSale).toHaveBeenCalled());
    expect(within(dialog).getByRole('tab', { name: 'Vendas' })).toHaveAttribute('aria-selected', 'true');
  });

  it('coluna sem ação só muda o cartão e não abre a ficha', async () => {
    renderKanban();
    await screen.findByText('Maria Hoje');
    await arrastar('NOVO', 'ATENDIMENTO');
    await waitFor(() => expect(LeadService.updateStatus).toHaveBeenCalledWith('lead-hoje', 'ATENDIMENTO', 0, undefined, 'tenant-1'));
    expect(screen.queryByRole('dialog', { name: 'Ficha do lead' })).not.toBeInTheDocument();
  });

  it('Ganho obrigatório abre Vendas e fechar devolve o cartão sem gravar', async () => {
    const user = userEvent.setup();
    renderKanban();
    await screen.findByText('Maria Hoje');
    await arrastar('NOVO', 'GANHO');
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(dialog).getByRole('tab', { name: 'Vendas' })).toHaveAttribute('aria-selected', 'true');
    expect(LeadService.updateStatus).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ficha do lead' })).not.toBeInTheDocument());
    expect(LeadService.updateStatus).not.toHaveBeenCalled();
    expect(await screen.findByRole('region', { name: 'Novos Leads' })).toHaveTextContent('Maria Hoje');
  });

  it('com a flag desligada, o quadro e o modal de agendamento de hoje permanecem', async () => {
    flags.atividades = false;
    flags.interacoes = false;
    renderKanban();
    await screen.findByText('Maria Hoje');
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agendar consulta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Atividades' })).not.toBeInTheDocument();
    expect(AtividadeService.listar).not.toHaveBeenCalled();

    await arrastar('NOVO', 'AGENDADO');
    expect(screen.getByRole('dialog', { name: 'Agendar horário' })).toBeInTheDocument();
    expect(LeadService.updateStatus).not.toHaveBeenCalled();
  });
});
