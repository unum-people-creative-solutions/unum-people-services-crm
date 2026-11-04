# Baseline Frontend Specification - unum-people-services-crm

**Data:** 2026-05-19
**Versão:** 1.1.0
**Status:** Baseline (Current State)

Este documento descreve o estado atual do frontend da Unum People, servindo como base para o workflow `tlc-spec-driven`.

---

## 1. Visão Geral
O `unum-people-services-crm` é um Painel Administrativo e CRM multi-tenant construído em Next.js. Ele é projetado como um PWA (Progressive Web App) e distribuído via TWA (Trusted Web Activity) para dispositivos Android.

- **Objetivo:** Interface para gestão de leads (Kanban), configuração de faturamento, integração com Google Ads e administração global do SaaS.
- **Público:** Inquilinos (clientes) e Administradores Globais da Unum.

## 2. Arquitetura & Stack Tecnológica
- **Framework:** Next.js 14.2.3 (App Router).
- **Linguagem:** TypeScript.
- **Estilização:** Tailwind CSS + Framer Motion (animações).
- **Estado Global:** Zustand (com persistência local via `persist` middleware).
- **Gestão de Formulários:** React Hook Form + Zod (validação).
- **Comunicação API:** Axios (Interceptors para injeção de JWT e tratamento de 401).
- **Autenticação:** Amazon Cognito Identity JS (integração direta via SDK JS).
- **PWA:** `next-pwa` para Service Worker e suporte offline.
- **Android:** Bubblewrap CLI para empacotamento TWA.

---

## 3. Estrutura de Pastas (src/)
- **app/**: Rotas e layouts (App Router).
    - `(admin)`: Rotas protegidas para GlobalAdmin.
    - `(auth)`: Login, Cadastro e Recuperação de Senha.
    - `(dashboard)`: Kanban e CRM do inquilino.
    - `settings`: Configurações de conta e Google Ads.
- **components/**: Componentes reutilizáveis.
    - `ui/`: Primitivos de UI (Botões, Inputs, Modais).
    - `AuthGuard.tsx`: Componente de proteção de rotas.
    - `Navbar.tsx`: Navegação principal responsiva.
- **hooks/**: Hooks customizados (ex: `usePushNotifications`).
- **services/**: Camada de comunicação com o Backend (`api.ts`, `notificationService.ts`).
- **store/**: Definições de estado global com Zustand (`authStore.ts`).
- **test/**: Configurações de ambiente de teste.
- **worker/**: Service Worker customizado para Web Push.

---

## 4. Funcionalidades Principais

### 4.1. Kanban de Leads
- Colunas fixas com scroll independente.
- Filtros por Status, Período (Mês/Ano) e Tenant.
- Sincronização otimista na movimentação de cards.
- Cadastro de vendas com suporte a datas retroativas.

### 4.2. Gestão Multi-tenant
- Seletor de conta para usuários vinculados a múltiplos tenants.
- Isolamento visual e funcional garantido pelo `tenant_id` na URL e no State.

### 4.3. Painel Administrativo (GlobalAdmin)
- Listagem e criação de novos Tenants.
- Gestão de API Keys.
- Ativação/Desativação de Notificações Push por inquilino.
- Visualização de faturamento global.

### 4.4. Integração Google Ads
- Fluxo OAuth2 completo (`/auth/google-ads/callback`).
- Suporte a contas MCC ou individuais.

### 4.5. Notificações Push
- Registro de dispositivo via Web Push API.
- Gerenciamento de permissões e envio de tokens para o backend.

### 4.6. Configurações & LGPD (Settings)
- **Informações do Negócio:** Edição de dados do Tenant.
- **Integração Ads:** Status da conexão e botão para reconectar.
- **Preferências de Notificação:** Toggle para ativar/desativar Push no dispositivo atual.
- **Conformidade LGPD:**
    - **Exportação de Dados:** Download de arquivo JSON com todos os dados vinculados ao usuário/tenant.
    - **Exclusão de Conta:** Fluxo com modal de confirmação em duas etapas para solicitação de remoção definitiva de dados.

---

## 5. UI & UX (User Experience)
- **Identidade Visual:** Brand Blue (`#3D5D97`) e Brand Dark (`#44516F`).
- **Mobile First:** Navegação otimizada para toque, menus expansíveis e gestos.
- **Acessibilidade:** Uso de ARIA roles e navegação via teclado nos componentes críticos.
- **Feedback:** Máscaras monetárias em tempo real e estados de loading consistentes.

---

## 6. PWA & Android (TWA)
- **Manifest:** Localizado em `public/manifest.json`.
- **Integridade:** `assetlinks.json` para validação de domínio no Android.
- **Build Android:** Bubblewrap CLI gera arquivos `.aab` e `.apk` assinados.
- **Keystore:** `unum-key.keystore` para assinatura na Play Store.

---

## 7. Protocolos de Desenvolvimento (AGENTS.md)
1. **TDD:** Testes com Vitest e RTL. Foco em `getByRole` e comportamento do usuário.
2. **Bibliotecas:** Preferir Radix UI / Framer Motion sobre implementações manuais.
3. **Build & Lint:** Obrigatórios antes do commit.
4. **Versionamento:** Incrementar `package.json` em cada entrega significativa.

---

## 8. Variáveis de Ambiente
- `NEXT_PUBLIC_API_GATEWAY_URL`: URL base do Backend.
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`: ID do User Pool.
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`: Client ID do Cognito.
