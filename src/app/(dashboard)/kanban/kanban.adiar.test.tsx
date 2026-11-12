import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KanbanPage from './page';
import { AcessosService, AtividadeService, FunilService, LeadService, type MeusAcessos } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import funilPadrao from '@/services/__fixtures__/get-crm-funil-padrao.json';

// spec: crm-funil-e-atividades-f4 ADI-01, ADI-03 e ADI-05.
// "agora" = 2026-11-12T15:00:00Z (12:00 em Brasília). 09:00 em Brasília = 12:00Z.

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
      adiar: vi.fn(),
    },
    AtividadeService: { listar: vi.fn(), criar: vi.fn(), concluir: vi.fn(), cancelar: vi.fn() },
    InteracaoService: { listar: vi.fn(async () => ({ itens: [] })), criar: vi.fn(), alterar: vi.fn(), apagar: vi.fn() },
    TenantService: { list: vi.fn(), listMyTenants: vi.fn() },
  };
});

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

const flags = vi.hoisted(() => ({ atividades: true, adiar: true, interacoes: true }));
vi.mock('@/hooks/useFlag', () => ({
  useFlag: (chave: string) => {
    if (chave === 'crm-atividades') return flags.atividades;
    if (chave === 'crm-adiar') return flags.adiar;
    if (chave === 'crm-interacoes') return flags.interacoes;
    return false;
  },
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: any) => <div>{children}</div>,
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

function lead(parcial: { id: string; nome: string; status: string }) {
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

function retomar(id: string, venceEm: string, situacao = 'pendente', descricao = 'Voltar a falar') {
  return {
    id,
    tipo: 'retomar',
    descricao,
    vence_em: venceEm,
    situacao,
    criada_em: '2026-11-12T15:00:00Z',
    criada_por: 'user@test.com',
  };
}

let quadro: Record<string, ReturnType<typeof lead>[]> = {};
let porLead: Record<string, { itens: ReturnType<typeof retomar>[] }> = {};

function renderKanban() {
  return render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );
}

function erroApi(status: number, data: Record<string, string>) {
  return { response: { status, data } };
}

async function abrirFiltros(user: { click: (el: Element) => Promise<void> }) {
  const botao = screen.getByRole('button', { name: /^Filtros/ });
  if (botao.getAttribute('aria-expanded') !== 'true') await user.click(botao);
}

describe('Adiar o lead (ADI-01, ADI-03, ADI-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    flags.atividades = true;
    flags.adiar = true;
    flags.interacoes = true;
    nav.params = new URLSearchParams();
    quadro = { NOVO: [lead({ id: 'lead-novo', nome: 'Maria Nova', status: 'NOVO' })] };
    porLead = { 'lead-novo': { itens: [] } };
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
    (AtividadeService.listar as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => porLead[id] ?? { itens: [] });
    (LeadService.adiar as ReturnType<typeof vi.fn>).mockImplementation(async (_id: string, _tenant: string, corpo: { vence_em: string; descricao?: string }) => (
      retomar('retomar-nova', corpo.vence_em, 'pendente', corpo.descricao ?? '')
    ));
    (AtividadeService.concluir as ReturnType<typeof vi.fn>).mockImplementation(async (_lead: string, id: string) => (
      retomar(id, '2026-11-13T12:00:00Z', 'feita')
    ));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ADI-01: Adiar cria a retomar, o lead some e Adiados mostra só ele; Retomar agora conclui', async () => {
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(await within(coluna).findByRole('button', { name: 'Adiar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Adiar lead' });

    await user.click(within(dialogo).getByRole('button', { name: 'Amanhã' }));

    await waitFor(() => expect(LeadService.adiar).toHaveBeenCalledWith('lead-novo', 'tenant-1', {
      vence_em: '2026-11-13T12:00:00Z',
    }));
    expect(Object.keys((LeadService.adiar as ReturnType<typeof vi.fn>).mock.calls[0][2])).toEqual(['vence_em']);
    await waitFor(() => expect(within(coluna).queryByText('Maria Nova')).not.toBeInTheDocument());

    await abrirFiltros(user);
    const filtro = screen.getByRole('button', { name: 'Adiados (1)' });
    expect(filtro).toHaveAttribute('aria-pressed', 'false');
    await user.click(filtro);

    expect(screen.getByRole('button', { name: 'Filtros, 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Adiados (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(coluna).getByText('Maria Nova')).toBeInTheDocument();
    await user.click(within(coluna).getByRole('button', { name: 'Retomar agora' }));

    await waitFor(() => expect(AtividadeService.concluir).toHaveBeenCalledWith('lead-novo', 'retomar-nova', 'tenant-1'));
    await waitFor(() => expect(within(coluna).queryByText('Maria Nova')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Adiados (0)' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Adiados (0)' }));
    expect(within(coluna).getByText('Maria Nova')).toBeInTheDocument();
    expect(within(coluna).queryByRole('button', { name: 'Retomar agora' })).not.toBeInTheDocument();
  });

  it('a ficha também adia, com motivo, e adiar de novo troca a retomar pendente', async () => {
    const user = userEvent.setup();
    porLead = { 'lead-novo': { itens: [retomar('retomar-velha', '2026-12-01T12:00:00Z')] } };
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await waitFor(() => expect(within(coluna).queryByText('Maria Nova')).not.toBeInTheDocument());

    await abrirFiltros(user);
    await user.click(screen.getByRole('button', { name: 'Adiados (1)' }));
    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await user.click(within(ficha).getByRole('button', { name: 'Adiar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Adiar lead' });
    await user.type(within(dialogo).getByRole('textbox', { name: 'Motivo' }), 'cliente viaja');
    await user.click(within(dialogo).getByRole('button', { name: 'Em 1 semana' }));

    await waitFor(() => expect(LeadService.adiar).toHaveBeenCalledWith('lead-novo', 'tenant-1', {
      vence_em: '2026-11-19T12:00:00Z',
      descricao: 'cliente viaja',
    }));
    await user.click(within(coluna).getByRole('button', { name: 'Retomar agora' }));
    await waitFor(() => expect(AtividadeService.concluir).toHaveBeenCalledWith('lead-novo', 'retomar-nova', 'tenant-1'));
    expect(AtividadeService.concluir).not.toHaveBeenCalledWith('lead-novo', 'retomar-velha', 'tenant-1');
  });

  it('em 1 mês e a data sem hora gravam 09:00; com hora, usa a escolhida', async () => {
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(await within(coluna).findByRole('button', { name: 'Adiar' }));
    let dialogo = await screen.findByRole('dialog', { name: 'Adiar lead' });
    await user.click(within(dialogo).getByRole('button', { name: 'Em 1 mês' }));
    await waitFor(() => expect(LeadService.adiar).toHaveBeenCalledWith('lead-novo', 'tenant-1', {
      vence_em: '2026-12-12T12:00:00Z',
    }));

    await abrirFiltros(user);
    await user.click(screen.getByRole('button', { name: 'Adiados (1)' }));
    await user.click(within(coluna).getByRole('button', { name: 'Adiar' }));
    dialogo = await screen.findByRole('dialog', { name: 'Adiar lead' });
    fireEvent.change(within(dialogo).getByLabelText('Data'), { target: { value: '2026-11-20' } });
    await user.click(within(dialogo).getByRole('button', { name: 'Adiar' }));
    await waitFor(() => expect(LeadService.adiar).toHaveBeenLastCalledWith('lead-novo', 'tenant-1', {
      vence_em: '2026-11-20T12:00:00Z',
    }));

    await user.click(within(coluna).getByRole('button', { name: 'Adiar' }));
    dialogo = await screen.findByRole('dialog', { name: 'Adiar lead' });
    fireEvent.change(within(dialogo).getByLabelText('Data'), { target: { value: '2026-11-20' } });
    fireEvent.change(within(dialogo).getByLabelText('Hora'), { target: { value: '15:45' } });
    await user.type(within(dialogo).getByRole('textbox', { name: 'Motivo' }), '   ');
    await user.click(within(dialogo).getByRole('button', { name: 'Adiar' }));
    await waitFor(() => expect(LeadService.adiar).toHaveBeenLastCalledWith('lead-novo', 'tenant-1', {
      vence_em: '2026-11-20T18:45:00Z',
    }));
    expect(Object.keys((LeadService.adiar as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2] ?? {})).toEqual(['vence_em']);
  });

  it('sem data o diálogo avisa e não chama o POST', async () => {
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(await within(coluna).findByRole('button', { name: 'Adiar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Adiar lead' });
    await user.click(within(dialogo).getByRole('button', { name: 'Adiar' }));

    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Informe a data.');
    expect(LeadService.adiar).not.toHaveBeenCalled();
    expect(within(coluna).getByText('Maria Nova')).toBeInTheDocument();
  });

  it('400 adiar_invalido e 409 adiar_indisponivel aparecem no alerta e o lead fica', async () => {
    const user = userEvent.setup();
    (LeadService.adiar as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(erroApi(400, { error: 'adiar_invalido', motivo: 'vence_em' }))
      .mockRejectedValueOnce(erroApi(409, { error: 'adiar_indisponivel' }))
      .mockRejectedValueOnce(erroApi(403, { error: 'recurso_desligado' }));
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await user.click(await within(coluna).findByRole('button', { name: 'Adiar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Adiar lead' });

    await user.click(within(dialogo).getByRole('button', { name: 'Amanhã' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Não foi possível adiar: vence_em.');
    expect(within(coluna).getByText('Maria Nova')).toBeInTheDocument();

    await user.click(within(dialogo).getByRole('button', { name: 'Em 1 semana' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Não é possível adiar este lead.');

    await user.click(within(dialogo).getByRole('button', { name: 'Em 1 mês' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Recurso desligado.');
    expect(within(coluna).getByText('Maria Nova')).toBeInTheDocument();
  });

  it('ADI-03: Ganho não oferece Adiar; Perdido e a ficha oferecem', async () => {
    const user = userEvent.setup();
    quadro = {
      NOVO: [lead({ id: 'lead-novo', nome: 'Maria Nova', status: 'NOVO' })],
      GANHO: [lead({ id: 'lead-ganho', nome: 'Convertido Ganho', status: 'GANHO' })],
      PERDIDO: [lead({ id: 'lead-perdido', nome: 'Desistiu Perdido', status: 'PERDIDO' })],
    };
    renderKanban();
    const novos = await screen.findByRole('region', { name: 'Novos Leads' });
    const ganho = await screen.findByRole('region', { name: 'Ganho (Conversão)' });
    const perdido = await screen.findByRole('region', { name: 'Perdido' });
    expect(await within(novos).findByRole('button', { name: 'Adiar' })).toBeInTheDocument();
    expect(within(ganho).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();
    expect(within(perdido).getByRole('button', { name: 'Adiar' })).toBeInTheDocument();

    await user.click(within(ganho).getByRole('button', { name: 'Editar lead' }));
    const fichaGanho = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(fichaGanho).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();
    await user.click(within(fichaGanho).getByRole('button', { name: 'Fechar' }));

    await user.click(within(perdido).getByRole('button', { name: 'Editar lead' }));
    const fichaPerdido = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(fichaPerdido).getByRole('button', { name: 'Adiar' })).toBeInTheDocument();
  });

  it('sem crm.lead.editar não há Adiar no cartão nem na ficha', async () => {
    (AcessosService.get as ReturnType<typeof vi.fn>).mockResolvedValue(LEITOR);
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    expect(await within(coluna).findByRole('button', { name: 'Ver lead' })).toBeInTheDocument();
    expect(within(coluna).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();

    await user.click(within(coluna).getByRole('button', { name: 'Ver lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(ficha).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();
  });

  it('ADI-02: na hora e no passado o lead volta; só vence_em futuro entra em Adiados', async () => {
    quadro = {
      NOVO: [
        lead({ id: 'lead-passado', nome: 'Passado Visivel', status: 'NOVO' }),
        lead({ id: 'lead-agora', nome: 'Agora Visivel', status: 'NOVO' }),
        lead({ id: 'lead-futuro', nome: 'Futuro Escondido', status: 'NOVO' }),
      ],
    };
    porLead = {
      'lead-passado': { itens: [retomar('r-passado', '2026-11-12T12:00:00Z')] },
      'lead-agora': { itens: [retomar('r-agora', '2026-11-12T15:00:00Z')] },
      'lead-futuro': { itens: [retomar('r-futuro', '2026-11-13T12:00:00Z')] },
    };
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    expect(await within(coluna).findByText('Passado Visivel')).toBeInTheDocument();
    expect(within(coluna).getByText('Agora Visivel')).toBeInTheDocument();
    await waitFor(() => expect(within(coluna).queryByText('Futuro Escondido')).not.toBeInTheDocument());

    await abrirFiltros(user);
    await user.click(screen.getByRole('button', { name: 'Adiados (1)' }));
    expect(within(coluna).getByText('Futuro Escondido')).toBeInTheDocument();
    expect(within(coluna).queryByText('Passado Visivel')).not.toBeInTheDocument();
    expect(within(coluna).queryByText('Agora Visivel')).not.toBeInTheDocument();
  });

  it('ADI-05: flag desligada esconde o botão e o filtro, e o lead com retomar continua no quadro', async () => {
    flags.adiar = false;
    porLead = { 'lead-novo': { itens: [retomar('retomar-velha', '2026-12-01T12:00:00Z')] } };
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    expect(await within(coluna).findByText('Maria Nova')).toBeInTheDocument();
    expect(within(coluna).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adiados/ })).not.toBeInTheDocument();

    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(ficha).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Adiar lead' })).not.toBeInTheDocument();
  });

  it('sem crm-atividades o botão não aparece mesmo com crm-adiar ligada', async () => {
    flags.atividades = false;
    flags.adiar = true;
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    expect(await within(coluna).findByText('Maria Nova')).toBeInTheDocument();
    expect(within(coluna).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adiados/ })).not.toBeInTheDocument();

    await user.click(within(coluna).getByRole('button', { name: 'Editar lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(ficha).queryByRole('button', { name: 'Adiar' })).not.toBeInTheDocument();
  });

  it('Hoje e Adiados juntos mostram só quem passa nos dois e o header marca 2', async () => {
    quadro = {
      NOVO: [
        lead({ id: 'passa', nome: 'Passa Nos Dois', status: 'NOVO' }),
        lead({ id: 'so-adiado', nome: 'So Adiado', status: 'NOVO' }),
        lead({ id: 'so-hoje', nome: 'So Hoje', status: 'NOVO' }),
      ],
      GANHO: [lead({ id: 'ganho', nome: 'Ganho Adiado', status: 'GANHO' })],
    };
    porLead = {
      passa: { itens: [retomar('r-passa', '2026-11-12T18:00:00Z')] },
      'so-adiado': { itens: [retomar('r-futuro', '2026-11-20T15:00:00Z')] },
      'so-hoje': { itens: [{ ...retomar('r-hoje', '2026-11-12T18:00:00Z'), tipo: 'ligar' }] },
      ganho: { itens: [retomar('r-ganho', '2026-11-12T18:00:00Z')] },
    };
    const user = userEvent.setup();
    renderKanban();
    const coluna = await screen.findByRole('region', { name: 'Novos Leads' });
    await waitFor(() => expect(within(coluna).queryByText('Passa Nos Dois')).not.toBeInTheDocument());
    expect(within(coluna).getByText('So Hoje')).toBeInTheDocument();

    await abrirFiltros(user);
    await user.click(screen.getByRole('button', { name: 'Adiados (3)' }));
    expect(screen.getByRole('button', { name: 'Filtros, 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(coluna).getByText('Passa Nos Dois')).toBeInTheDocument();
    expect(within(coluna).getByText('So Adiado')).toBeInTheDocument();
    expect(within(coluna).queryByText('So Hoje')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByRole('button', { name: 'Filtros, 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(coluna).getByText('Passa Nos Dois')).toBeInTheDocument();
    expect(within(coluna).queryByText('So Adiado')).not.toBeInTheDocument();
    expect(within(coluna).queryByText('So Hoje')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Ganho (Conversão)' })).queryByText('Ganho Adiado')).not.toBeInTheDocument();
  });
});
