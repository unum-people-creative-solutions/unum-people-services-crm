import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { redirectToHostedUI } from '@/lib/pkce';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_GATEWAY_URL,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().session?.token;
  if (token) {
    config.headers.Authorization = token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error("Não autorizado. Limpando sessão...");
      useAuthStore.getState().logout();
      if (typeof window !== 'undefined') {
        // TASK-FE-CRM-003: não existe mais página /login própria do app —
        // reautenticação sempre passa pelo Hosted UI (Cognito).
        void redirectToHostedUI(window.location.pathname);
      }
    }
    if (error.response?.status === 403) {
      // 403 com permissão nomeada fica na tela; os demais seguem para /acesso-negado.
      const permissao = error.response?.data?.permissao;
      const recusaPorPermissao = typeof permissao === 'string' && permissao.length > 0;
      if (!recusaPorPermissao && typeof window !== 'undefined' && !window.location.pathname.includes('/acesso-negado')) {
        window.location.href = '/acesso-negado';
      }
    }
    return Promise.reject(error);
  }
);

export interface LeadData {
  nome: string;
  email?: string;
  telefone: string;
  cpf?: string;
  data_nascimento?: string;
  origem: string;
  anotacoes?: string;
}

// Uma venda do lead, como a API devolve em lead.sales. ads e ads_motivo são o
// resultado do envio ao Google Ads (spec ads-status-final; tags json de domain.Sale).
export interface LeadSale {
  id: string;
  valor: number;
  data: string;
  tipo?: string;
  ads?: string;
  ads_motivo?: string;
  ads_request_id?: string;
}

// Contrato RF-07: GET /leads?view=sales&month=YYYY-MM (uma venda por elemento; o status do lead não filtra).
export interface MonthSale {
  lead_id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  data_nascimento: string;
  origem: string;
  status: string;
  sale_id: string;
  valor: number;
  data: string;
}

// Agendamento do lead (spec crm-agendamento-e-lembretes, RF-51/RNF-07): string
// RFC3339 UTC como a API devolve (tag json agendado_em de domain.Lead, omitzero).
export interface LeadAgendamento {
  agendado_em?: string;
}

// Google Agenda (spec crm-google-agenda RF-02 a RF-16). Nenhum tipo leva token
// (TECH-DESIGN §8): a API nunca o devolve.
export type SituacaoDoEventoGoogle = 'ok' | 'falhou' | 'removido';

// Campos do lead no GET /leads (RF-14), só com a integração ligada.
export interface LeadGoogleAgenda {
  duracao_min?: number;
  google_evento_link?: string;
  google_situacao?: SituacaoDoEventoGoogle;
}

export interface ConexaoGoogleAgenda {
  conectada: true;
  situacao: 'ativa' | 'caida';
  email: string;
  agenda_id: string;
  agenda_nome: string;
  duracao_padrao_min: number;
  conflito: boolean;
  lista_agendas: boolean;
}

export type SituacaoGoogleAgenda = { conectada: false } | ConexaoGoogleAgenda;

export interface AgendaGoogle {
  id: string;
  nome: string;
  principal: boolean;
}

export interface IntervaloOcupado {
  inicio: string;
  fim: string;
}

// Resultado da tentativa no Google, na resposta do PUT /leads/{id} e do RF-16.
export interface ResultadoGoogleAgenda {
  situacao: SituacaoDoEventoGoogle;
  link?: string;
}

export interface RespostaAgendamento {
  message?: string;
  google_agenda?: ResultadoGoogleAgenda;
}

// Campos do RF-15 que o modal manda junto com o agendamento.
export interface AgendamentoNoGoogle {
  duracao_min: number;
  google_agenda: boolean;
}

