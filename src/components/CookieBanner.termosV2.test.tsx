import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import CookieBanner from './CookieBanner';

// termos-crm-v2: o banner diz só o que o navegador guarda e aponta para a v2 da política.
describe('CookieBanner — Política de Privacidade v2', () => {
  beforeEach(() => window.localStorage.clear());

  it('aponta para a v2 da política', () => {
    render(<CookieBanner />);
    expect(screen.getByRole('link', { name: /Política de Privacidade/i })).toHaveAttribute(
      'href',
      'https://unumpeople.com.br/termos/5558327c-6ee1-4549-8e1b-dc03fdae516a/v2',
    );
  });

  it('diz o que guarda, sem prometer análise de tráfego nem personalização', () => {
    const { container } = render(<CookieBanner />);
    const texto = container.textContent ?? '';
    expect(texto).toMatch(/Guardamos no navegador só o necessário para manter seu login e lembrar esta escolha/);
    expect(texto).toMatch(/Não usamos cookies de análise de tráfego nem de publicidade/);
    expect(texto).not.toMatch(/analisar o tráfego|personalizar conteúdos/);
  });
});
