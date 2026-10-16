
## 📚 Documentação Oficial (Arquitetura e TDDs)

**Nota Importante:** A documentação técnica detalhada, as regras de IA (Harness), os Technical Design Documents (TDDs) e o log de estado contínuo deste projeto **não ficam armazenados neste repositório**. 

Para obter o contexto arquitetural completo e consultar o *Single Source of Truth* do ecossistema, acesse o repositório centralizado de documentação:
👉 **[unum-people-docs](https://github.com/unum-people-creative-solutions/unum-people-docs.git)**

# unum-people-services-web

Frontend único em Next.js focado em performance de vendas e atribuição de anúncios.

## 1. Funcionalidades de CRM
- **Kanban Estratégico:** Gestão visual de leads com scroll independente por coluna, cabeçalhos fixos e filtros avançados por período e status.
- **Ciclo de Vida do Cliente:**
    - **Nova Venda:** Registro de transações com suporte a **data retroativa da venda** para precisão no faturamento histórico.
    - **LTV (Lifetime Value):** Exibição do faturamento total acumulado do cliente diretamente no card.
    - **Histórico de Vendas:** Modal de edição com lista detalhada e cronológica de todas as transações passadas.
- **Faturamento Dinâmico:** Filtro por Mês/Ano que soma as vendas com data no mês selecionado (`GET /leads?view=sales&month=`), qualquer que seja o status atual do lead. A data da venda é um dia de calendário; se a busca falhar, o cabeçalho mostra "Indisponível".
- **Exportação de Relatórios:** Botão dedicado para gerar relatórios comerciais em formato **Excel (.xlsx)**, com as mesmas vendas do Faturamento, em abas de resumo e vendas detalhadas.

## 2. Integrações & Marketing
- **Google Ads OAuth:** Integração nativa para autorização de acesso a contas MCC ou contas de clientes, permitindo captura de leads e automação de conversões.
- **Atribuição de Leads:** Fluxo otimizado para vincular dados de tráfego pago diretamente ao funil de vendas.

## 3. Autenticação (Cognito Hosted UI / SSO)
Não existe mais tela de login/esqueci-senha/primeiro-acesso própria do app — `AuthGuard` redireciona (`window.location.href`, PKCE) para o domínio Hosted UI (`auth.unumpeople.com.br`, App Client dedicado do CRM, provisionado em `Infraestrutura/unum-people-services-infra`). Fluxo:
- Sem sessão válida (ou expirada) → `redirectToHostedUI` (`src/lib/pkce.ts`) gera `code_verifier`/`code_challenge` (CSPRNG + SHA-256), persiste o verifier em `sessionStorage` (uso único) e monta a URL de `/oauth2/authorize`.
- `src/app/auth/callback/page.tsx` troca `code`+`code_verifier` por tokens (`/oauth2/token`), decodifica os mesmos claims do fluxo antigo (`custom:tenant_id`, `cognito:groups`), preserva a lógica de resolução de tenant/onboarding/papel (GlobalAdmin → `/tenants`, demais → `/kanban` ou plano incompatível), e redireciona pra rota originalmente pretendida.
- Logout explícito ("Sair", exclusão de conta) usa `logoutFromHostedUI()` (endpoint `/oauth2/logout` do Cognito — encerra a sessão SSO de verdade); reautenticação silenciosa (401 da API, `AuthGuard` sem sessão, `onboarding`) usa `redirectToHostedUI` (reaproveita a sessão SSO ainda válida, sem pedir credenciais de novo).
- **Variáveis de ambiente necessárias:** `NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN`, `NEXT_PUBLIC_COGNITO_CRM_CLIENT_ID` (só existem depois do `terraform apply` do repo de infra gerar o domínio/client ID reais).
- **Conformidade LGPD:** o checkbox de aceite de Termos de Uso/Privacidade que existia na tela de primeiro acesso (`NEW_PASSWORD_REQUIRED`) foi removido — esse fluxo agora é tratado nativamente pelo Hosted UI; o vínculo de aceite por usuário passa a ser gerenciado pelo Portal do Cliente (`TermAcceptance` — ver `unum-people-services-api`).
- **Termos Pendentes (PendingTermsGate):** fluxo que substitui as telas e gates locais antigos (`ServiceAgreementGate`, `ServiceAgreementWaiting`, `TermsModal`). O componente `PendingTermsGate` consulta a API (`GET /me/terms/status`) para verificar pendências. Havendo termos pendentes acionáveis, o usuário é redirecionado para o Portal do Cliente (`customer.unumpeople.com.br`) para realizar o aceite.
- **Fora do Google:** só a landing page (`/`) é indexável. As rotas que exigem login exportam `naoIndexar` (`src/lib/seo.ts`, `noindex, nofollow`) e estão bloqueadas no `robots.txt` (`src/app/robots.ts`), porque o redirecionamento para o Cognito levava o Google a indexar a página vazia de `auth.unumpeople.com.br`. **Rota nova que exige login entra nos dois lugares:** metadados do segmento e `disallow` do `robots.ts`.

## 4. Gestão Administrativa & Segurança
- **API Key Management**: Visualização e cópia da chave de integração programática diretamente na lista de gestão de Tenants.
- **Notificações Push**: Botão para ativar/desativar notificações push por inquilino diretamente na lista administrativa.
- **Dashboard Global**: Visualização de todos os inquilinos e seus respectivos faturamentos (Apenas para GlobalAdmin).
- **Convite de Usuários:** Fluxo para adicionar novos membros a uma conta ou vincular usuários existentes a novos tenants.

## 5. User Experience (UX)
- **Mobile First & PWA Ready:** Interface otimizada com **Menu Principal Expansível** e Navegação Full-Screen via gestos (Framer Motion).
- **Consistência Visual:** Implementação da nova identidade visual Unum People e bloqueio de scroll inteligente em menus mobile.
- **Máscaras Monetárias:** Inputs formatados em tempo real seguindo o padrão brasileiro (R$ 0,00).
- **Normalização de Dados:** E-mails são convertidos automaticamente para minúsculas para evitar erros de login e duplicidade.
- **Multi-Account:** Seletor de conta inteligente que permite trocar de inquilino instantaneamente sem precisar deslogar.

## 7. Progressive Web App (PWA) & Play Store (TWA)
O projeto está configurado como um PWA de alta performance, pronto para ser empacotado para a Google Play Store usando Trusted Web Activity (TWA).

### Configurações Atuais
- **Offline Support:** Service Worker configurado via `next-pwa`.
- **Manifest:** Localizado em `public/manifest.json`. Contém definições de cores (`#3D5D97`) e ícones maskable.
- **Ícones maskable:** `public/icons/icon-maskable-{512,192}.png` são gerados por `node scripts/generate-maskable-icons.mjs` (logo `public/images/logo_simbolo.webp` na zona segura, fundo branco). `src/app/pwa-icons.test.ts` garante que o launcher não corta o logo.
- **TWA Validation:** Digital Asset Links em `public/.well-known/assetlinks.json`. Precisa conter o SHA-256 da **chave de assinatura do app** do Google Play (`75:E8:60:…:F6:A5`, a mesma de `android/twa-manifest.json` → `fingerprints`); sem ela o app abre com barra de endereço.

### App Android (Bubblewrap)
- **Pacote:** `br.com.unumpeople.crm`, em teste fechado no Play Console. Só `android/twa-manifest.json` é versionado (o resto de `android/` está no `.gitignore`; para commitar o manifest, `git add -u android/twa-manifest.json`).
- **Versões:** Bubblewrap CLI 1.27.0 → `targetSdk` 36 (exigência do Play desde 31/08/2026) e `minSdkVersion` 24 (exigido pelo `androidbrowserhelper` 2.7.4).
- **Chaves:** o AAB é assinado com a **chave de upload** `android/unum-key.keystore` (alias `unum-alias`, SHA-256 `04:03:F2:…:58:B7`). Ela só existe localmente: **guarde uma cópia e a senha num cofre.** Se perdê-la, peça a redefinição da chave de upload no Play Console ("Protegido com o Google Play"); a chave de assinatura do app fica com o Google e não muda.

### Ciclo de Release Android
1. **Ícones em produção primeiro:** o Bubblewrap baixa `iconUrl`/`maskableIconUrl` de `crm.unumpeople.com.br`. Ícone novo = deploy do site antes do passo 3.
2. **Versão:** subir `appVersionCode`, `appVersionName` e `appVersion` em `android/twa-manifest.json`.
3. **Projeto:** `cd android && bubblewrap update --skipVersionUpgrade --manifest=./twa-manifest.json`.
4. **Build:** `cd android && bubblewrap build` (pede as senhas da keystore). Gera `app-release-bundle.aab` (upload no Play Console) e `app-release-signed.apk` (teste manual).
5. **Check antes do upload:** `node scripts/check-android-release.mjs android/app-release-bundle.aab <versionCode>`. Só sai com código 0 se o pacote, o `targetSdk` ≥ 36, o `versionCode` e a chave de upload estiverem certos (usa `~/.bubblewrap/bundletool.jar` ou `BUNDLETOOL_JAR`).

## 8. Tecnologias
- **Next.js 14/15** (App Router).
- **Tailwind CSS** para design responsivo.
- **Framer Motion** para animações e interações mobile.
- **Zustand** para persistência de sessão e estado global.
- **next-pwa** para suporte PWA.
- **Bubblewrap CLI** para geração do TWA Android.

## 9. Testes
O projeto utiliza **Vitest** e **React Testing Library** para garantir a qualidade e integridade das regras de negócio.
- **Execução:** `npm test`
- **Padrões:** Foco em acessibilidade (queries por Role/Label) e simulação real de comportamento do usuário via `@testing-library/user-event`.
- **Cobertura Crítica:** Componentes de segurança (`AuthGuard`, `src/lib/pkce.ts`, `auth/callback`), fluxos de LGPD e lógica de estado global (Zustand).
