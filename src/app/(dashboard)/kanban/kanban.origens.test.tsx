import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KanbanPage from './page';
import { AcessosService, FunilService, LeadService, OrigensService, type MeusAcessos, type Origens } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import funilPadrao from '@/services/__fixtures__/get-crm-funil-padrao.json';
import origensPadraoJson from '@/services/__fixtures__/get-crm-origens-padrao.json';
import origensSalvasJson from '@/services/__fixtures__/put-crm-origens-feira.json';

// spec: crm-origens-personalizadas T16 (ficha do lead, modal de criar e modal de editar).

const origensPadrao = origensPadraoJson as Origens;
const origensSalvas = origensSalvasJson as Origens;

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: () => new URLSearchParams(),
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
    OrigensService: { ler: vi.fn(), salvar: vi.fn() },
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

function acessosCom(permissoes: string[]): MeusAcessos {
  return {
    tenant_id: 'tenant-1',
    operador: false,
    ferramentas: [{
      id: 'crm',
      nome: 'CRM',
      contratada: true,
      papel: { id: 'p', nome: 'Papel', sistema: false, implicito: false },
      permissoes,
    }],
  };
}

const GESTOR = acessosCom(['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar', 'crm.lead.excluir']);
const LEITOR = acessosCom(['crm.lead.ver']);

const leadBase = {
  id: 'lead-1',
  nome: 'João Silva',
  email: 'joao@exemplo.com',
  telefone: '11988887777',
  cpf: '',
  data_nascimento: '',
  origem: 'Panfleto',
  anotacoes: '',
  status: 'NOVO',
  sales: [] as { id: string; valor: number; data: string }[],
};

let lead: Record<string, unknown> = leadBase;

function renderKanban() {
  return render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );
}

