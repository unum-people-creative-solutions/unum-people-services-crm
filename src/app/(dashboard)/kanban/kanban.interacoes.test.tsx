import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KanbanPage from './page';
import { AcessosService, FunilService, InteracaoService, LeadService, type MeusAcessos } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import historico from '@/services/__fixtures__/get-interacoes.json';
import funilPadrao from '@/services/__fixtures__/get-crm-funil-padrao.json';

// spec: crm-funil-e-atividades-f2 INT-12, INT-13, INT-14.

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: () => nav.params,
}));

vi.mock('@/services/api', async () => {
  const real = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  const { default: funilPadrao } = await import('@/services/__fixtures__/get-crm-funil-padrao.json');
  return {
    default: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
    mensagemDeErro: real.mensagemDeErro,
    MENSAGEM_SEM_PERMISSAO: real.MENSAGEM_SEM_PERMISSAO,
    AcessosService: { get: vi.fn() },
    FunilService: { ler: vi.fn(async () => funilPadrao), salvar: vi.fn() },
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
    InteracaoService: {
      listar: vi.fn(),
      criar: vi.fn(),
      alterar: vi.fn(),
      apagar: vi.fn(),
    },
    TenantService: { list: vi.fn(), listMyTenants: vi.fn() },
  };
});

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

const flags = vi.hoisted(() => ({ interacoes: true }));
vi.mock('@/hooks/useFlag', () => ({
  useFlag: (chave: string) => chave === 'crm-interacoes' && flags.interacoes,
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

const lead = {
  id: 'lead-1',
  nome: 'João Silva',
  email: 'joao@exemplo.com',
  telefone: '11988887777',
  cpf: '',
  data_nascimento: '',
  origem: 'Indicação',
  anotacoes: 'não vai na gaveta',
  status: 'NOVO',
  sales: [] as { id: string; valor: number; data: string }[],
};

const LIGACAO = '8c1e0a2b-4d5f-4a6b-8c7d-9e0f1a2b3c4d';

function acessosDe(permissoes: MeusAcessos) {
  (AcessosService.get as ReturnType<typeof vi.fn>).mockResolvedValue(permissoes);
}

function renderKanban() {
  return render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );
}

async function abrirGaveta() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
  const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
  return { user, dialog };
}

async function abrirHistorico(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('tab', { name: 'Histórico' }));
  await within(dialog).findByRole('article', { name: 'Ligação de Ana Lima' });
}

async function abrirRegistro(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await abrirHistorico(user, dialog);
  expect(within(dialog).queryByRole('textbox', { name: 'Texto' })).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Novo registro' }));
  const modal = await screen.findByRole('dialog', { name: 'Novo registro' });
  return within(modal).getByRole('form', { name: 'Nova interação' });
}

function erroApi(status: number, data: Record<string, string>) {
  return { response: { status, data } };
}

