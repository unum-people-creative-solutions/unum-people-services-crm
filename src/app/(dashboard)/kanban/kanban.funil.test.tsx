import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KanbanPage from './page';
import { AcessosService, FunilService, LeadService, TenantService, type Funil, type MeusAcessos } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import funilPadraoJson from '@/services/__fixtures__/get-crm-funil-padrao.json';
import funilSalvoJson from '@/services/__fixtures__/put-crm-funil-6-etapas.json';

// spec: crm-funil-e-atividades-f1 FUN-02, FUN-03, FUN-05, FUN-06 (T24).

const funilPadrao = funilPadraoJson as Funil;
const funilSalvo = funilSalvoJson as Funil;
const NOMES_SALVOS = funilSalvo.etapas.map((etapa) => etapa.nome);

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
    FunilService: { ler: vi.fn(), salvar: vi.fn() },
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

const flags = vi.hoisted(() => ({ funil: false, agendamento: false, agenda: false }));
vi.mock('@/hooks/useFlag', () => ({
  useFlag: (chave: string) => {
    if (chave === 'crm-funil-editavel') return flags.funil;
    if (chave === 'crm-agendamento') return flags.agendamento;
    if (chave === 'crm-google-agenda') return flags.agenda;
    return false;
  },
}));

const dnd = vi.hoisted(() => ({
  onDragEnd: null as null | ((r: unknown) => Promise<void> | void),
  cartoesSemArraste: [] as boolean[],
}));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  Droppable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), droppableProps: {}, placeholder: null }, {}),
  Draggable: ({ children, isDragDisabled }: any) => {
    dnd.cartoesSemArraste.push(Boolean(isDragDisabled));
    return children({ draggableProps: {}, innerRef: vi.fn(), dragHandleProps: {} }, {});
  },
}));

vi.mock('xlsx', () => ({
  utils: { book_new: vi.fn(() => ({})), json_to_sheet: vi.fn(() => ({ '!cols': [] })), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}));

const GESTOR = ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar', 'crm.lead.excluir', 'crm.integracoes.gerir'];

function acessos(crm: string[]): MeusAcessos {
  return {
    tenant_id: 'tenant-1',
    operador: false,
    ferramentas: [{ id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'gestor', nome: 'Gestor', sistema: true, implicito: false }, permissoes: crm }],
  };
}

function lead(over: { id: string; nome: string; status: string; updated_at?: string }) {
  return {
    tenant_id: 'tenant-1',
    telefone: '11988887777',
    sales: [],
    updated_at: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    ...over,
  };
}

let quadro: Record<string, ReturnType<typeof lead>[]> = {};

function renderKanban() {
  return render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );
}

async function arrastar(de: string, para: string, id: string) {
  await act(async () => {
    await dnd.onDragEnd!({
      source: { droppableId: de, index: 0 },
      destination: { droppableId: para, index: 0 },
      draggableId: id,
    });
  });
}

