import { describe, it, expect } from 'vitest'
import robots from './robots'

describe('robots.txt do CRM', () => {
  it('libera a landing page e bloqueia as rotas que exigem login', () => {
    const { rules } = robots()
    const regra = Array.isArray(rules) ? rules[0] : rules

    expect(regra.userAgent).toBe('*')
    expect(regra.allow).toBe('/')
    expect([...(regra.disallow as string[])].sort()).toEqual(
      ['/acesso-negado', '/auth/', '/kanban', '/login', '/onboarding', '/settings', '/tenants'].sort(),
    )
  })
})
