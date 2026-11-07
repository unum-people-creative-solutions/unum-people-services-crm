import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KanbanPage from './page';
import api, { type MeusAcessos } from '@/services/api';
import { AcessosProvider } from '@/contexts/AcessosContext';
import { useAuthStore } from '@/store/authStore';
import { useTenant } from '@/contexts/TenantContext';
import conectada from '@/services/__fixtures__/google-agenda-conectada.json';
import naoConectada from '@/services/__fixtures__/google-agenda-nao-conectada.json';
import leadDoGet from '@/services/__fixtures__/get-leads-lead-google-agenda.json';
import putOk from '@/services/__fixtures__/put-lead-google-agenda-ok.json';
import putFalhou from '@/services/__fixtures__/put-lead-google-agenda-falhou.json';

// crm-google-agenda TASK-FE-06: RF-24 (aviso), RF-25 (cartão), RF-26 (pergunta ao sair
// de "Agendados") e RF-28 / CA-28 (quadro sem a integração). LeadService,
// GoogleAgendaService e AcessosService são os de verdade: só o axios responde, por URL,
// com o JSON real da API. "agora" = 2026-11-10T15:00:00Z; o lead da fixture está
// agendado para 2026-11-11T18:00:00Z.

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

const flags = vi.hoisted(() => ({ 'crm-google-agenda': true, 'crm-agendamento': true } as Record<string, boolean>));
vi.mock('@/hooks/useFlag', () => ({ useFlag: (chave: string) => flags[chave] === true }));

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

const ID = leadDoGet.id;
const LINK = leadDoGet.google_evento_link;
const GESTOR = ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar', 'crm.lead.excluir', 'crm.integracoes.gerir'];
const VENDEDOR = ['crm.lead.ver', 'crm.lead.criar', 'crm.lead.editar', 'crm.lead.excluir'];

function acessos(crm: string[]): MeusAcessos {
  return {
    tenant_id: 'tenant-1',
    operador: false,
    ferramentas: [{ id: 'crm', nome: 'CRM', contratada: true, papel: { id: 'p', nome: 'p', sistema: false, implicito: false }, permissoes: crm }],
  };
}

// Variações da fixture real: a mesma resposta do GET /leads sem o evento ou com a falha.
const { google_evento_link: _link, google_situacao: _situacao, ...leadSemEvento } = leadDoGet;
const leadComFalha = { ...leadSemEvento, google_situacao: 'falhou' };

let quadro: Record<string, unknown[]> = {};
let chamadas: string[] = [];
let corposPut: unknown[] = [];
let respostaPut: () => Promise<unknown>;
let respostaPost: () => Promise<unknown>;
let permissoes: string[] = GESTOR;
let integracao: unknown = conectada;

function rotear() {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    chamadas.push(`GET ${url}`);
    if (url.startsWith('/me/acessos')) return { data: acessos(permissoes) };
    if (url.startsWith('/leads?view=sales')) return { data: [] };
    if (url.startsWith('/leads?')) {
      const status = new URLSearchParams(url.split('?')[1]).get('status') as string;
      return { data: quadro[status] ?? [] };
    }
    if (url === '/integracoes/google-agenda?tenant_id=tenant-1') return { data: integracao };
    if (url.startsWith('/integracoes/google-agenda/ocupado?')) return { data: { ocupado: [] } };
    throw new Error(`GET inesperado: ${url}`);
  });
  vi.spyOn(api, 'put').mockImplementation(async (url: string, corpo?: unknown) => {
    chamadas.push(`PUT ${url}`);
    // O corpo como vai pela rede (chaves undefined não vão no JSON).
    corposPut.push(JSON.parse(JSON.stringify(corpo)));
    return respostaPut();
  });
  vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
    chamadas.push(`POST ${url}`);
    return respostaPost();
  });
}

const renderKanban = () =>
  render(
    <AcessosProvider>
      <KanbanPage />
    </AcessosProvider>,
  );

async function arrastar(de: string, para: string, id = ID) {
  await act(async () => {
    await dnd.onDragEnd!({ source: { droppableId: de, index: 0 }, destination: { droppableId: para, index: 0 }, draggableId: id });
  });
}