function estaoNestaOrdem(elementos: HTMLElement[]) {
  for (let i = 1; i < elementos.length; i++) {
    expect(elementos[i - 1].compareDocumentPosition(elementos[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
}

describe('Quadro pelo funil (T24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnd.onDragEnd = null;
    dnd.cartoesSemArraste = [];
    flags.funil = false;
    flags.agendamento = false;
    flags.agenda = false;
    quadro = {};
    window.alert = vi.fn();
    (useAuthStore as any).mockReturnValue({
      session: { email: 'user@test.com', name: 'User', tenantId: 'tenant-1', role: 'USER' },
      logout: vi.fn(),
      setSession: vi.fn(),
    });
    (useTenant as any).mockReturnValue({
      activeTenantId: 'tenant-1',
      activeTenantName: 'Unum Teste',
      availableTenants: [{ id: 'tenant-1', nome_negocio: 'Unum Teste' }],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
    (TenantService.listMyTenants as any).mockResolvedValue([{ id: 'tenant-1', nome_negocio: 'Unum Teste' }]);
    (AcessosService.get as any).mockResolvedValue(acessos(GESTOR));
    (FunilService.ler as any).mockResolvedValue(funilSalvo);
    (FunilService.salvar as any).mockResolvedValue(funilSalvo);
    (LeadService.list as any).mockImplementation((status: string) => Promise.resolve(quadro[status] ?? []));
    (LeadService.listSalesByMonth as any).mockResolvedValue([]);
    (LeadService.updateStatus as any).mockResolvedValue({ message: 'Lead updated successfully' });
  });

  it('funil de 6 etapas: uma coluna por etapa, na ordem, e um GET /leads por id', async () => {
    quadro = {
      E7K2M9QXA4B: [lead({ id: 'lead-proposta', nome: 'Ana Proposta', status: 'E7K2M9QXA4B' })],
      GANHO: [lead({ id: 'lead-ganho', nome: 'Bruno Ganho', status: 'GANHO' })],
    };
    renderKanban();

    const regioes = await screen.findAllByRole('region');
    expect(regioes.map((regiao) => regiao.getAttribute('aria-label'))).toEqual(NOMES_SALVOS);
    for (const nome of NOMES_SALVOS) {
      expect(screen.getByRole('heading', { name: new RegExp(`^${nome.replace(/[()]/g, '\\$&')}`) })).toBeInTheDocument();
    }

    expect(FunilService.ler).toHaveBeenCalledWith('tenant-1');
    await waitFor(() => expect(LeadService.list).toHaveBeenCalledWith('E7K2M9QXA4B', undefined, undefined, 'tenant-1'));
    const ordemLer = (FunilService.ler as any).mock.invocationCallOrder[0] as number;
    const ordemLista = (LeadService.list as any).mock.invocationCallOrder[0] as number;
    expect(ordemLer).toBeLessThan(ordemLista);

    for (const id of ['NOVO', 'ATENDIMENTO', 'E7K2M9QXA4B', 'AGENDADO']) {
      expect(LeadService.list).toHaveBeenCalledWith(id, undefined, undefined, 'tenant-1');
    }
    expect(LeadService.list).toHaveBeenCalledWith('GANHO', expect.any(String), expect.any(String), 'tenant-1');
    expect(LeadService.list).toHaveBeenCalledWith('PERDIDO', expect.any(String), expect.any(String), 'tenant-1');

    expect(within(screen.getByRole('region', { name: 'Proposta enviada' })).getByText(/Inatividade crítica/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Ganho (Conversão)' })).queryByText(/Inatividade crítica/)).not.toBeInTheDocument();
  });

  it('a folha "Mover lead" lista as 6 etapas na ordem do funil', async () => {
    quadro = { NOVO: [lead({ id: 'lead-novo', nome: 'Clara Nova', status: 'NOVO' })] };
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Mover lead' }));

    const botoes = NOMES_SALVOS.map((nome) => screen.getByRole('button', { name: nome }));
    expect(botoes).toHaveLength(6);
    estaoNestaOrdem(botoes);
    expect(screen.getByRole('button', { name: 'Novos Leads' })).toBeDisabled();
  });

  it('mover para uma etapa anterior pergunta "Mover para trás?"', async () => {
    quadro = { E7K2M9QXA4B: [lead({ id: 'lead-proposta', nome: 'Ana Proposta', status: 'E7K2M9QXA4B' })] };
    renderKanban();
    await screen.findByText('Ana Proposta');
    await arrastar('E7K2M9QXA4B', 'ATENDIMENTO', 'lead-proposta');

    expect(screen.getByRole('heading', { name: 'Mover para trás?' })).toBeInTheDocument();
    expect(LeadService.updateStatus).not.toHaveBeenCalled();
  });

  it('falha ao ler o funil: alerta, "Tentar de novo" e nenhuma coluna; o botão relê', async () => {
    (FunilService.ler as any).mockRejectedValueOnce(new Error('rede')).mockResolvedValue(funilPadrao);
    const user = userEvent.setup();
    renderKanban();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar as colunas do quadro.');
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /^Novos Leads/ })).not.toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('region', { name: 'Novos Leads' })).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar as colunas do quadro.')).not.toBeInTheDocument();
    expect(FunilService.ler).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('region')).toHaveLength(funilPadrao.etapas.length);
  });
});

const COM_EDICAO = [...GESTOR, 'crm.funil.editar'];

function funilCom(n: number): Funil {
  const comuns = Array.from({ length: n - 4 }, (_, i) => ({
    id: `E${String(i).padStart(10, '0')}`,
    nome: `Etapa ${i + 1}`,
    papel: 'comum' as const,
    removivel: true,
    movivel: true,
  }));
  return {
    versao: 1,
    etapas: [
      { id: 'NOVO', nome: 'Novos Leads', papel: 'novo', removivel: false, movivel: false },
      ...comuns,
      { id: 'AGENDADO', nome: 'Agendados', papel: 'agendado', removivel: false, movivel: true },
      { id: 'GANHO', nome: 'Ganho (Conversão)', papel: 'ganho', removivel: false, movivel: false },
      { id: 'PERDIDO', nome: 'Perdido', papel: 'perdido', removivel: false, movivel: false },
    ],
  };
}

