import type { MetadataRoute } from 'next'

// Só a landing page é pública. As outras rotas mandam quem não está logado
// para o login do Cognito (AuthGuard), e era por elas que o Google chegava a
// auth.unumpeople.com.br e indexava a página vazia de login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/kanban', '/onboarding', '/settings', '/tenants', '/acesso-negado', '/login', '/auth/'],
    },
  }
}
