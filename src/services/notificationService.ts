import api from './api';

export const NotificationService = {
  subscribe: async (subscription: PushSubscription, tenantId?: string) => {
    let url = '/notifications/subscribe';
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    // Convertendo para JSON puro para garantir que apenas endpoint e keys sejam enviados
    const response = await api.post(url, subscription.toJSON());
    return response.data;
  },
  checkStatus: async (endpoint: string, tenantId?: string) => {
    let url = `/notifications/check?endpoint=${encodeURIComponent(endpoint)}`;
    if (tenantId) {
      url += `&tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.get(url);
    return response.data.subscribed; // retorna boolean
  },
  unsubscribe: async (endpoint: string, tenantId?: string) => {
    let url = '/notifications/unsubscribe';
    if (tenantId) {
      url += `?tenant_id=${encodeURIComponent(tenantId)}`;
    }
    const response = await api.delete(url, { data: { endpoint } });
    return response.data;
  }
};
