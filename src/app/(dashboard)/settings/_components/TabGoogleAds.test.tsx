import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TabGoogleAds from './TabGoogleAds';
import { useTenant } from '@/contexts/TenantContext';
import { AdsConfigService, type AdsConfig } from '@/services/api';

vi.mock('@/contexts/TenantContext', () => ({ useTenant: vi.fn() }));

vi.mock('@/services/api', async (orig) => ({
  ...(await orig()),
  AdsConfigService: { get: vi.fn(), update: vi.fn() },
}));

describe('TabGoogleAds', () => {
  const configConectada: AdsConfig = {
    conectado: true,
    google_ads_customer_id: '123-456-7890',
    ads_conversion_action_id: '111',
    ads_recurring_conversion_action_id: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTenant).mockReturnValue({ activeTenantId: 'tenant-A' } as ReturnType<typeof useTenant>);
    vi.mocked(AdsConfigService.get).mockResolvedValue({ ...configConectada });
  });

  async function renderCarregado() {
    render(<TabGoogleAds />);
    await waitFor(() => {
      expect(screen.getByLabelText('ID da conta')).toHaveValue(configConectada.google_ads_customer_id);
    });
  }

  it('carrega a configuração da empresa ativa e mostra conexão, campos, link e o texto', async () => {
    await renderCarregado();

    expect(AdsConfigService.get).toHaveBeenCalledWith('tenant-A');
    expect(screen.getByRole('heading', { level: 2, name: 'Google Ads' })).toBeInTheDocument();
    expect(screen.getByText('Conectado')).toBeInTheDocument();

    expect(screen.getByLabelText('ID da conta')).toHaveValue('123-456-7890');
    expect(screen.getByLabelText('ID da conta')).toHaveAttribute('placeholder', '000-000-0000');
    expect(screen.getByLabelText('Ação de venda')).toHaveValue('111');
    expect(screen.getByLabelText('Ação de recorrência (opcional)')).toHaveValue('');

    const href = screen.getByRole('link', { name: 'Conectar Google Ads' }).getAttribute('href') ?? '';
    expect(href).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    expect(href).toContain('state=tenant-A');

    for (const frase of [
      'Quando um cliente que chegou por um anúncio do Google compra, a venda registrada aqui é enviada ao Google Ads, com o valor.',
      'Ação de venda: recebe as vendas.',
      'Ação de recorrência (opcional): se preenchida, recebe as compras que vierem depois da primeira de cada cliente (recompra, mensalidade). Em branco, todas as vendas vão para a Ação de venda.',
      'Sem a Ação de venda, nenhuma venda é enviada.',
      'Onde achar o número: no Google Ads, em Metas › Conversões, abra a ação e copie o número que aparece depois de ctId= no endereço. A ação deve ser de importação de conversões de cliques, com janela de 90 dias. Se ela deve orientar os lances, marque-a como principal no próprio Google Ads.',
      'O Google só aceita vendas feitas até 90 dias depois do clique no anúncio. Vendas mais tardias ficam no CRM, mas não são enviadas.',
    ]) {
      // o parágrafo pode ter <strong> no início: compara o texto inteiro dele
      expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === frase)).toBeInTheDocument();
    }
  });

  it('mostra Não conectado quando a conta não está conectada', async () => {
    vi.mocked(AdsConfigService.get).mockResolvedValue({ ...configConectada, conectado: false });
    await renderCarregado();

    expect(screen.getByText('Não conectado')).toBeInTheDocument();
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
  });

  it('avisa a falha de carregamento e não mostra o formulário', async () => {
    vi.mocked(AdsConfigService.get).mockRejectedValue(new Error('falhou'));
    render(<TabGoogleAds />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a configuração do Google Ads. Recarregue a página para tentar de novo.',
    );
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ID da conta')).not.toBeInTheDocument();
  });

  it('valida na tela, foca o primeiro inválido e limpa só o erro do campo digitado', async () => {
    const user = userEvent.setup();
    await renderCarregado();

    await user.clear(screen.getByLabelText('ID da conta'));
    await user.type(screen.getByLabelText('ID da conta'), '123-456-789');
    await user.clear(screen.getByLabelText('Ação de venda'));
    await user.type(screen.getByLabelText('Ação de venda'), '12a');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const conta = screen.getByLabelText('ID da conta');
    const venda = screen.getByLabelText('Ação de venda');

    expect(AdsConfigService.update).not.toHaveBeenCalled();
    expect(conta).toHaveAttribute('aria-invalid', 'true');
    expect(venda).toHaveAttribute('aria-invalid', 'true');
    expect(conta).toHaveAccessibleDescription('Use o formato 000-000-0000.');
    expect(venda).toHaveAccessibleDescription('Use só números (até 20 dígitos).');
    expect(conta).toHaveFocus();

    await user.type(conta, 'x');

    expect(screen.getByLabelText('ID da conta')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Ação de venda')).toHaveAttribute('aria-invalid', 'true');
  });

  it('salva os três valores com trim e confirma', async () => {
    let resolveUpdate!: (valor: AdsConfig) => void;
    const pendente = new Promise<AdsConfig>((resolve) => {
      resolveUpdate = (valor) => resolve(valor);
    });
    vi.mocked(AdsConfigService.update).mockReturnValue(pendente);

    const user = userEvent.setup();
    await renderCarregado();

    await user.clear(screen.getByLabelText('ID da conta'));
    await user.type(screen.getByLabelText('ID da conta'), '999-888-7777');
    await user.clear(screen.getByLabelText('Ação de venda'));
    await user.type(screen.getByLabelText('Ação de venda'), '222');
    await user.clear(screen.getByLabelText('Ação de recorrência (opcional)'));
    await user.type(screen.getByLabelText('Ação de recorrência (opcional)'), ' 333 ');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const salvando = await screen.findByRole('button', { name: 'Salvando…' });
    expect(salvando).toBeDisabled();
    expect(AdsConfigService.update).toHaveBeenCalledTimes(1);
    expect(AdsConfigService.update).toHaveBeenCalledWith('tenant-A', {
      google_ads_customer_id: '999-888-7777',
      ads_conversion_action_id: '222',
      ads_recurring_conversion_action_id: '333',
    });
    expect(Object.keys(vi.mocked(AdsConfigService.update).mock.calls[0]?.[1] ?? {}).sort()).toEqual([
      'ads_conversion_action_id',
      'ads_recurring_conversion_action_id',
      'google_ads_customer_id',
    ]);

    await act(async () => {
      resolveUpdate({
        conectado: true,
        google_ads_customer_id: '999-888-7777',
        ads_conversion_action_id: '222',
        ads_recurring_conversion_action_id: '333',
      });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Configuração salva.');
  });

  it('marca a ação de recorrência quando a API recusa o campo', async () => {
    vi.mocked(AdsConfigService.update).mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'invalid_field', field: 'ads_recurring_conversion_action_id' },
      },
    });

    const user = userEvent.setup();
    await renderCarregado();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Ação de recorrência (opcional)')).toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.getByLabelText('Ação de recorrência (opcional)')).toHaveAccessibleDescription(
      'Use só números (até 20 dígitos).',
    );
    expect(AdsConfigService.update).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra o alerta padrão quando salvar falha', async () => {
    vi.mocked(AdsConfigService.update).mockRejectedValue(new Error('falha de rede'));

    const user = userEvent.setup();
    await renderCarregado();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar a configuração do Google Ads.',
    );
  });

  it('mostra a mensagem de permissão quando a API responde 403', async () => {
    vi.mocked(AdsConfigService.update).mockRejectedValue({
      response: { status: 403, data: { permissao: 'crm.integracoes.gerir' } },
    });

    const user = userEvent.setup();
    await renderCarregado();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para fazer isso nesta empresa.',
    );
  });

  // Achado B8 do Verifier: invalid_field com um campo que a tela não conhece não pode
  // ficar mudo; vira o alerta padrão.
  it('invalid_field com campo desconhecido mostra o alerta padrão', async () => {
    vi.mocked(AdsConfigService.update).mockRejectedValue({
      response: { status: 400, data: { error: 'invalid_field', field: 'outro' } },
    });
    const user = userEvent.setup();
    await renderCarregado();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar a configuração do Google Ads.');
  });
});
