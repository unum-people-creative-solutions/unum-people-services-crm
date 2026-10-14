import { describe, it, expect, vi } from 'vitest'
import type { Metadata } from 'next'

// O layout raiz carrega fonte e componentes; para ler só os metadados, basta
// simulá-los como em layout.test.tsx.
vi.mock('next/font/google', () => ({
  Poppins: () => ({ variable: '--font-poppins-mock', className: 'poppins-mock-class' }),
}))
vi.mock('@/components/AuthGuard', () => ({ default: () => null }))
vi.mock('@/components/CookieBanner', () => ({ default: () => null }))

import { metadata as raiz } from './layout'
import { metadata as dashboard } from './(dashboard)/layout'
import { metadata as admin } from './(admin)/layout'
import { metadata as acessoNegado } from './acesso-negado/layout'
import { metadata as auth } from './auth/layout'
import { metadata as login } from './login/page'

const NAO_INDEXAR = { index: false, follow: false }

describe('indexação das áreas logadas do CRM', () => {
  it.each([
    ['(dashboard): /kanban, /onboarding, /settings', dashboard],
    ['(admin): /tenants', admin],
    ['/acesso-negado', acessoNegado],
    ['/auth', auth],
    ['/login', login],
  ] as [string, Metadata][])('%s pede para não indexar', (_rota, metadados) => {
    expect(metadados.robots).toEqual(NAO_INDEXAR)
  })

  it('a landing page (raiz) continua indexável', () => {
    expect(raiz.robots).toBeUndefined()
  })
})
