import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KanbanPage from './page';
import api, { type MeusAcessos } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import leadDoGet from '@/services/__fixtures__/get-leads-lead-google-agenda.json';

// crm-google-agenda RF-27 / CA-27: /kanban?lead=<id> abre o lead no mesmo modal que o
// clique no cartão abre, procurando só nos leads já carregados do tenant ativo.
// Vale com e sem as flags (é só navegação).

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: () => nav.params,
}));
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

const flags = vi.hoisted(() => ({ ligadas: true }));
vi.mock('@/hooks/useFlag', () => ({ useFlag: () => flags.ligadas }));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: any) => <div>{children}</div>,
  Droppable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), droppableProps: {} }, {}),
  Draggable: ({ children }: any) => children({ draggableProps: {}, innerRef: vi.fn(), dragHandleProps: {} }, {}),
}));
vi.mock('xlsx', () => ({ utils: {}, writeFile: vi.fn() }));

const ACESSOS: MeusAcessos = {
  tenant_id: 'tenant-1',
  operador: false,
  ferramentas: [{ id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'p', nome: 'p', sistema: false, implicito: false }, permissoes: ['crm.lead.ver', 'crm.lead.editar'] }],
};

// Dois leads no quadro: o da fixture real em "Agendados" e outro em "Novos Leads".
const outro = { ...leadDoGet, id: '7a1b2c3d-0000-4000-8000-000000000001', nome: 'João Pedro Lima', telefone: '+5511977776666', status: 'NOVO' };
const quadro: Record<string, unknown[]> = { AGENDADO: [leadDoGet], NOVO: [outro] };
let chamadas: string[] = [];

const renderKanban = () =>
  render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );

describe('/kanban?lead=<id>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    chamadas = [];
    flags.ligadas = true;
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
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      chamadas.push(url);
      if (url.startsWith('/me/acessos')) return { data: ACESSOS };
      if (url.startsWith('/leads?view=sales')) return { data: [] };
      if (url.startsWith('/leads?')) return { data: quadro[new URLSearchParams(url.split('?')[1]).get('status') as string] ?? [] };
      if (url.startsWith('/integracoes/google-agenda')) return { data: { conectada: false } };
      throw new Error(`GET inesperado: ${url}`);
    });
  });

  it.each([[true], [false]])('abre o modal do lead depois de carregar o quadro (flags ligadas=%s)', async (ligadas) => {
    flags.ligadas = ligadas;
    nav.params = new URLSearchParams(`lead=${outro.id}`);
    renderKanban();

    expect(await screen.findByRole('heading', { name: 'Editar Lead' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('João Pedro Lima')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Maria Clara Souza')).not.toBeInTheDocument();
  });

  it('id que não está no quadro carregado (inexistente ou de outra conta): quadro normal, sem modal, sem erro e sem buscar o lead', async () => {
    nav.params = new URLSearchParams('lead=9f9f9f9f-0000-4000-8000-000000000999');
    renderKanban();

    await screen.findByText('Maria Clara Souza');
    await waitFor(() => expect(chamadas.filter((u) => u.startsWith('/leads?status=')).length).toBe(5));
    expect(screen.queryByRole('heading', { name: 'Editar Lead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(chamadas.some((u) => u.includes('9f9f9f9f'))).toBe(false);
  });

  it('sem o parâmetro, o quadro abre sem modal', async () => {
    nav.params = new URLSearchParams();
    renderKanban();
    await screen.findByText('Maria Clara Souza');
    expect(screen.queryByRole('heading', { name: 'Editar Lead' })).not.toBeInTheDocument();
  });
});
