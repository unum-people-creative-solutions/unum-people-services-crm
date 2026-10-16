// Tenant ativo do CRM, compartilhado pelo TenantContext (dentro dos layouts
// logados) e pelo PendingTermsGate (no layout raiz, fora do provider).
export const ACTIVE_TENANT_KEY = "active-tenant";

// Disparado em window sempre que o tenant ativo muda; detail = ID do tenant.
export const ACTIVE_TENANT_CHANGE_EVENT = "active-tenant-change";