async function abrirEdicao() {
  const user = userEvent.setup();
  renderKanban();
  await user.click(await screen.findByRole('button', { name: 'Editar funil' }));
  await screen.findByRole('textbox', { name: 'Nome da coluna Novos Leads' });
  return user;
}

describe('Modo de edição (T25, T26, T27)', () => {
  beforeEach(() => {
    flags.funil = true;
    (AcessosService.get as any).mockResolvedValue(acessos(COM_EDICAO));
    (FunilService.ler as any).mockResolvedValue(funilSalvo);
    (FunilService.salvar as any).mockResolvedValue(funilSalvo);
    quadro = { NOVO: [lead({ id: 'lead-novo', nome: 'Clara Nova', status: 'NOVO' })] };
  });

  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ])('flag %s e permissão %s → botão "Editar funil" visível=%s', async (flag, permissao, visivel) => {
    flags.funil = flag;
    (AcessosService.get as any).mockResolvedValue(acessos(permissao ? COM_EDICAO : GESTOR));
    renderKanban();
    await screen.findByRole('button', { name: 'Editar lead' });
    if (visivel) expect(screen.getByRole('button', { name: 'Editar funil' })).toBeEnabled();
    else expect(screen.queryByRole('button', { name: 'Editar funil' })).not.toBeInTheDocument();
  });

  it('mostra nome editável, remover só nas removíveis e o + entre a última móvel e Ganho', async () => {
    quadro = {
      NOVO: [lead({ id: 'lead-novo', nome: 'Clara Nova', status: 'NOVO' })],
      ATENDIMENTO: [
        lead({ id: 'a1', nome: 'Um', status: 'ATENDIMENTO' }),
        lead({ id: 'a2', nome: 'Dois', status: 'ATENDIMENTO' }),
      ],
    };
    renderKanban();
    await screen.findByText('Um');
    await screen.findByText('Dois');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Editar funil' }));
    await screen.findByRole('textbox', { name: 'Nome da coluna Novos Leads' });

    expect(screen.getByRole('textbox', { name: 'Nome da coluna Em Atendimento' })).toHaveValue('Em Atendimento');
    expect(screen.getByRole('textbox', { name: 'Nome da coluna Proposta enviada' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Novos Leads' })).queryByRole('button', { name: 'Remover coluna' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Agendados' })).queryByRole('button', { name: /Remover coluna|Mova os/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Ganho (Conversão)' })).queryByRole('button', { name: /Remover coluna|Mova os/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Perdido' })).queryByRole('button', { name: /Remover coluna|Mova os/ })).not.toBeInTheDocument();

    const removerCheia = within(screen.getByRole('region', { name: 'Em Atendimento' })).getByRole('button', { name: 'Mova os 2 leads antes de remover' });
    expect(removerCheia).toBeDisabled();
    const removerVazia = within(screen.getByRole('region', { name: 'Proposta enviada' })).getByRole('button', { name: 'Remover coluna' });
    expect(removerVazia).toBeEnabled();

    const adicionar = screen.getByRole('button', { name: 'Adicionar coluna' });
    expect(adicionar).toBeEnabled();
    const agendados = screen.getByRole('region', { name: 'Agendados' });
    const ganho = screen.getByRole('region', { name: 'Ganho (Conversão)' });
    expect(agendados.compareDocumentPosition(adicionar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(adicionar.compareDocumentPosition(ganho) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(dnd.cartoesSemArraste.slice(-2)).toEqual([true, true]);

    await user.click(removerVazia);
    expect(screen.queryByRole('region', { name: 'Proposta enviada' })).not.toBeInTheDocument();
    expect(FunilService.salvar).not.toHaveBeenCalled();
  });

  it('"Cancelar" volta ao funil salvo sem chamar a API', async () => {
    const user = await abrirEdicao();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da coluna Em Atendimento' }), { target: { value: 'Conversando' } });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(FunilService.salvar).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: /Nome da coluna/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Em Atendimento/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Conversando/ })).not.toBeInTheDocument();
  });

  it('"+" cria "Nova etapa" antes de Ganho com o campo em foco', async () => {
    const user = await abrirEdicao();
    await user.click(screen.getByRole('button', { name: 'Adicionar coluna' }));

    const campo = screen.getByRole('textbox', { name: 'Nome da coluna Nova etapa' });
    expect(campo).toHaveValue('Nova etapa');
    expect(campo).toHaveFocus();
    const nova = screen.getByRole('region', { name: 'Nova etapa' });
    const ganho = screen.getByRole('region', { name: 'Ganho (Conversão)' });
    expect(nova.compareDocumentPosition(ganho) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('com 10 colunas o "+" fica desabilitado com o limite', async () => {
    (FunilService.ler as any).mockResolvedValue(funilCom(10));
    await abrirEdicao();
    const adicionar = screen.getByRole('button', { name: 'O funil pode ter no máximo 10 colunas.' });
    expect(adicionar).toBeDisabled();
  });

  it('"Salvar" envia a lista na ordem e mostra o funil devolvido', async () => {
    const devolvido: Funil = {
      versao: 2,
      etapas: [
        ...funilSalvo.etapas.slice(0, 4),
        { id: 'E7K2M9QXA4C', nome: 'Nova etapa', papel: 'comum', removivel: true, movivel: true },
        ...funilSalvo.etapas.slice(4),
      ],
    };
    (FunilService.salvar as any).mockResolvedValue(devolvido);
    const user = await abrirEdicao();
    await user.click(screen.getByRole('button', { name: 'Adicionar coluna' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da coluna Em Atendimento' }), { target: { value: 'Conversando' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(FunilService.salvar).toHaveBeenCalledTimes(1));
    expect(FunilService.salvar).toHaveBeenCalledWith(1, [
      { id: 'NOVO', nome: 'Novos Leads' },
      { id: 'ATENDIMENTO', nome: 'Conversando' },
      { id: 'E7K2M9QXA4B', nome: 'Proposta enviada' },
      { id: 'AGENDADO', nome: 'Agendados' },
      { nome: 'Nova etapa' },
      { id: 'GANHO', nome: 'Ganho (Conversão)' },
      { id: 'PERDIDO', nome: 'Perdido' },
    ], 'tenant-1');
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Nome da coluna/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /^Nova etapa/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Em Atendimento/ })).toBeInTheDocument();
    expect(screen.queryByText('Conversando')).not.toBeInTheDocument();
  });

  it.each([
    [{ response: { status: 409, data: { error: 'funil_mudou' } } }, 'Outra pessoa alterou o funil. Recarregue para ver a versão atual.', true],
    [{ response: { status: 409, data: { error: 'etapa_com_leads', etapas: ['ATENDIMENTO'] } } }, 'A coluna Em Atendimento tem leads. Mova os leads antes de remover.', false],
    [{ response: { status: 400, data: { error: 'funil_invalido', motivo: 'nome_invalido' } } }, 'Cada coluna precisa de um nome de 1 a 30 caracteres.', false],
    [{ response: { status: 400, data: { error: 'funil_invalido', motivo: 'nome_repetido' } } }, 'Duas colunas não podem ter o mesmo nome.', false],
    [{ response: { status: 400, data: { error: 'funil_invalido', motivo: 'limite_de_etapas' } } }, 'O funil pode ter no máximo 10 colunas.', false],
    [{ response: { status: 400, data: { error: 'funil_invalido', motivo: 'papel_alterado' } } }, 'Não foi possível salvar o funil.', false],
    [{ response: { status: 403, data: { error: 'recurso_desligado' } } }, 'Você não tem permissão para editar o funil.', false],
    [{ response: { status: 403, data: { error: 'forbidden', permissao: 'crm.funil.editar' } } }, 'Você não tem permissão para editar o funil.', false],
    [new Error('rede'), 'Não foi possível salvar o funil. Tente de novo.', false],
    [{ response: { status: 500, data: { error: 'Failed to save funnel' } } }, 'Não foi possível salvar o funil. Tente de novo.', false],
  ])('erro %j mantém o rascunho e mostra o alerta', async (erro, mensagem, temRecarregar) => {
    (FunilService.salvar as any).mockRejectedValue(erro);
    const user = await abrirEdicao();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da coluna Em Atendimento' }), { target: { value: 'Conversando' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(mensagem);
    if (temRecarregar) expect(within(alerta).getByRole('button', { name: 'Recarregar' })).toBeEnabled();
    else expect(within(alerta).queryByRole('button', { name: 'Recarregar' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome da coluna Conversando' })).toHaveValue('Conversando');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(window.alert).not.toHaveBeenCalled();
  });
});
