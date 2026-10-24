import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import LandingPage from './page';
import { redirectToHostedUI } from '@/lib/pkce';

vi.mock('@/lib/pkce', () => ({
  redirectToHostedUI: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} />,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const PLANOS = 'https://unumpeople.app/#planos';

// campanha-pagina T06: textos do DESIGN-BLUEPRINT-crm-home §4, como literais.
const CARTOES = [
  ['Contato direto da página', 'Quem preenche o formulário da sua página aparece em Novos Leads, sem você copiar nada.'],
  ['Aviso no celular', 'O CRM avisa quando chega contato. No iPhone, o aviso só funciona com o CRM adicionado à tela de início.'],
  [
    'Cada pessoa na sua etapa',
    'Arraste o contato entre Novos Leads, Em Atendimento, Agendados e Ganho e saiba quem está esperando resposta.',
  ],
  ['WhatsApp com um toque', 'Abra a conversa com o contato direto do cartão dele, sem salvar o número.'],
  [
    'Vendas de cada cliente',
    'Registre cada venda e veja quanto cada cliente já comprou. Baixe tudo numa planilha quando precisar.',
  ],
  ['Também quem chegou por fora', 'Cadastre você mesmo quem veio por indicação ou telefone.'],
] as const;

const PROIBIDAS = [
  'android',
  'google ads',
  'play store',
  'ltv',
  'dashboard',
  'automatiz',
  'lgpd',
  'vanguardista',
  'princípios norteadores',
  'marketing de performance',
  'conversão',
];

describe('Home pública do CRM (campanha-pagina T06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('hero: rótulo, h1 e apoio do blueprint', () => {
    render(<LandingPage />);

    expect(screen.getByText('CRM da Unum People')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cada contato da sua página, num lugar só.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quem preenche o formulário da sua página entra direto no CRM, e o seu celular avisa na hora. Você acompanha cada pessoa até virar cliente.',
      ),
    ).toBeInTheDocument();
  });

  it('os h2 vêm na ordem do blueprint', () => {
    render(<LandingPage />);

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'O que você faz no CRM',
      'Ainda não usa o CRM?',
    ]);
  });

  it('seis cartões, na ordem, cada título seguido do seu texto', () => {
    render(<LandingPage />);

    const titulos = screen.getAllByRole('heading', { level: 3 });
    expect(titulos.map((h) => h.textContent)).toEqual(CARTOES.map(([titulo]) => titulo));
    // Cada texto pertence ao cartão do seu título: vem logo depois do h3.
    titulos.forEach((h3, indice) => expect(h3.nextElementSibling?.textContent).toBe(CARTOES[indice][1]));
  });

  it('os quatro botões "Entrar" (topo, hero, fechamento, rodapé) levam ao login', () => {
    render(<LandingPage />);

    const botoes = screen.getAllByRole('button', { name: 'Entrar' });
    expect(botoes).toHaveLength(4);
    botoes.forEach((botao) => fireEvent.click(botao));
    expect(redirectToHostedUI).toHaveBeenCalledTimes(4);
    expect(vi.mocked(redirectToHostedUI).mock.calls.every(([destino]) => destino === '/')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Acessar Painel' })).not.toBeInTheDocument();
  });

  it('quem ainda não é cliente vai aos planos do configurador, por dois links', () => {
    render(<LandingPage />);

    expect(screen.getByRole('link', { name: 'Ainda não é cliente? Conheça os planos' })).toHaveAttribute('href', PLANOS);
    expect(screen.getByRole('link', { name: 'Conhecer os planos' })).toHaveAttribute('href', PLANOS);
  });

  it('o fechamento explica que o CRM vem num plano com página e blog', () => {
    render(<LandingPage />);

    expect(
      screen.getByText(
        'Ele vem junto com a página e o blog, num dos planos da Unum People. Você monta a página e vê como fica antes de pagar.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Já é cliente?')).toBeInTheDocument();
  });

  it('rodapé: frase, termos de uso na v2 e privacidade na página vigente, em nova aba', () => {
    render(<LandingPage />);

    const rodape = screen.getByRole('contentinfo');
    expect(within(rodape).getByText('O caminho mais curto entre você e o seu cliente.')).toBeInTheDocument();
    const termos = within(rodape).getByRole('link', { name: 'Termos de uso' });
    expect(termos).toHaveAttribute('href', 'https://unumpeople.com.br/termos/9824049f-1b1b-4391-b271-53230c69f9b9/v2');
    const privacidade = within(rodape).getByRole('link', { name: 'Privacidade' });
    expect(privacidade).toHaveAttribute('href', 'https://unumpeople.com.br/privacidade');
    for (const link of [termos, privacidade]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('não promete o que o produto não faz (lista proibida)', () => {
    const { container } = render(<LandingPage />);

    // Texto e atributos (alt, aria-label, title): nada promete o que não existe.
    const texto = `${container.textContent ?? ''} ${container.innerHTML}`.toLowerCase();
    for (const expressao of PROIBIDAS) expect(texto).not.toContain(expressao);
  });
});
