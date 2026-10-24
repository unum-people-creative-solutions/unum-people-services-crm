import { render } from '@testing-library/react'
import RootLayout, { metadata } from './layout'
import { vi, describe, it, expect } from 'vitest'

// Mock de next/font/google
vi.mock('next/font/google', () => ({
  Poppins: () => ({
    variable: '--font-poppins-mock',
    className: 'poppins-mock-class',
  }),
}))

// Precisamos mockar os componentes filhos para renderizar
vi.mock('@/components/AuthGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-guard">{children}</div>,
}))

vi.mock('@/components/CookieBanner', () => ({
  default: () => <div data-testid="cookie-banner" />,
}))

describe('RootLayout', () => {
  it('should apply the Poppins font and correct UI tokens to the body', () => {
    const { container } = render(
      <RootLayout>
        <div>Test Content</div>
      </RootLayout>
    )

    // A raiz do render no React Testing Library é a tag pai fornecida,
    // mas o layout inclui html e body. Container aqui é a div wrapping o body (no rtl).
    // Para checar a classe do body, pegamos o elemento body do container.
    const body = container.querySelector('body')
    expect(body).not.toBeNull()

    // QA (RED): Esperamos que o body possua a classe da fonte Poppins e background branco,
    // e remova o background cinza se houver (mas focaremos na fonte principal).
    // Vamos esperar que o body tenha a classe da variável de fonte que o mock retorna.
    expect(body).toHaveClass('--font-poppins-mock')
    
    // Testamos a fonte base sans (depende do tailwind, mas garantimos que há font-sans e antialiased)
    expect(body).toHaveClass('font-sans')
    expect(body).toHaveClass('antialiased')
    
    // Verificamos que o background de fundo agora é Absolute White para sobriedade
    expect(body).toHaveClass('bg-white')
  })
})

// campanha-pagina T08 / RF-C07: a descrição diz o que o CRM faz, sem "tráfego".
describe('metadados do CRM', () => {
  it('título igual e descrição do blueprint', () => {
    expect(metadata.title).toBe('CRM | Unum People')
    expect(metadata.description).toBe(
      'Receba os contatos da sua página, acompanhe cada um até virar cliente e seja avisado no celular.',
    )
  })
})
