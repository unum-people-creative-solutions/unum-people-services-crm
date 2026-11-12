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
  onDragEnd: null as null | ((r: any) => Promise<void> | void),
  cartoesSemArraste: [] as boolean[],
  arrastes: [] as { id: string; desabilitado: boolean }[],
  listas: [] as { id: string; type?: string; direction?: string }[],
}));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  Droppable: ({ children, droppableId, type, direction }: any) => {
    dnd.listas.push({ id: droppableId, type, direction });
    return children({ draggableProps: {}, innerRef: vi.fn(), droppableProps: {}, placeholder: null }, {});
  },
  Draggable: ({ children, isDragDisabled, draggableId }: any) => {
    dnd.arrastes.push({ id: String(draggableId), desabilitado: Boolean(isDragDisabled) });
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
    dnd.arrastes = [];
    dnd.listas = [];
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

async function clicarEditarFunil(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
  const [botao] = await screen.findAllByRole('button', { name: 'Editar funil' });
  await user.click(botao);
}

async function abrirEdicao() {
  const user = userEvent.setup();
  renderKanban();
  await clicarEditarFunil(user);
  await screen.findByRole('textbox', { name: 'Nome da coluna Novos Leads' });
  return user;
}

describe('Modo de edição (T25, T26, T27)', () => {
  beforeEach(() => {
    flags.funil = true;
    (AcessosService.get as any).mockResolvedValue(acessos(COM_EDICAO));
    (FunilService.ler as any).mockResolvedValue(funilSalvo);
    (FunilService.salvar as any).mockResolvedValue(funilSalvo);
    dnd.arrastes = [];
    dnd.listas = [];
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
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
    if (visivel) expect(screen.getAllByRole('button', { name: 'Editar funil' }).length).toBeGreaterThan(0);
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
    await clicarEditarFunil(user);
    await screen.findByRole('textbox', { name: 'Nome da coluna Novos Leads' });

    expect(screen.getByRole('textbox', { name: 'Nome da coluna Em Atendimento' })).toHaveValue('Em Atendimento');
    expect(screen.getByRole('textbox', { name: 'Nome da coluna Proposta enviada' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Novos Leads' })).queryByRole('button', { name: 'Remover coluna' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Agendados' })).queryByRole('button', { name: /Remover coluna|Mova os/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Ganho (Conversão)' })).queryByRole('button', { name: /Remover coluna|Mova os/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Perdido' })).queryByRole('button', { name: /Remover coluna|Mova os/ })).not.toBeInTheDocument();

    const removerCheia = within(screen.getByRole('region', { name: 'Em Atendimento' })).getByRole('button', { name: 'Mova os 2 leads antes de remover' });
    expect(removerCheia).toBeDisabled();
    expect(removerCheia).toHaveTextContent('Mova os 2 leads antes de remover');
    const removerVazia = within(screen.getByRole('region', { name: 'Proposta enviada' })).getByRole('button', { name: 'Remover coluna' });
    expect(removerVazia).toBeEnabled();

    const adicionar = screen.getByRole('button', { name: 'Adicionar coluna' });
    expect(adicionar).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'Agendados' })).queryByRole('button', { name: 'Adicionar coluna' })).not.toBeInTheDocument();
    const agendados = screen.getByRole('region', { name: 'Agendados' });
    const ganho = screen.getByRole('region', { name: 'Ganho (Conversão)' });
    expect(agendados.compareDocumentPosition(adicionar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(adicionar.compareDocumentPosition(ganho) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(dnd.arrastes.filter((a) => a.id === 'a1' || a.id === 'a2').slice(-2)).toEqual([
      { id: 'a1', desabilitado: true },
      { id: 'a2', desabilitado: true },
    ]);

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

    const campo = screen.getByRole('textbox', { name: 'Nome da coluna Nova etapa' }) as HTMLInputElement;
    expect(campo).toHaveValue('Nova etapa');
    expect(campo).toHaveFocus();
    expect(campo.selectionStart).toBe(0);
    expect(campo.selectionEnd).toBe('Nova etapa'.length);
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
      { id: 'NOVO', nome: 'Novos Leads', acao: 'nenhuma' },
      { id: 'ATENDIMENTO', nome: 'Conversando', acao: 'nenhuma' },
      { id: 'E7K2M9QXA4B', nome: 'Proposta enviada', acao: 'nenhuma' },
      { id: 'AGENDADO', nome: 'Agendados', acao: 'consulta', exigencia: 'opcional' },
      { nome: 'Nova etapa', acao: 'nenhuma' },
      { id: 'GANHO', nome: 'Ganho (Conversão)', acao: 'venda', exigencia: 'obrigatoria' },
      { id: 'PERDIDO', nome: 'Perdido', acao: 'nenhuma' },
    ], 'tenant-1');
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Nome da coluna/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /^Nova etapa/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Em Atendimento/ })).toBeInTheDocument();
    expect(screen.queryByText('Conversando')).not.toBeInTheDocument();
  });

  it('"Salvar" fica desabilitado enquanto a gravação não responde', async () => {
    let concluir: (funil: Funil) => void = () => {};
    (FunilService.salvar as any).mockImplementation(() => new Promise((resolve) => { concluir = resolve; }));
    const user = await abrirEdicao();
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    await user.click(salvar);

    expect(salvar).toBeDisabled();
    const enviadas = (FunilService.salvar as any).mock.calls.length;
    await user.click(salvar);
    expect((FunilService.salvar as any).mock.calls.length).toBe(enviadas);
    await act(async () => { concluir(funilSalvo); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument());
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
    [{ response: { status: 500, data: { error: 'funil_mudou' } } }, 'Não foi possível salvar o funil. Tente de novo.', false],
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

const ORDEM_INICIAL = [
  'Novos Leads',
  'Em Atendimento',
  'Proposta enviada',
  'Agendados',
  'Ganho (Conversão)',
  'Perdido',
];
const ORDEM_APOS_1_PARA_2 = [
  'Novos Leads',
  'Proposta enviada',
  'Em Atendimento',
  'Agendados',
  'Ganho (Conversão)',
  'Perdido',
];

describe('Arrastar coluna (T28)', () => {
  beforeEach(() => {
    flags.funil = true;
    (AcessosService.get as any).mockResolvedValue(acessos(COM_EDICAO));
    (FunilService.ler as any).mockResolvedValue(funilSalvo);
    (FunilService.salvar as any).mockResolvedValue(funilSalvo);
    dnd.arrastes = [];
    dnd.listas = [];
    quadro = { NOVO: [lead({ id: 'lead-novo', nome: 'Clara Nova', status: 'NOVO' })] };
    window.innerWidth = 1024;
  });

  function nomes() {
    return screen.getAllByRole('region').map((regiao) => regiao.getAttribute('aria-label'));
  }

  it('type COLUMN de 1 para 2 reordena; destino 0 ou no Ganho não muda; cartão é ignorado', async () => {
    renderKanban();
    await screen.findByRole('region', { name: 'Novos Leads' });
    expect(dnd.listas.some((lista) => lista.id === 'funil')).toBe(false);

    const user = userEvent.setup();
    await clicarEditarFunil(user);
    await screen.findByRole('textbox', { name: 'Nome da coluna Novos Leads' });

    expect(dnd.listas.filter((lista) => lista.id === 'funil').at(-1)).toMatchObject({ type: 'COLUMN', direction: 'horizontal' });
    const ultimo = (id: string) => [...dnd.arrastes].reverse().find((arraste) => arraste.id === id);
    expect(ultimo('NOVO')?.desabilitado).toBe(true);
    expect(ultimo('ATENDIMENTO')?.desabilitado).toBe(false);
    expect(ultimo('GANHO')?.desabilitado).toBe(true);
    expect(nomes()).toEqual(ORDEM_INICIAL);

    await act(async () => {
      await dnd.onDragEnd!({ type: 'COLUMN', source: { index: 1 }, destination: { index: 2 } });
    });
    expect(nomes()).toEqual(ORDEM_APOS_1_PARA_2);

    await act(async () => {
      await dnd.onDragEnd!({ type: 'COLUMN', source: { index: 2 }, destination: { index: 0 } });
    });
    expect(nomes()).toEqual(ORDEM_APOS_1_PARA_2);

    await act(async () => {
      await dnd.onDragEnd!({ type: 'COLUMN', source: { index: 2 }, destination: { index: 4 } });
    });
    expect(nomes()).toEqual(ORDEM_APOS_1_PARA_2);

    await act(async () => {
      await dnd.onDragEnd!({
        type: 'DEFAULT',
        source: { droppableId: 'NOVO', index: 0 },
        destination: { droppableId: 'ATENDIMENTO', index: 0 },
        draggableId: 'lead-novo',
      });
    });
    expect(LeadService.updateStatus).not.toHaveBeenCalled();
    expect(within(screen.getByRole('region', { name: 'Novos Leads' })).getByText('Clara Nova')).toBeInTheDocument();
    expect(nomes()).toEqual(ORDEM_APOS_1_PARA_2);
  });

  it('no celular a coluna móvel não arrasta', async () => {
    const largura = window.innerWidth;
    window.innerWidth = 500;
    try {
      await abrirEdicao();
      await waitFor(() => {
        const ultimo = [...dnd.arrastes].reverse().find((arraste) => arraste.id === 'ATENDIMENTO');
        expect(ultimo?.desabilitado).toBe(true);
      });
    } finally {
      window.innerWidth = largura;
    }
  });
});

describe('Setas no celular (T29)', () => {
  beforeEach(() => {
    flags.funil = true;
    (AcessosService.get as any).mockResolvedValue(acessos(COM_EDICAO));
    (FunilService.ler as any).mockResolvedValue(funilSalvo);
    (FunilService.salvar as any).mockResolvedValue(funilSalvo);
    quadro = { NOVO: [lead({ id: 'lead-novo', nome: 'Clara Nova', status: 'NOVO' })] };
  });

  function nomes() {
    return screen.getAllByRole('region').map((regiao) => regiao.getAttribute('aria-label'));
  }

  it('setas só nas colunas móveis, travadas na borda de Novo e de Ganho, e o clique troca a vizinha', async () => {
    const user = await abrirEdicao();

    for (const nome of ['Novos Leads', 'Ganho (Conversão)', 'Perdido']) {
      const regiao = screen.getByRole('region', { name: nome });
      expect(within(regiao).queryByRole('button', { name: 'Mover para a esquerda' })).not.toBeInTheDocument();
      expect(within(regiao).queryByRole('button', { name: 'Mover para a direita' })).not.toBeInTheDocument();
    }

    const atendimento = screen.getByRole('region', { name: 'Em Atendimento' });
    expect(within(atendimento).getByRole('button', { name: 'Mover para a esquerda' })).toBeDisabled();
    expect(within(atendimento).getByRole('button', { name: 'Mover para a direita' })).toBeEnabled();

    const agendados = screen.getByRole('region', { name: 'Agendados' });
    expect(within(agendados).getByRole('button', { name: 'Mover para a esquerda' })).toBeEnabled();
    expect(within(agendados).getByRole('button', { name: 'Mover para a direita' })).toBeDisabled();

    const proposta = screen.getByRole('region', { name: 'Proposta enviada' });
    expect(within(proposta).getByRole('button', { name: 'Mover para a esquerda' })).toBeEnabled();
    expect(within(proposta).getByRole('button', { name: 'Mover para a direita' })).toBeEnabled();

    await user.click(within(atendimento).getByRole('button', { name: 'Mover para a direita' }));
    expect(nomes()).toEqual(ORDEM_APOS_1_PARA_2);
    await user.click(within(screen.getByRole('region', { name: 'Em Atendimento' })).getByRole('button', { name: 'Mover para a esquerda' }));
    expect(nomes()).toEqual(ORDEM_INICIAL);
  });
});

const STATUS_INVALIDO = { response: { status: 400, data: { error: 'status_invalido' } } };

describe('Coluna removida por outra pessoa (T30)', () => {
  beforeEach(() => {
    flags.funil = false;
    flags.agendamento = false;
    flags.agenda = false;
    window.alert = vi.fn();
    (AcessosService.get as any).mockResolvedValue(acessos(GESTOR));
    (FunilService.ler as any).mockResolvedValue(funilSalvo);
    quadro = { NOVO: [lead({ id: 'lead-novo', nome: 'Clara Nova', status: 'NOVO' })] };
    (LeadService.list as any).mockImplementation((status: string) => Promise.resolve(quadro[status] ?? []));
    (LeadService.updateStatus as any).mockRejectedValue(STATUS_INVALIDO);
  });

  async function esperarRecarga(funisAntes: number, listasAntes: number) {
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Esta coluna não existe mais. Recarregue o quadro.');
    expect(window.alert).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(FunilService.ler).toHaveBeenCalledTimes(funisAntes + 1);
      expect((LeadService.list as any).mock.calls.length).toBeGreaterThan(listasAntes);
    });
  }

  it('arrastar o lead avisa que a coluna não existe e relê o quadro', async () => {
    renderKanban();
    await screen.findByText('Clara Nova');
    const funisAntes = (FunilService.ler as any).mock.calls.length;
    const listasAntes = (LeadService.list as any).mock.calls.length;
    await arrastar('NOVO', 'ATENDIMENTO', 'lead-novo');
    await esperarRecarga(funisAntes, listasAntes);
  });

  it('a folha "Mover lead" avisa que a coluna não existe e relê o quadro', async () => {
    renderKanban();
    await screen.findByText('Clara Nova');
    const funisAntes = (FunilService.ler as any).mock.calls.length;
    const listasAntes = (LeadService.list as any).mock.calls.length;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mover lead' }));
    await user.click(screen.getByRole('button', { name: 'Em Atendimento' }));
    await esperarRecarga(funisAntes, listasAntes);
  });
});