const coluna = (titulo: string) => screen.getByRole('heading', { name: new RegExp(`^${titulo}`) }).parentElement as HTMLElement;
const rotasDaIntegracao = () => chamadas.filter((c) => c.includes('/integracoes/google-agenda') || c.includes('/google-agenda'));
const PERGUNTA = 'Tirar também da sua agenda?';

describe('Quadro: Google Agenda', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    dnd.onDragEnd = null;
    flags['crm-google-agenda'] = true;
    flags['crm-agendamento'] = true;
    chamadas = [];
    corposPut = [];
    quadro = { AGENDADO: [leadDoGet] };
    permissoes = GESTOR;
    integracao = conectada;
    respostaPut = async () => ({ data: { message: 'Lead updated successfully' } });
    respostaPost = async () => ({ data: { google_agenda: putOk.google_agenda } });
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
    rotear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('CA-25 — cartão em "Agendados"', () => {
    it('google_situacao=ok: link "Na sua agenda" com href, target e rel exatos', async () => {
      renderKanban();
      const link = await screen.findByRole('link', { name: 'Na sua agenda' });
      expect(link).toHaveAttribute('href', LINK);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(coluna('Agendados')).getByRole('link', { name: 'Na sua agenda' })).toBe(link);
    });

    it('falhou: "Não foi para a agenda" e "Tentar de novo", ocupado durante a chamada, e vira o link no sucesso', async () => {
      quadro = { AGENDADO: [leadComFalha] };
      let responder!: (v: unknown) => void;
      respostaPost = () => new Promise((r) => { responder = r; });
      renderKanban();

      expect(await screen.findByText('Não foi para a agenda')).toBeInTheDocument();
      const botao = screen.getByRole('button', { name: 'Tentar de novo' });
      fireEvent.click(botao);

      await waitFor(() => expect(botao).toBeDisabled());
      expect(botao).toHaveAttribute('aria-busy', 'true');
      expect(chamadas).toContain(`POST /leads/${ID}/google-agenda?tenant_id=tenant-1`);

      await act(async () => { responder({ data: { google_agenda: putOk.google_agenda } }); });
      const link = await screen.findByRole('link', { name: 'Na sua agenda' });
      expect(link).toHaveAttribute('href', putOk.google_agenda.link);
      expect(screen.queryByText('Não foi para a agenda')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    });

    it('falhou e o "Tentar de novo" dá erro: a mensagem aparece', async () => {
      quadro = { AGENDADO: [leadComFalha] };
      respostaPost = async () => Promise.reject({ response: { status: 409, data: { error: 'agenda_indisponivel' } } });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderKanban();

      fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
      expect(await screen.findByText('Não foi possível pôr na sua agenda. Tente de novo mais tarde.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled();
    });

    it('sem evento: nada novo no cartão', async () => {
      quadro = { AGENDADO: [leadSemEvento] };
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      expect(screen.queryByRole('link', { name: 'Na sua agenda' })).not.toBeInTheDocument();
      expect(screen.queryByText('Não foi para a agenda')).not.toBeInTheDocument();
    });
  });

  describe('CA-26 — sair de "Agendados" com evento', () => {
    it('para "Perdido" abre a pergunta e nada é gravado antes da escolha', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'PERDIDO');

      const dialogo = screen.getByRole('dialog', { name: PERGUNTA });
      expect(within(dialogo).getByRole('button', { name: 'Tirar da agenda' })).toBeInTheDocument();
      expect(within(dialogo).getByRole('button', { name: 'Manter na agenda' })).toBeInTheDocument();
      expect(corposPut).toEqual([]);
    });

    it('"Tirar da agenda" envia remover_da_agenda: true no PUT que muda a coluna', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'PERDIDO');
      fireEvent.click(screen.getByRole('button', { name: 'Tirar da agenda' }));

      await waitFor(() => expect(corposPut).toHaveLength(1));
      expect(chamadas).toContain(`PUT /leads/${ID}?tenant_id=tenant-1`);
      expect(corposPut[0]).toStrictEqual({ status: 'PERDIDO', valor_venda: 0, remover_da_agenda: true });
      expect(screen.queryByRole('dialog', { name: PERGUNTA })).not.toBeInTheDocument();
    });

    it('"Manter na agenda" envia remover_da_agenda: false', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'PERDIDO');
      fireEvent.click(screen.getByRole('button', { name: 'Manter na agenda' }));

      await waitFor(() => expect(corposPut).toHaveLength(1));
      expect(corposPut[0]).toStrictEqual({ status: 'PERDIDO', valor_venda: 0, remover_da_agenda: false });
    });

    it('fechar a pergunta não envia nada e o cartão volta para "Agendados"', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'PERDIDO');
      expect(within(coluna('Perdido')).getByText('Maria Clara Souza')).toBeInTheDocument();

      fireEvent.click(within(screen.getByRole('dialog', { name: PERGUNTA })).getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByRole('dialog', { name: PERGUNTA })).not.toBeInTheDocument();
      await waitFor(() => expect(within(coluna('Agendados')).getByText('Maria Clara Souza')).toBeInTheDocument());
      expect(within(coluna('Perdido')).queryByText('Maria Clara Souza')).not.toBeInTheDocument();
      expect(corposPut).toEqual([]);
    });

    it('Esc também fecha sem enviar', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'PERDIDO');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: PERGUNTA })).not.toBeInTheDocument();
      expect(corposPut).toEqual([]);
    });

    it('voltar para "Novos Leads" também pergunta (no lugar de "Mover para trás?")', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'NOVO');
      expect(screen.getByRole('dialog', { name: PERGUNTA })).toBeInTheDocument();
      expect(screen.queryByText('Mover para trás?')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Tirar da agenda' }));
      await waitFor(() => expect(corposPut).toHaveLength(1));
      expect(corposPut[0]).toStrictEqual({ status: 'NOVO', valor_venda: 0, remover_da_agenda: true });
    });

    it('"Mover lead" (celular) para "Perdido" também pergunta', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      fireEvent.click(screen.getByRole('button', { name: 'Mover lead' }));
      fireEvent.click(screen.getByRole('button', { name: 'Perdido' }));
      expect(screen.getByRole('dialog', { name: PERGUNTA })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Manter na agenda' }));
      await waitFor(() => expect(corposPut).toHaveLength(1));
      expect(corposPut[0]).toStrictEqual({ status: 'PERDIDO', valor_venda: 0, remover_da_agenda: false });
    });

    it('para "Ganho" não pergunta (segue para a venda)', async () => {
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'GANHO');
      expect(screen.queryByRole('dialog', { name: PERGUNTA })).not.toBeInTheDocument();
      expect(screen.getByText('Venda Concluída!')).toBeInTheDocument();
    });

    it('cartão sem evento não pergunta: o PUT vai como antes, sem remover_da_agenda', async () => {
      quadro = { AGENDADO: [leadSemEvento] };
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('AGENDADO', 'PERDIDO');
      expect(screen.queryByRole('dialog', { name: PERGUNTA })).not.toBeInTheDocument();
      await waitFor(() => expect(corposPut).toHaveLength(1));
      expect(corposPut[0]).toStrictEqual({ status: 'PERDIDO', valor_venda: 0 });
    });
  });

  describe('CA-24 — resposta do agendamento (RF-24)', () => {
    async function agendarNovo() {
      quadro = { NOVO: [{ ...leadSemEvento, status: 'NOVO', agendado_em: undefined }] };
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('NOVO', 'AGENDADO');
      await screen.findByRole('checkbox', { name: 'Adicionar ao Google Agenda' });
      fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-12' } });
      fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '15:30' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    }

    it('falhou: o aviso do RF-24, e o PUT levou duracao_min e google_agenda', async () => {
      respostaPut = async () => ({ data: putFalhou });
      await agendarNovo();

      expect(await screen.findByText('Agendado no CRM, mas não foi possível pôr na sua agenda.')).toBeInTheDocument();
      expect(corposPut[0]).toStrictEqual({ status: 'AGENDADO', agendado_em: '2026-11-12T18:30:00Z', duracao_min: 50, google_agenda: true });
      expect(screen.queryByRole('dialog', { name: 'Agendar horário' })).not.toBeInTheDocument();
    });

    it('ok: sem aviso', async () => {
      respostaPut = async () => ({ data: putOk });
      await agendarNovo();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Agendar horário' })).not.toBeInTheDocument());
      expect(screen.queryByText('Agendado no CRM, mas não foi possível pôr na sua agenda.')).not.toBeInTheDocument();
    });
  });

  // CA-24 (RF-23) no quadro: é o quadro que calcula quem pode conectar
  // (GlobalAdmin ou crm.integracoes.gerir) e passa ao modal.
  describe('CA-24 — atalho "Conectar o Google Agenda" com a integração não conectada', () => {
    const TEXTO_ATALHO = 'Conecte o Google Agenda para o horário ir direto para a sua agenda.';

    async function abrirModalNaoConectada() {
      integracao = naoConectada;
      quadro = { NOVO: [{ ...leadSemEvento, status: 'NOVO', agendado_em: undefined }] };
      renderKanban();
      await screen.findByText('Maria Clara Souza');
      await arrastar('NOVO', 'AGENDADO');
      expect(screen.getByRole('dialog', { name: 'Agendar horário' })).toBeInTheDocument();
      await waitFor(() => expect(chamadas).toContain('GET /integracoes/google-agenda?tenant_id=tenant-1'));
      await act(async () => {});
    }

    it('Gestor (crm.integracoes.gerir) vê o texto e o link para a aba', async () => {
      permissoes = GESTOR;
      await abrirModalNaoConectada();

      const link = await screen.findByRole('link', { name: 'Conectar o Google Agenda' });
      expect(link).toHaveAttribute('href', '/settings?aba=google-agenda');
      expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === `${TEXTO_ATALHO} Conectar o Google Agenda`)).toBeInTheDocument();
    });

    it('Vendedor (sem crm.integracoes.gerir) não vê o atalho', async () => {
      permissoes = VENDEDOR;
      await abrirModalNaoConectada();

      expect(screen.queryByRole('link', { name: 'Conectar o Google Agenda' })).not.toBeInTheDocument();
      expect(screen.queryByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith(TEXTO_ATALHO))).not.toBeInTheDocument();
    });
  });

  describe('CA-28 — flag desligada (quadro e modal)', () => {
    it.each([['crm-google-agenda'], ['crm-agendamento']])('%s desligada: nenhuma rota do RF-07, nenhum texto novo e o PUT de antes', async (chave) => {
      flags[chave] = false;
      quadro = { AGENDADO: [leadDoGet] };
      renderKanban();
      await screen.findByText('Maria Clara Souza');

      expect(screen.queryByRole('link', { name: 'Na sua agenda' })).not.toBeInTheDocument();
      for (const novo of [/Na sua agenda/, /Não foi para a agenda/, /Google Agenda/, /Tirar também da sua agenda/]) {
        expect(screen.queryByText(novo)).not.toBeInTheDocument();
      }

      // Modal (só existe com crm-agendamento ligada): abre sem ler a integração.
      if (flags['crm-agendamento']) {
        fireEvent.click(screen.getByRole('button', { name: 'Alterar horário' }));
        await act(async () => {});
        expect(screen.getByRole('dialog', { name: 'Alterar horário' })).toBeInTheDocument();
        expect(screen.queryByText(/Google Agenda/)).not.toBeInTheDocument();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      }

      await arrastar('AGENDADO', 'PERDIDO');
      expect(screen.queryByRole('dialog', { name: PERGUNTA })).not.toBeInTheDocument();
      await waitFor(() => expect(corposPut).toHaveLength(1));
      expect(corposPut[0]).toStrictEqual({ status: 'PERDIDO', valor_venda: 0 });
      expect(rotasDaIntegracao()).toEqual([]);
    });
  });
});
