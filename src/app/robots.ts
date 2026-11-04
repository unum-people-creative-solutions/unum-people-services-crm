import type { MetadataRoute } from 'next'

// A raiz fica liberada só para o Google ler o noindex dela e tirá-la do índice
// (crm-raiz-vai-ao-login: ela leva ao login; a venda do CRM é em
// unumpeople.app/crm). /auth/callback também
// é pública, mas só serve para concluir o login (sem o código de retorno, mostra
// um erro). As demais rotas mandam quem não está logado para o login do Cognito
// (AuthGuard), e era por elas que o Google chegava a auth.unumpeople.com.br e
// indexava a página vazia de login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/kanban', '/onboarding', '/settings', '/tenants', '/acesso-negado', '/login', '/auth/'],
    },
  }
}
