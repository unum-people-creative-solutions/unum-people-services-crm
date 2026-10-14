import { describe, it, expect } from 'vitest'
import robots from './robots'

describe('robots.txt do CRM', () => {
  it('libera a landing page e bloqueia as rotas que exigem login, num único grupo para todos os robôs', () => {
    const resultado = robots()

    // Um grupo só: um grupo a mais (ex.: "User-agent: Googlebot / Allow: /")
    // faria o Google ignorar o "*" e o bloqueio sumiria.
    expect(resultado).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: expect.any(Array) },
    })
    const { disallow } = resultado.rules as { disallow: string[] }
    expect([...disallow].sort()).toEqual(
      ['/acesso-negado', '/auth/', '/kanban', '/login', '/onboarding', '/settings', '/tenants'].sort(),
    )
  })
})
