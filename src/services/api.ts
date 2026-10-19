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
  updateStatus: async (id: string, status: string, valor?: number, dataVenda?: string, tenantId?: string) => {
    let url = `/leads/${id}`;
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.put(url, { status, valor_venda: valor, data_venda: dataVenda });
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
  deleteAccount: async () => {
    const response = await api.delete('/me/account');
    return response.data;
  },
  listUsers: async (tenantId?: string) => {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenant_id', tenantId);
    const response = await api.get(`/tenant/users${params.toString() ? '?' + params.toString() : ''}`);
    return response.data;
  },

  // tenantId: a empresa selecionada, a mesma que listUsers mostra.
  addUser: async (data: { name: string; email: string; role: string }, tenantId: string) => {
    const response = await api.post(`/tenant/users?tenant_id=${encodeURIComponent(tenantId)}`, data);
    return response.data;
  },
  updateUserRole: async (email: string, role: string, tenantId: string) => {
    const response = await api.patch(`/tenant/users?email=${encodeURIComponent(email)}&tenant_id=${encodeURIComponent(tenantId)}`, { role });
    return response.data;
  },
  removeUser: async (email: string, tenantId: string) => {
    const response = await api.delete(`/tenant/users?email=${encodeURIComponent(email)}&tenant_id=${encodeURIComponent(tenantId)}`);
    return response.data;
  }
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

export const MENSAGEM_SEM_PERMISSAO = 'Você não tem permissão para fazer isso nesta empresa.';

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
