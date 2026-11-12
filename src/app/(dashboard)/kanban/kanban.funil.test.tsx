import { render, screen, waitFor, within, act } from '@testing-library/react';
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

const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((r: unknown) => Promise<void> | void) }));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: any) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  Droppable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), droppableProps: {}, placeholder: null }, {}),
  Draggable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), dragHandleProps: {} }, {}),
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