describe('Ficha do lead (INT-12, INT-13, INT-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flags.interacoes = true;
    nav.params = new URLSearchParams();
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
    acessosDe(GESTOR);
    (LeadService.list as ReturnType<typeof vi.fn>).mockImplementation((status: string) => Promise.resolve(status === 'NOVO' ? [lead] : []));
    (LeadService.listSalesByMonth as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (LeadService.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (FunilService.ler as ReturnType<typeof vi.fn>).mockResolvedValue(funilPadrao);
    (InteracaoService.listar as ReturnType<typeof vi.fn>).mockResolvedValue(historico);
    (InteracaoService.criar as ReturnType<typeof vi.fn>).mockResolvedValue(historico.itens[0]);
    (InteracaoService.alterar as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (InteracaoService.apagar as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('com a flag ligada, o lápis abre a gaveta em Dados, sem Anotações', async () => {
    renderKanban();
    const { dialog } = await abrirGaveta();

    expect(within(dialog).getByRole('tab', { name: 'Dados' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'false');
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('João Silva');
    expect(within(dialog).queryByText('Anotações')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Editar Lead' })).not.toBeInTheDocument();
    expect(InteracaoService.listar).not.toHaveBeenCalled();
  });

  it('Dados salva nome, e-mail, telefone, CPF, nascimento e origem, sem anotacoes', async () => {
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    const nome = within(dialog).getByRole('textbox', { name: 'Nome' });
    await user.clear(nome);
    await user.type(nome, 'João da Silva');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar Alterações' }));

    await waitFor(() => expect(LeadService.update).toHaveBeenCalled());
    const [id, corpo, tenant] = (LeadService.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('lead-1');
    expect(tenant).toBe('tenant-1');
    expect(Object.keys(corpo).sort()).toEqual(['cpf', 'data_nascimento', 'email', 'nome', 'origem', 'telefone']);
    expect(corpo).toMatchObject({
      nome: 'João da Silva',
      email: 'joao@exemplo.com',
      origem: 'Indicação',
      cpf: '',
      data_nascimento: '',
    });
    expect(String(corpo.telefone).replace(/\D/g, '')).toBe('11988887777');
    expect(corpo.anotacoes).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ficha do lead' })).not.toBeInTheDocument());
  });

  it('erro ao salvar Dados aparece no alerta e o nome digitado fica', async () => {
    (LeadService.update as ReturnType<typeof vi.fn>).mockRejectedValue(erroApi(500, {}));
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    const nome = within(dialog).getByRole('textbox', { name: 'Nome' });
    await user.clear(nome);
    await user.type(nome, 'João da Silva');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar Alterações' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível salvar os dados do lead.');
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('João da Silva');
    expect(screen.getByRole('dialog', { name: 'Ficha do lead' })).toBeInTheDocument();
  });

  it('Histórico lista data em Brasília, autor, tipo e texto; Editar e Apagar só do autor', async () => {
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    await abrirHistorico(user, dialog);

    expect(InteracaoService.listar).toHaveBeenCalledWith('lead-1', 'tenant-1');
    const casos = [
      ['Ligação de Ana Lima', '11/11/2026 às 15:30', 'Ana Lima', 'Ligação', 'Ligou e pediu retorno amanhã.', true],
      ['Nota de Bruno Costa', '10/11/2026 às 12:00', 'Bruno Costa', 'Nota', 'Anotação anterior.', false],
      ['WhatsApp de Anotações anteriores', '09/11/2026 às 09:00', 'Anotações anteriores', 'WhatsApp', 'Mensagem migrada.', false],
      ['E-mail de Carla Dias', '08/11/2026 às 18:00', 'Carla Dias', 'E-mail', 'Enviou a proposta.', false],
      ['Reunião de Diego Alves', '07/11/2026 às 10:00', 'Diego Alves', 'Reunião', 'Reunião de alinhamento.', false],
    ] as const;
    for (const [nome, data, autor, tipo, texto, minha] of casos) {
      const artigo = within(dialog).getByRole('article', { name: nome });
      expect(within(artigo).getByText(data)).toBeInTheDocument();
      expect(within(artigo).getByText(autor)).toBeInTheDocument();
      expect(within(artigo).getByText(tipo)).toBeInTheDocument();
      expect(within(artigo).getByText(texto)).toBeInTheDocument();
      if (minha) {
        expect(within(artigo).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
        expect(within(artigo).getByRole('button', { name: 'Apagar' })).toBeInTheDocument();
      } else {
        expect(within(artigo).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
        expect(within(artigo).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();
      }
    }
    expect(within(dialog).queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Novo registro' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: 'Texto' })).not.toBeInTheDocument();
  });

  it('Registrar com data e hora manda ocorrida_em em UTC, no deslocamento -03:00', async () => {
    (InteracaoService.criar as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'nova-1',
      tipo: 'reuniao',
      texto: 'Reunião marcada',
      ocorrida_em: '2026-11-11T18:30:00Z',
      autor_email: 'user@test.com',
      autor_nome: 'User',
      criada_em: '2026-11-11T18:30:00Z',
      editada_em: '',
    });
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    const nova = await abrirRegistro(user, dialog);
    await user.selectOptions(within(nova).getByRole('combobox', { name: 'Tipo' }), 'reuniao');
    await user.type(within(nova).getByRole('textbox', { name: 'Texto' }), 'Reunião marcada');
    fireEvent.change(within(nova).getByLabelText(/^Data$/), { target: { value: '2026-11-11' } });
    fireEvent.change(within(nova).getByLabelText(/^Hora$/), { target: { value: '15:30' } });
    await user.click(within(nova).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(InteracaoService.criar).toHaveBeenCalledWith('lead-1', 'tenant-1', {
      tipo: 'reuniao',
      texto: 'Reunião marcada',
      ocorrida_em: '2026-11-11T18:30:00Z',
    }));
    expect(await within(dialog).findByText('Reunião marcada')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Novo registro' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: 'Texto' })).not.toBeInTheDocument();
  });

  it('Registrar sem data não manda ocorrida_em', async () => {
    (InteracaoService.criar as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'nova-2',
      tipo: 'nota',
      texto: 'Só o texto',
      ocorrida_em: '2026-11-12T15:00:00Z',
      autor_email: 'user@test.com',
      autor_nome: 'User',
      criada_em: '2026-11-12T15:00:00Z',
      editada_em: '',
    });
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    const nova = await abrirRegistro(user, dialog);
    await user.type(within(nova).getByRole('textbox', { name: 'Texto' }), 'Só o texto');
    await user.click(within(nova).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(InteracaoService.criar).toHaveBeenCalledWith('lead-1', 'tenant-1', {
      tipo: 'nota',
      texto: 'Só o texto',
    }));
    expect(Object.keys((InteracaoService.criar as ReturnType<typeof vi.fn>).mock.calls[0][2])).toEqual(['tipo', 'texto']);
  });

  it('só a data, sem a hora, avisa e não chama o POST; o rascunho fica', async () => {
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    const nova = await abrirRegistro(user, dialog);
    await user.type(within(nova).getByRole('textbox', { name: 'Texto' }), 'rascunho que fica');
    fireEvent.change(within(nova).getByLabelText(/^Data$/), { target: { value: '2026-11-11' } });
    await user.click(within(nova).getByRole('button', { name: 'Registrar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Informe a data e a hora, ou deixe as duas em branco.');
    expect(InteracaoService.criar).not.toHaveBeenCalled();
    expect(within(nova).getByRole('textbox', { name: 'Texto' })).toHaveValue('rascunho que fica');
    expect(within(nova).getByLabelText(/^Data$/)).toHaveValue('2026-11-11');
  });

  it.each([
    ['tipo', 'Escolha um tipo: Nota, Ligação, WhatsApp, E-mail ou Reunião.'],
    ['texto', 'Escreva um texto com até 5.000 caracteres.'],
    ['data', 'A data tem de ser de até 1 ano atrás, e não pode ser no futuro.'],
  ])('400 motivo %s aparece no alerta e o rascunho fica', async (motivo, mensagem) => {
    (InteracaoService.criar as ReturnType<typeof vi.fn>).mockRejectedValue(
      erroApi(400, { error: 'interacao_invalida', motivo }),
    );
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    const nova = await abrirRegistro(user, dialog);
    await user.selectOptions(within(nova).getByRole('combobox', { name: 'Tipo' }), 'ligacao');
    await user.type(within(nova).getByRole('textbox', { name: 'Texto' }), 'rascunho que fica');
    await user.click(within(nova).getByRole('button', { name: 'Registrar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(mensagem);
    expect(within(nova).getByRole('textbox', { name: 'Texto' })).toHaveValue('rascunho que fica');
    expect(within(nova).getByRole('combobox', { name: 'Tipo' })).toHaveValue('ligacao');
  });

  it('404 lead_nao_encontrado ao registrar aparece no alerta e o texto fica', async () => {
    (InteracaoService.criar as ReturnType<typeof vi.fn>).mockRejectedValue(
      erroApi(404, { error: 'lead_nao_encontrado' }),
    );
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    const nova = await abrirRegistro(user, dialog);
    await user.type(within(nova).getByRole('textbox', { name: 'Texto' }), 'rascunho que fica');
    await user.click(within(nova).getByRole('button', { name: 'Registrar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Este lead não foi encontrado.');
    expect(within(nova).getByRole('textbox', { name: 'Texto' })).toHaveValue('rascunho que fica');
  });

  it('Editar preenche o horário de Brasília e o PATCH manda o instante em UTC', async () => {
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    await abrirHistorico(user, dialog);
    await user.click(within(within(dialog).getByRole('article', { name: 'Ligação de Ana Lima' })).getByRole('button', { name: 'Editar' }));
    const edicao = within(dialog).getByRole('form', { name: 'Editar interação' });
    expect(within(edicao).getByLabelText(/^Data$/)).toHaveValue('2026-11-11');
    expect(within(edicao).getByLabelText(/^Hora$/)).toHaveValue('15:30');
    fireEvent.change(within(edicao).getByRole('textbox', { name: 'Texto' }), { target: { value: 'Texto corrigido' } });
    fireEvent.change(within(edicao).getByLabelText(/^Hora$/), { target: { value: '16:00' } });
    await user.click(within(edicao).getByRole('button', { name: 'Salvar interação' }));

    await waitFor(() => expect(InteracaoService.alterar).toHaveBeenCalledWith('lead-1', LIGACAO, 'tenant-1', {
      texto: 'Texto corrigido',
      ocorrida_em: '2026-11-11T19:00:00Z',
    }));
    expect(await within(dialog).findByText('Texto corrigido')).toBeInTheDocument();
  });

  it('erro ao editar aparece no alerta e o texto novo fica', async () => {
    (InteracaoService.alterar as ReturnType<typeof vi.fn>).mockRejectedValue(
      erroApi(400, { error: 'interacao_invalida', motivo: 'data' }),
    );
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    await abrirHistorico(user, dialog);
    await user.click(within(within(dialog).getByRole('article', { name: 'Ligação de Ana Lima' })).getByRole('button', { name: 'Editar' }));
    const edicao = within(dialog).getByRole('form', { name: 'Editar interação' });
    fireEvent.change(within(edicao).getByRole('textbox', { name: 'Texto' }), { target: { value: 'Texto corrigido' } });
    await user.click(within(edicao).getByRole('button', { name: 'Salvar interação' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A data tem de ser de até 1 ano atrás, e não pode ser no futuro.');
    expect(within(edicao).getByRole('textbox', { name: 'Texto' })).toHaveValue('Texto corrigido');
    expect(within(dialog).getByRole('form', { name: 'Editar interação' })).toBeInTheDocument();
  });

  it('Apagar chama DELETE e tira o item da lista', async () => {
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    await abrirHistorico(user, dialog);
    await user.click(within(within(dialog).getByRole('article', { name: 'Ligação de Ana Lima' })).getByRole('button', { name: 'Apagar' }));

    await waitFor(() => expect(InteracaoService.apagar).toHaveBeenCalledWith('lead-1', LIGACAO, 'tenant-1'));
    await waitFor(() => expect(within(dialog).queryByRole('article', { name: 'Ligação de Ana Lima' })).not.toBeInTheDocument());
  });

  it('403 nao_e_o_autor ao apagar aparece no alerta e o item continua', async () => {
    (InteracaoService.apagar as ReturnType<typeof vi.fn>).mockRejectedValue(erroApi(403, { error: 'nao_e_o_autor' }));
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    await abrirHistorico(user, dialog);
    await user.click(within(within(dialog).getByRole('article', { name: 'Ligação de Ana Lima' })).getByRole('button', { name: 'Apagar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Só quem registrou pode editar ou apagar.');
    expect(within(dialog).getByRole('article', { name: 'Ligação de Ana Lima' })).toBeInTheDocument();
  });

  it.each([
    [new Error('rede'), 'Não foi possível carregar o histórico.'],
    [erroApi(404, { error: 'lead_nao_encontrado' }), 'Este lead não foi encontrado.'],
  ])('falha ao listar o histórico aparece no alerta', async (erro, mensagem) => {
    (InteracaoService.listar as ReturnType<typeof vi.fn>).mockRejectedValue(erro);
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    await user.click(within(dialog).getByRole('tab', { name: 'Histórico' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(mensagem);
  });

  it('Carregar mais pede a página do cursor', async () => {
    const extra = {
      ...historico.itens[0],
      id: 'dddd4444-5555-4666-8777-888899990000',
      texto: 'Página seguinte.',
      ocorrida_em: '2026-11-01T15:00:00Z',
    };
    (InteracaoService.listar as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...historico, cursor: 'pagina-2' })
      .mockResolvedValueOnce({ itens: [extra], cursor: '' });
    renderKanban();
    const { user, dialog } = await abrirGaveta();
    await abrirHistorico(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(InteracaoService.listar).toHaveBeenLastCalledWith('lead-1', 'tenant-1', 'pagina-2'));
    expect(await within(dialog).findByText('Página seguinte.')).toBeInTheDocument();
    expect(within(dialog).getByText('Ligou e pediu retorno amanhã.')).toBeInTheDocument();
  });

  it('sem crm.lead.editar, a gaveta é só leitura e o histórico aparece', async () => {
    acessosDe(LEITOR);
    renderKanban();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });

    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Salvar Alterações' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Excluir lead' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Registrar venda' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Histórico' }));
    expect(await within(dialog).findByText('Ligou e pediu retorno amanhã.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Novo registro' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();
  });

  it('com a flag desligada, o lápis abre o modal de hoje, com Anotações', async () => {
    flags.interacoes = false;
    renderKanban();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));

    expect(await screen.findByRole('heading', { name: 'Editar Lead' })).toBeInTheDocument();
    expect(screen.getByText('Anotações')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ficha do lead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Histórico' })).not.toBeInTheDocument();
    expect(InteracaoService.listar).not.toHaveBeenCalled();
  });

  it('INT-14: /kanban?lead= abre a gaveta com a flag ligada', async () => {
    nav.params = new URLSearchParams('lead=lead-1');
    renderKanban();

    const dialog = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('João Silva');
    expect(screen.queryByRole('heading', { name: 'Editar Lead' })).not.toBeInTheDocument();
  });

  it('INT-14: /kanban?lead= abre o modal com a flag desligada', async () => {
    flags.interacoes = false;
    nav.params = new URLSearchParams('lead=lead-1');
    renderKanban();

    expect(await screen.findByRole('heading', { name: 'Editar Lead' })).toBeInTheDocument();
    expect(screen.getByText('Anotações')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Histórico' })).not.toBeInTheDocument();
  });

  it('id que não está no quadro não abre a gaveta', async () => {
    nav.params = new URLSearchParams('lead=nao-existe');
    renderKanban();

    await screen.findByText('João Silva');
    expect(screen.queryByRole('dialog', { name: 'Ficha do lead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