export const LeadService = {
  list: async (status: string, startDate?: string, endDate?: string, tenantId?: string) => {
    const params = new URLSearchParams({ status });
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (tenantId) params.append('tenant_id', tenantId);
    
    const response = await api.get(`/leads?${params.toString()}`);
    return response.data;
  },
  listSalesByMonth: async (month: string, tenantId?: string): Promise<MonthSale[]> => {
    const params = new URLSearchParams({ view: 'sales', month });
    if (tenantId) params.append('tenant_id', tenantId);

    const response = await api.get(`/leads?${params.toString()}`);
    return response.data;
  },
  create: async (data: LeadData, tenantId?: string) => {
    let url = `/leads`;
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.post(url, data);
    return response.data;
  },
  // removerDaAgenda (crm-google-agenda RF-26): a resposta à pergunta ao sair de "Agendados";
  // sem pergunta, a chave não vai.
  updateStatus: async (id: string, status: string, valor?: number, dataVenda?: string, tenantId?: string, removerDaAgenda?: boolean) => {
    let url = `/leads/${id}`;
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const corpo = removerDaAgenda === undefined
      ? { status, valor_venda: valor, data_venda: dataVenda }
      : { status, valor_venda: valor, data_venda: dataVenda, remover_da_agenda: removerDaAgenda };
    const response = await api.put(url, corpo);
    return response.data;
  },
  // Move para "Agendados" ou altera o horário: PUT /leads/{id} com corpo exatamente
  // {"status":"AGENDADO","agendado_em":<RFC3339 UTC>} (TECH-DESIGN §5.1/§5.7); com o
  // Google Agenda ativo, também duracao_min e google_agenda (crm-google-agenda RF-22).
  agendar: async (id: string, agendadoEm: string, tenantId?: string, noGoogle?: AgendamentoNoGoogle): Promise<RespostaAgendamento> => {
    let url = `/leads/${id}`;
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const corpo = noGoogle
      ? { status: 'AGENDADO', agendado_em: agendadoEm, duracao_min: noGoogle.duracao_min, google_agenda: noGoogle.google_agenda }
      : { status: 'AGENDADO', agendado_em: agendadoEm };
    const response = await api.put(url, corpo);
    return response.data;
  },
  update: async (id: string, data: { nome: string; email?: string; telefone: string; cpf?: string; data_nascimento?: string; origem?: string; anotacoes?: string }, tenantId?: string) => {
    let url = `/leads/${id}`;
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.patch(url, data);
    return response.data;
  },
  searchCustomers: async (query: string, tenantId?: string) => {
    let url = `/leads/search?q=${query}`;
    if (tenantId) {
      url += `&tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.get(url);
    return response.data;
  },
  addSale: async (leadId: string, valor: number, data: string, tenantId?: string) => {
    let url = `/leads/${leadId}/sales`;
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.post(url, { valor, data });
    return response.data;
  },
  delete: async (id: string, tenantId?: string) => {
    let url = `/leads/${id}`;
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.delete(url);
    return response.data;
  }
};

export const TenantService = {
  list: async () => {
    const response = await api.get('/admin/tenants');
    return response.data;
  },
  listMyTenants: async (service?: string) => {
    let url = '/me/tenants';
    if (service) {
      url += `?service=${service}`;
    }
    const response = await api.get(url);
    return response.data;
  },
  create: async (data: { nome_negocio: string; nome_admin: string; email_contato: string; nicho: string; google_ads_customer_id?: string; use_mcc_auth?: boolean }) => {
    const response = await api.post('/admin/tenants', data);
    return response.data;
  },
  createUser: async (data: { email: string; name: string; tenant_id: string }) => {
    const response = await api.post('/admin/users', data);
    return response.data;
  },
  googleAdsCallback: async (code: string, state: string, redirectUri: string) => {
    // Usando a construção manual da URL para garantir compatibilidade total com o esperado pelo backend
    const url = `/auth/google-ads/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    const response = await api.post(url);
    return response.data;
  },
};

export interface TermStatusItem {
  type: string;
  term_id: string;
  term_name: string;
  required_version: number;
  can_accept: boolean;
  document_url: string;
  accepted_version?: number;
  accepted_at?: string;
}

export interface TermsStatusResponse {
  pending: TermStatusItem[];
}

export const TermsService = {
  getStatus: async (tenantId?: string): Promise<TermsStatusResponse> => {
    let url = '/me/terms/status';
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.get(url);
    return response.data;
  },
};

export interface PapelResumo {
  id: string;
  nome: string;
  sistema: boolean;
  implicito: boolean;
}

export interface AcessoFerramenta {
  id: string;
  nome: string;
  contratada: boolean;
  papel: PapelResumo | null;
  permissoes: string[];
}

export interface MeusAcessos {
  tenant_id: string;
  operador: boolean;
  ferramentas: AcessoFerramenta[];
}

export const AcessosService = {
  get: async (tenantId: string): Promise<MeusAcessos> => {
    const response = await api.get(`/me/acessos?tenant_id=${encodeURIComponent(tenantId)}`);
    return response.data;
  },
};

// Feature flags avaliadas pela API para a empresa ativa (modo-teste-fase3; crm-agendamento-e-lembretes RF-76).
export const FlagsService = {
  get: async (tenantId: string): Promise<Record<string, boolean>> => {
    const response = await api.get(`/me/flags?tenant_id=${encodeURIComponent(tenantId)}`);
    return response.data.flags;
  },
};

// Rotas do Google Agenda (crm-google-agenda RF-07); empresa pela query tenant_id.
const qsTenant = (tenantId: string) => `tenant_id=${encodeURIComponent(tenantId)}`;

export const GoogleAgendaService = {
  situacao: async (tenantId: string): Promise<SituacaoGoogleAgenda> => {
    const response = await api.get(`/integracoes/google-agenda?${qsTenant(tenantId)}`);
    return response.data;
  },
  conectar: async (tenantId: string, code: string, redirectUri: string): Promise<SituacaoGoogleAgenda> => {
    const response = await api.post(`/integracoes/google-agenda/conectar?${qsTenant(tenantId)}`, {
      code,
      redirect_uri: redirectUri,
    });
    return response.data;
  },
  agendas: async (tenantId: string): Promise<AgendaGoogle[]> => {
    const response = await api.get(`/integracoes/google-agenda/agendas?${qsTenant(tenantId)}`);
    return response.data;
  },
  configurar: async (tenantId: string, dados: { agenda_id: string; duracao_padrao_min: number }): Promise<SituacaoGoogleAgenda> => {
    const { agenda_id, duracao_padrao_min } = dados;
    const response = await api.put(`/integracoes/google-agenda?${qsTenant(tenantId)}`, { agenda_id, duracao_padrao_min });
    return response.data;
  },
  desconectar: async (tenantId: string): Promise<void> => {
    await api.delete(`/integracoes/google-agenda?${qsTenant(tenantId)}`);
  },
  ocupado: async (tenantId: string, inicio: string, fim: string, leadId?: string): Promise<IntervaloOcupado[]> => {
    const params = new URLSearchParams({ tenant_id: tenantId, inicio, fim });
    if (leadId) params.append('lead', leadId);
    const response = await api.get(`/integracoes/google-agenda/ocupado?${params.toString()}`);
    return response.data.ocupado;
  },
  tentarDeNovo: async (tenantId: string, leadId: string): Promise<ResultadoGoogleAgenda> => {
    const response = await api.post(`/leads/${leadId}/google-agenda?${qsTenant(tenantId)}`);
    return response.data.google_agenda;
  },
};

export const MENSAGEM_SEM_PERMISSAO ='Você não tem permissão para fazer isso nesta empresa.';

// 403 com data.permissao preenchida usa a mensagem fixa; o resto mantém o texto padrão.
export function mensagemDeErro(err: unknown, padrao: string): string {
  const response = (err as { response?: { status?: number; data?: { permissao?: unknown } } } | null)?.response;
  const permissao = response?.data?.permissao;
  if (response?.status === 403 && typeof permissao === 'string' && permissao.length > 0) {
    return MENSAGEM_SEM_PERMISSAO;
  }
  return padrao;
}

export default api;

export interface AdsConfig {
  conectado: boolean;
  google_ads_customer_id: string;
  ads_conversion_action_id: string;
  ads_recurring_conversion_action_id: string;
}

export type AdsConfigInput = Omit<AdsConfig, 'conectado'>;

export const AdsConfigService = {
  get: async (tenantId: string): Promise<AdsConfig> => {
    const response = await api.get(`/integracoes/google-ads?tenant_id=${encodeURIComponent(tenantId)}`);
    return response.data;
  },
  update: async (tenantId: string, data: AdsConfigInput): Promise<AdsConfig> => {
    const {
      google_ads_customer_id,
      ads_conversion_action_id,
      ads_recurring_conversion_action_id,
    } = data;
    const response = await api.put(`/integracoes/google-ads?tenant_id=${encodeURIComponent(tenantId)}`, {
      google_ads_customer_id,
      ads_conversion_action_id,
      ads_recurring_conversion_action_id,
    });
    return response.data;
  },
};
