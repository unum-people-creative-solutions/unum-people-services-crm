// Clique da notificação (spec crm-funil-e-atividades-f3, D-F3-5).
// data.url quando existir; sem url, /kanban.

export function destinoDaNotificacao(dados: { url?: unknown } | null | undefined): string {
  const url = dados?.url;
  if (typeof url === 'string' && url.length > 0) return url;
  return '/kanban';
}

export function urlParaAbrir(dados: { url?: unknown } | null | undefined, origin: string): string {
  return new URL(destinoDaNotificacao(dados), origin).href;
}