describe('Origem personalizada nos 3 lugares (T16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flags.interacoes = true;
    lead = leadBase;
    window.alert = vi.fn();
    (useAuthStore as any).mockReturnValue({
      session: { email: 'user@test.com', name: 'User', tenantId: 'tenant-1', role: 'USER' },
      logout: vi.fn(),
      setSession: vi.fn(),
    });
    (useTenant as any).mockReturnValue({
      activeTenantId: 'tenant-1',
      activeTenantName: 'Consultório',
      availableTenants: [{ id: 'tenant-1', nome_negocio: 'Consultório' }],
      isMultiTenant: false,
      switchTenant: vi.fn(),
      isLoadingTenants: false,
    });
    (AcessosService.get as any).mockResolvedValue(GESTOR);
    (FunilService.ler as any).mockResolvedValue(funilPadrao);
    (OrigensService.ler as any).mockResolvedValue(origensPadrao);
    (OrigensService.salvar as any).mockResolvedValue(origensSalvas);
    (LeadService.list as any).mockImplementation((status: string) => Promise.resolve(status === 'NOVO' ? [lead] : []));
    (LeadService.listSalesByMonth as any).mockResolvedValue([]);
    (LeadService.update as any).mockResolvedValue({});
    (LeadService.create as any).mockResolvedValue({});
  });

  async function adicionarFeiraPeloLapis(user: ReturnType<typeof userEvent.setup>, dentro: HTMLElement) {
    await user.click(await within(dentro).findByRole('button', { name: 'Editar origens' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Origens' });
    await user.type(within(dialogo).getByLabelText('Nova origem'), 'Feira');
    await user.click(within(dialogo).getByRole('button', { name: 'Adicionar' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Origens' })).not.toBeInTheDocument());
  }

  it('ficha do lead: origem fora da lista fica selecionada e salvar sem mexer a mantém (RF-OR-07)', async () => {
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });

    const campo = await within(ficha).findByRole('combobox', { name: 'Origem' });
    await waitFor(() => expect(within(campo).getAllByRole('option')).toHaveLength(6));
    expect(campo).toHaveDisplayValue('Panfleto');

    await user.click(within(ficha).getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(LeadService.update).toHaveBeenCalled());
    expect((LeadService.update as any).mock.calls[0][1]).toMatchObject({ origem: 'Panfleto' });
  });

  it('ficha do lead: a origem criada no lápis aparece no campo na hora', async () => {
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });

    await adicionarFeiraPeloLapis(user, ficha);

    const campo = within(ficha).getByRole('combobox', { name: 'Origem' });
    expect(within(campo).getByRole('option', { name: 'Feira' })).toBeInTheDocument();
    expect(OrigensService.salvar).toHaveBeenCalledWith(0, [...origensPadrao.itens, 'Feira'], 'tenant-1');
  });

  it('ficha do lead sem crm.lead.editar não mostra o lápis (RF-OR-02)', async () => {
    (AcessosService.get as any).mockResolvedValue(LEITOR);
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Ver lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    await within(ficha).findByRole('combobox', { name: 'Origem' });
    expect(screen.queryByRole('button', { name: 'Editar origens' })).not.toBeInTheDocument();
  });

  it('ficha de lead do site: origem travada, sem select e sem lápis (RF-OR-09)', async () => {
    lead = { ...leadBase, origem: 'Landing Page', source: 'LANDING_PAGE' };
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
    const ficha = await screen.findByRole('dialog', { name: 'Ficha do lead' });
    expect(within(ficha).getByText('Leads vindos do site não podem ter a origem alterada.')).toBeInTheDocument();
    expect(within(ficha).queryByRole('combobox', { name: 'Origem' })).not.toBeInTheDocument();
    expect(within(ficha).queryByRole('button', { name: 'Editar origens' })).not.toBeInTheDocument();
  });

  it('modal de criar: usa a lista da conta, o padrão é o 1º item e a origem nova é enviada', async () => {
    (OrigensService.ler as any).mockResolvedValue({ versao: 2, itens: ['Feira', 'Outro'] });
    const user = userEvent.setup();
    renderKanban();
    await screen.findByRole('button', { name: 'Editar lead' });
    await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
    await user.click(screen.getAllByRole('button', { name: /Novo Lead Manual/i })[0]);

    const campo = await screen.findByRole('combobox', { name: 'Origem' });
    await waitFor(() => expect(campo).toHaveDisplayValue('Feira'));
    expect(within(campo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Feira', 'Outro']);

    await user.type(screen.getByLabelText(/Nome/i), 'Novo Cliente');
    await user.type(screen.getByLabelText(/WhatsApp/i), '11911112222');
    await user.click(screen.getByRole('button', { name: /Criar Lead/i }));
    await waitFor(() => expect(LeadService.create).toHaveBeenCalled());
    expect((LeadService.create as any).mock.calls[0][0]).toMatchObject({ nome: 'Novo Cliente', origem: 'Feira' });
  });

  it('modal de criar: a origem criada no lápis fica selecionável e vai no lead', async () => {
    const user = userEvent.setup();
    renderKanban();
    await screen.findByRole('button', { name: 'Editar lead' });
    await user.click(screen.getByRole('button', { name: /Menu Principal/i }));
    await user.click(screen.getAllByRole('button', { name: /Novo Lead Manual/i })[0]);
    await screen.findByRole('combobox', { name: 'Origem' });

    await adicionarFeiraPeloLapis(user, document.body);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Origem' }), 'Feira');
    await user.type(screen.getByLabelText(/Nome/i), 'Novo Cliente');
    await user.type(screen.getByLabelText(/WhatsApp/i), '11911112222');
    await user.click(screen.getByRole('button', { name: /Criar Lead/i }));

    await waitFor(() => expect(LeadService.create).toHaveBeenCalled());
    expect((LeadService.create as any).mock.calls[0][0]).toMatchObject({ origem: 'Feira' });
  });

  it('modal de editar (flag desligada): origem fora da lista mantida; origem nova selecionável', async () => {
    flags.interacoes = false;
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
    await screen.findByRole('heading', { name: 'Editar Lead' });

    const campo = await screen.findByRole('combobox', { name: 'Origem' });
    await waitFor(() => expect(within(campo).getAllByRole('option')).toHaveLength(6));
    expect(campo).toHaveDisplayValue('Panfleto');

    await adicionarFeiraPeloLapis(user, document.body);
    expect(within(screen.getByRole('combobox', { name: 'Origem' })).getByRole('option', { name: 'Feira' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Origem' })).toHaveDisplayValue('Panfleto');
  });

  it('modal de editar de lead do site: texto travado, sem select e sem lápis (RF-OR-09)', async () => {
    flags.interacoes = false;
    lead = { ...leadBase, origem: 'Landing Page', source: 'LANDING_PAGE' };
    const user = userEvent.setup();
    renderKanban();
    await user.click(await screen.findByRole('button', { name: 'Editar lead' }));
    await screen.findByRole('heading', { name: 'Editar Lead' });
    expect(screen.getByText('Leads vindos do site não podem ter a origem alterada.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Origem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar origens' })).not.toBeInTheDocument();
  });
});
