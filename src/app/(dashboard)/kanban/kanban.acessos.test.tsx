import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KanbanPage from './page';
import { AcessosService, LeadService, TenantService, type MeusAcessos } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { AcessosProvider } from '@/contexts/AcessosContext';

// spec: gestao-de-acesso-f4-aplicacao RF-05, CA-05 (CRM).

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
    },
    TenantService: { list: vi.fn(), listMyTenants: vi.fn() },
  };
});

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

// O Draggable guarda o isDragDisabled que recebe, para o teste ler.
const arrastes = vi.hoisted(() => ({ desligado: [] as boolean[] }));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: any) => <div>{children}</div>,
  Droppable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), droppableProps: {} }, {}),
  Draggable: ({ children, isDragDisabled }: any) => {
    arrastes.desligado.push(Boolean(isDragDisabled));
    return children({ draggableProps: {}, innerRef: vi.fn(), dragHandleProps: {} }, {});
  },
}));

vi.mock('xlsx', () => ({
  utils: { book_new: vi.fn(() => ({})), json_to_sheet: vi.fn(() => ({ '!cols': [] })), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
}));

const GESTOR = ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar', 'crm.lead.excluir', 'crm.integracoes.gerir'];
const VENDEDOR = ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar'];
const LEITOR = ['crm.lead.ver'];

function acessos(crm: string[], papel = 'personalizado'): MeusAcessos {
  return {
    tenant_id: 'tenant-1',
    operador: false,
    ferramentas: [
      { id: 'portal', nome: 'Portal do Cliente', contratada: true, papel: { id: 'membro', nome: 'Membro', sistema: true, implicito: false }, permissoes: ['portal.empresa.ver'] },
      { id: 'crm', nome: 'CRM', contratada: true, papel: { id: papel, nome: papel, sistema: false, implicito: false }, permissoes: crm },
    ],
  };
}

// Ganho: o detalhe do lead ganho é o único que oferece "Registrar venda".
const lead = { id: 'lead-1', nome: 'João Silva', telefone: '11988887777', status: 'GANHO', sales: [] };

function renderKanban() {
  return render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
}

describe('Kanban segue as permissões do CRM', () => {
  const alertOriginal = window.alert;

  beforeEach(() => {
    vi.clearAllMocks();
    arrastes.desligado = [];
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
    (LeadService.list as any).mockImplementation((status: string) => Promise.resolve(status === 'GANHO' ? [lead] : []));
    (LeadService.listSalesByMonth as any).mockResolvedValue([]);
  });

  afterEach(() => {
    window.alert = alertOriginal;
  });

  it('Gestor vê todas as ações', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(GESTOR, 'gestor'));
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
    expect(screen.getByRole('button', { name: 'Excluir lead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar venda' })).toBeInTheDocument();
    await abrirMenu(user);
    expect(screen.getAllByRole('button', { name: /Novo Lead Manual/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Registrar Nova Venda/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Conectar Google Ads/i }).length).toBeGreaterThan(0);
    expect(arrastes.desligado.every((d) => d === false)).toBe(true);
  });

  it('Vendedor cria, edita e registra venda, mas não exclui nem conecta o Google Ads', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(VENDEDOR, 'vendedor'));
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
    expect(screen.queryByRole('button', { name: 'Excluir lead' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar venda' })).toBeInTheDocument();
    await abrirMenu(user);
    expect(screen.getAllByRole('button', { name: /Novo Lead Manual/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Registrar Nova Venda/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
  });

  it('só com ver, o lead abre para leitura e nada muda o quadro', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(LEITOR));
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Ver lead' }));
    expect(screen.queryByRole('button', { name: 'Editar lead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar Alterações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir lead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar venda' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mover lead' })).not.toBeInTheDocument();
    expect(arrastes.desligado.length).toBeGreaterThan(0);
    expect(arrastes.desligado[arrastes.desligado.length - 1]).toBe(true);
    await abrirMenu(user);
    expect(screen.queryByRole('button', { name: /Novo Lead Manual/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar Nova Venda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Conectar Google Ads/i })).not.toBeInTheDocument();
  });

  it('sem ver, mostra Sem acesso com o link do Portal e não carrega leads', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos([], 'sem_acesso'));
    renderKanban();
    expect(await screen.findByRole('heading', { name: 'Você não tem acesso ao CRM nesta empresa' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Abrir o Portal do Cliente' });
    expect(link).toHaveAttribute('href', 'https://customer.unumpeople.com.br');
    expect(LeadService.list).not.toHaveBeenCalled();
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument();
  });

  it('enquanto as permissões carregam, nenhuma ação aparece', async () => {
    (AcessosService.get as any).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderKanban();
    expect(screen.queryByRole('button', { name: 'Editar lead' })).not.toBeInTheDocument();
    await abrirMenu(user);
    expect(screen.queryByRole('button', { name: /Novo Lead Manual/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar Nova Venda/i })).not.toBeInTheDocument();
  });

  it('se a leitura das permissões falha, avisa e esconde as ações', async () => {
    (AcessosService.get as any).mockRejectedValue(new Error('rede'));
    const user = userEvent.setup();
    renderKanban();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar suas permissões nesta empresa.');
    expect(screen.queryByRole('button', { name: 'Editar lead' })).not.toBeInTheDocument();
    await abrirMenu(user);
    expect(screen.queryByRole('button', { name: /Novo Lead Manual/i })).not.toBeInTheDocument();
  });

  it('403 com permissão vindo da API mostra a mensagem de permissão', async () => {
    (AcessosService.get as any).mockResolvedValue(acessos(GESTOR, 'gestor'));
    (LeadService.create as any).mockRejectedValue({ response: { status: 403, data: { error: 'forbidden', permissao: 'crm.lead.criar' } } });
    const user = userEvent.setup();
    renderKanban();
    await screen.findByRole('button', { name: 'Editar lead' });
    await abrirMenu(user);
    await user.click(screen.getAllByRole('button', { name: /Novo Lead Manual/i })[0]);
    await user.type(screen.getByLabelText(/Nome/i), 'Novo Cliente');
    await user.type(screen.getByLabelText(/WhatsApp/i), '11911112222');
    await user.click(screen.getByRole('button', { name: /Criar Lead/i }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Você não tem permissão para fazer isso nesta empresa.'));
  });
});
