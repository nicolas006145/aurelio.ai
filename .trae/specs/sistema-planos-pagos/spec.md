# Sistema de Planos Pagos do Aurélio - Especificação

## Overview
- **Summary**: Implementação de um sistema completo de planos pagos (Gratuito, Aurélio Fundador, Aurélio Mentor) com controle de limites diários de mensagens, integração com gateway de pagamento (Mercado Pago e/ou Stripe), gerenciamento de assinaturas com renovação mensal e vencimento real, notificações de vencimento dentro da aplicação, e área "Meu plano" no perfil do usuário.
- **Purpose**: Monetizar o produto através de assinaturas recorrentes, garantindo limites de uso controlados por plano, experiência de pagamento segura e transparente, e manutenção da identidade visual existente.
- **Target Users**: Usuários novos (iniciam no Gratuito) e existentes que desejam upgrade para planos pagos com mais recursos.

## Goals
- Controlar limites diários de mensagens por plano (10/80/250) com bloqueio real no backend.
- Processar pagamentos via Pix e cartão de crédito de forma segura (não salvar dados sensíveis).
- Gerenciar ciclo de vida da assinatura: ativa, pagamento pendente, atrasada, cancelada.
- Resetar limites diários automaticamente.
- Cancelar automaticamente após 5 dias de atraso.
- Notificar usuário dentro do app sobre vencimento próximo (5/3/1 dias), atraso e cancelamento.
- Exibir "Meu plano" com status, vencimento e uso diário.
- Mascara parcial de email na área do chat/perfil.
- Não alterar identidade visual/cores/layout geral existente.

## Non-Goals
- Não criar nova identidade visual ou mudar cores/tipografia existentes.
- Não implementar sistema de cupons/descontos customizados nesta fase.
- Não implementar reembolso automático.
- Não implementar múltiplos cartões cadastrados.
- Não implementar fatura em PDF detalhada (apenas comprovante básico via provider).
- Não salvar dados completos de cartão no banco de dados do Aurélio.

## Background & Context
- Projeto existente: backend Python/FastAPI + MongoDB; frontend React com autenticação (email/senha + Google), chat com SSE streaming, TTS (OpenAI), diário, reflexão diária.
- Já existe componente `PricingPlans.jsx` apenas visual (CTA mostra toast "Pagamento em construção").
- Já existe rota `/planos` no frontend (componente `PricingPlans.jsx`), mas ainda não está no App.js Router.
- Hard constraint do projeto: NÃO alterar o visual/UI durante otimizações. Aqui aplica-se: manter cores, fontes, bordas, espaçamentos e estilo existentes; apenas adicionar componentes novos seguindo o mesmo padrão visual.
- Voz do Aurélio deve continuar natural e a persona manter tom maduro/elegante.

## Functional Requirements

**FR-1 — Planos e Limites**
- Três planos: Gratuito (R$ 0/mês, 10 msg/dia), Aurélio Fundador (R$ 7,90/mês, 80 msg/dia), Aurélio Mentor (R$ 19,90/mês, 250 msg/dia).
- Cada usuário tem exatamente um plano ativo no banco.
- Usuários novos (cadastro email ou Google) começam automaticamente no plano Gratuito.
- Benefícios textuais dos planos são exibidos conforme solicitado.

**FR-2 — Controle de Limite Diário**
- Antes de gerar resposta da IA no backend, verificar `messages_used_today` vs `daily_message_limit` do plano.
- Se passou do limite: retornar HTTP 402/429 com mensagem amigável (não quebrar streaming).
- Limite reseta todos os dias (baseado em `usage_date`, timezone BRT UTC-3).
- Contagem vale para chat texto, chat voz e todas as rotas que geram resposta de IA.

**FR-3 — Ciclo de Vida da Assinatura**
- Status: `active`, `pending_payment`, `overdue`, `canceled`.
- Gratuito: sempre `active` sem vencimento.
- Planos pagos:
  - Pix: inicia `pending_payment` após gerar cobrança, vira `active` após confirmação do webhook.
  - Cartão: após aprovação vira `active` imediatamente (ou pending até webhook confirmar).
  - `expires_at` = data início + 30 dias (ou +1 mês baseado no provedor).
  - Quando passa de `expires_at`: vira `overdue`.
  - Depois de 5 dias em `overdue` sem pagamento: vira `canceled` e volta para Gratuito.

**FR-4 — Pagamento e Providers**
- Gateway preferencial: Mercado Pago (BR) e/ou Stripe (internacional), escolhido via env `PAYMENT_PROVIDER` (`mercado_pago` | `stripe`).
- Variáveis de ambiente: `PAYMENT_PROVIDER`, `PAYMENT_ACCESS_TOKEN`, `PAYMENT_WEBHOOK_SECRET`, `FRONTEND_URL`, `BACKEND_URL`.
- Métodos: Pix + Cartão de crédito.
- Não salvar número completo de cartão, CVV, nem dados sensíveis no MongoDB. Apenas tokens/IDs do provider + últimos 4 dígitos + bandeira quando aplicável.
- Endpoints backend:
  - `POST /api/payments/init` — inicia pagamento (plano_id, método, dados do pagador).
  - `POST /api/payments/confirm` — confirmação manual fallback (apenas para Pix pending).
  - `POST /api/payments/webhook` — recebe webhook do provider (assina com segredo).
- Validações antes de enviar pagamento:
  - CPF válido (algoritmo oficial) antes de submeter.
  - CEP validado via API ViaCEP (https://viacep.com.br/ws/{cep}/json/).
  - Se CEP inválido ou inexistente: erro claro e bloqueia continuação.
  - Preenchimento automático de logradouro/bairro/cidade/UF pelo CEP.
  - Campos exigidos: nome completo, CPF, email, CEP, endereço (rua, número, bairro, cidade, UF).

**FR-5 — Notificações e Sininho**
- No frontend, perto do perfil/menu, exibir ícone de sininho com indicador visual quando:
  - Faltam 5 dias para vencer plano pago.
  - Faltam 3 dias.
  - Falta 1 dia.
  - Plano está vencido (overdue).
  - Plano foi cancelado.
- Mensagens amigáveis conforme especificado:
  - Vence em 5d / 3d / 1d.
  - Venceu, regularize.
  - Cancelado após 5 dias sem pagamento.
- Se sistema de email configurado (ex: variáveis SMTP), também enviar email. Se não configurado, não quebrar a aplicação (fallback silencioso para email).

**FR-6 — Área do Usuário e Mascara de Email**
- Na área de chat (sidebar/perfil):
  - Mostrar NOME escolhido pelo usuário como primário.
  - Email parcialmente mascarado: `nick@gmail.com` → `n***@gmail.com`.
  - Sem nome: mostrar email mascarado.
- Área "Meu plano":
  - Plano atual (nome).
  - Status do plano.
  - Vencimento (formatado).
  - Limite diário de mensagens.
  - Mensagens usadas hoje / restantes hoje.
  - Botão para "Ver planos" / "Upgrade" / "Gerenciar plano".

**FR-7 — Rotas Backend**
- `GET /api/subscription` — retorna assinatura atual do usuário + uso diário + notificações de vencimento.
- `POST /api/subscription/cancel` — cancela plano pago manual (opcional do usuário).
- `POST /api/payments/init` — inicia pagamento (ver FR-4).
- `POST /api/payments/confirm` — confirmação manual de pagamento Pix pending.
- `POST /api/payments/webhook` — webhook assinado do provider.
- `GET /api/payments/cep/{cep}` — consulta ViaCEP e retorna dados de endereço (ou erro).
- `POST /api/payments/validate-cpf` — valida CPF e retorna ok/erro.
- Middleware aplicado em rotas de chat para verificar limite diário antes da resposta.
- Rotina (startup + intervalo) para:
  - Resetar `usage_date` + `messages_used_today` quando mudar o dia BRT.
  - Marcar assinaturas expiradas como `overdue`.
  - Marcar assinaturas em overdue há 5 dias como `canceled` e downgrade para Gratuito.

**FR-8 — Frontend**
- Integrar rota `/planos` no App Router (já existe componente `PricingPlans.jsx`, mas falta no App.js e está com CTA fake).
- Substituir toast fake do PricingPlans por fluxo real de pagamento.
- Modal/Fluxo de checkout:
  - Escolher método (Pix / Cartão).
  - Form com dados do pagador (nome, CPF, email, CEP, endereço completo com preencher automático por CEP).
  - Validação CPF + CEP client-side (chamando backend).
  - Para Pix: mostrar QR Code + código PIX copiar-colar + status pending.
  - Para Cartão: usar elemento de pagamento seguro do provider (ex: Mercado Pago Card Form ou Stripe Elements) para tokenizar — não pegar número/cvv via input próprio sem segurança.
- Botão "Escolher plano" em cada card do PricingPlans.
- Mostrar plano atual no Sidebar e no perfil.
- Ícone de notificação/sininho com dropdown mostrando alertas de vencimento/atraso.
- Área "Meu plano": nova tela ou modal acessível via Sidebar/perfil.
- NÃO mudar cores, layout geral, identidade visual. Apenas adicionar componentes seguindo estilo existente (variáveis CSS `--terracotta`, `--bg-main`, `--border`, etc).

**FR-9 — Compatibilidade Retroativa**
- Login Google e login email/senha continuam funcionando sem quebras.
- Conversas existentes não são perdidas.
- Usuários existentes sem plano no banco são automaticamente migrados para plano Gratuito no primeiro login/após subida (garantir na função get_current_user ou startup).

## Non-Functional Requirements
- **NFR-1 (Segurança)**: Dados de cartão NÃO passam pelo backend do Aurélio. Usar elementos seguros do provedor. Webhooks validados por assinatura HMAC do provider.
- **NFR-2 (Idempotência)**: Webhooks e confirmações de pagamento devem ser idempotentes (não ativar plano duas vezes para o mesmo evento).
- **NFR-3 (Performance)**: Middleware de limite diário não adicionar latência perceptível (< 5ms em média, consulta MongoDB indexada).
- **NFR-4 (Confiabilidade)**: Reset diário e verificação de vencimento rodam tanto no startup quanto em intervalo regular (ex: a cada hora) para tolerar reinícios.
- **NFR-5 (Estilo Visual)**: 100% dos novos componentes frontend devem usar as variáveis CSS existentes (`--terracotta`, `--bg-card`, `--border`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-main`, `font-serif-display`, etc.) e seguir padrões de borda (rounded-full, rounded-2xl, rounded-3xl), sombras e tipografia já existentes.
- **NFR-6 (Observabilidade)**: Logging estruturado de eventos de pagamento (sucesso, falha, webhook recebido) sem senhas/dados sensíveis.
- **NFR-7 (Resiliência)**: Se provider de pagamento estiver fora, apresentar erro amigável ao usuário sem quebrar a tela; pagamentos pending são preservados.

## Constraints
- **Técnicas**:
  - Backend: Python 3 + FastAPI + MongoDB (Motor async).
  - Frontend: React (Create React App / Craco) + Tailwind via variáveis CSS existentes + componentes shadcn/ui já instalados.
  - Pagamento: Mercado Pago SDK oficial (`mercadopago`) ou Stripe SDK (`stripe-python`) dependendo de `PAYMENT_PROVIDER`.
  - Abstração mínima: classe/adapter para não acoplar rotas a um provider específico.
- **Negócio**:
  - Gratuito é o plano padrão, incondicional.
  - Upgrade não tem downgrade automático a menos que vencimento + 5 dias.
  - Mensagens usadas no dia não são "estornadas" se o usuário fizer upgrade no mesmo dia (o upgrade aumenta apenas o limite, sem zerar o usado).
- **Dependências**:
  - APIs externas: ViaCEP (CEP), OpenAI (TTS/LLM), Google (OAuth), Mercado Pago ou Stripe (pagamento).

## Assumptions
- O usuário final terá credenciais de produção do Mercado Pago/Stripe; em ambiente de desenvolvimento, usar modo sandbox/teste.
- Para efeito de entrega de código, o backend implementará o adapter pattern com um provider "mock" para testes offline, além do provider real.
- Sistema de email (SMTP) é opcional; aplicação funciona sem ele (apenas notificações in-app).
- Frontend consegue carregar script do Mercado Pago / Stripe.js via CDN dinamicamente (não precisa empacotar no bundle).

## Open Questions
- Nenhuma aberta por enquanto. Implementação segue os requisitos do usuário.

---

## Acceptance Criteria

### AC-1: Usuário novo recebe plano Gratuito automaticamente
- **Type**: `rule`
- **Given**: Usuário faz cadastro via email/senha ou primeiro login Google.
- **When**: Registro/login completo e documento de subscription é criado/recuperado.
- **Then**: subscription do usuário tem `plan_id: free`, `plan_name: Gratuito`, `status: active`, `daily_message_limit: 10`.
- **Pass Condition**: Consultando `GET /api/subscription` logo após o cadastro, retorna exatamente esses valores.
- **Evidence**: Resposta do endpoint e registro no MongoDB `subscriptions`.

### AC-2: Limite diário bloqueia mensagens e reseta no dia seguinte (BRT)
- **Type**: `rule`
- **Given**: Usuário Gratuito já enviou 10 mensagens hoje.
- **When**: Envia 11ª mensagem antes da meia-noite BRT.
- **Then**: Backend retorna erro amigável (sem resposta de IA gerada), `messages_used_today` permanece 10.
- **Pass Condition**: 11ª requisição a chat/voice retorna 402/429; no dia seguinte BRT, `messages_used_today` volta a 0 e nova mensagem é permitida.
- **Evidence**: Resposta HTTP da 11ª tentativa e contagem no banco após meia-noite BRT (simulada via alteração de `usage_date`).

### AC-3: Pix gera cobrança pending e ativa após webhook
- **Type**: `rule`
- **Given**: Usuário escolhe plano Fundador + método Pix e submete dados válidos.
- **When**: `POST /api/payments/init` retorna QR code/copia-e-cola.
- **Then**: subscription fica `pending_payment` com `provider_payment_id` salvo, `payment_method: pix`.
- **Then**: Webhook de pagamento aprovado recebido e validado por assinatura.
- **Then**: subscription muda para `active`, `started_at` e `expires_at` (+30d) são gravados, `last_payment_at` atualizado, `daily_message_limit: 80`.
- **Pass Condition**: Dois estados observáveis: pending antes do webhook, active após webhook com campos corretos.
- **Evidence**: Resposta de /init, payload do webhook, documento subscription final.

### AC-4: Cartão aprovado ativa plano imediatamente
- **Type**: `rule`
- **Given**: Usuário preenche cartão via elemento seguro do provider e cartão é aprovado.
- **When**: Provider retorna payment_id aprovado e backend recebe confirmação (sincrona ou webhook).
- **Then**: subscription vira `active`, `payment_method: credit_card`, `daily_message_limit` correspondente ao plano, `expires_at` em +30d.
- **Then**: Nenhum dado completo de cartão foi salvo no MongoDB (apenas `provider_payment_id`, `provider_subscription_id`, últimos 4 dígitos e bandeira se disponíveis).
- **Pass Condition**: subscription ativa + busca no banco `subscriptions`/`payments` não contém número completo de cartão nem CVV.
- **Evidence**: Documentos do banco e resposta final.

### AC-5: CPF inválido e CEP inválido bloqueiam pagamento com erros claros
- **Type**: `rule`
- **Given**: Usuário tenta iniciar pagamento com CPF "000.000.000-00" ou CEP "00000-000".
- **When**: Chama `/api/payments/validate-cpf` e `/api/payments/cep/00000000`.
- **Then**: CPF retorna erro de validação (campo inválido), CEP retorna 400/404.
- **Then**: `/api/payments/init` com esses dados também falha ANTES de chamar provider.
- **Pass Condition**: Respostas HTTP com mensagens de erro claras em português e nenhuma chamada ao provider de pagamento.
- **Evidence**: Respostas dos endpoints + logs de provider chamadas (vazias).

### AC-6: Assinatura overdue e cancelamento automático após 5 dias
- **Type**: `rule`
- **Given**: Assinatura ativa com `expires_at` no passado e 0 dias de atraso.
- **When**: Rotina de verificação executa.
- **Then**: Status muda para `overdue`.
- **Then**: 5 dias completos de atraso se passam (simulado por data).
- **Then**: Rotina muda status para `canceled`, plano volta para Gratuito com `daily_message_limit: 10`, `canceled_at` gravado.
- **Pass Condition**: Estados: active → overdue → canceled/free com campos corretos.
- **Evidence**: Documentos subscription em cada fase após rodar rotina (startup ou intervalo).

### AC-7: Notificações de vencimento mostram horários corretos
- **Type**: `rule`
- **Given**: Assinatura active com `expires_at` em exatamente 5/3/1 dias.
- **When**: `GET /api/subscription` retorna `notices: [...]`.
- **Then**:
  - 5d antes → notice type `expiring_soon_days` com `days_left: 5`.
  - 3d antes → notice `days_left: 3`.
  - 1d antes → notice `days_left: 1`.
  - Depois de expirar → notice `overdue`.
  - Cancelado → notice `canceled`.
- **Pass Condition**: Cada cenário data-driven retorna notice correto.
- **Evidence**: Resposta JSON de /subscription com notices e dados simulados.

### AC-8: Email mascarado no perfil/chat
- **Type**: `rule`
- **Given**: Usuário com email `nick@gmail.com` e nome "Nick".
- **When**: Renderiza Sidebar/Perfil/Meu plano.
- **Then**: Nome "Nick" é mostrado como primário; email quando exibido é `n***@gmail.com`.
- **Then**: Usuário SEM nome, email mascarado é exibido como principal.
- **Pass Condition**: Strings exibidas batem com a regra `first_char***@domain`.
- **Evidence**: DOM renderizado ou função utilitária de mascara com testes.

### AC-9: Frontend mantém identidade visual existente
- **Type**: `rubric`
- **Dimension**: Fidelidade ao estilo visual existente do Aurélio.
- **Scale**: 1-5
- **Anchors**:
  - 1 = novas telas/componentes usam cores, fontes, espaçamentos ou bordas diferentes do padrão.
  - 3 = maioria dos componentes segue o padrão, mas alguns detalhes divergem.
  - 5 = 100% dos novos componentes usam exatamente as variáveis CSS, classes Tailwind e padrões de UI (border radius, sombras, tipografia serif-display) dos componentes existentes.
- **Pass Threshold**: >= 4
- **Evidence**: Inspecionar classes CSS de PricingPlans, Sidebar (atual) vs novas telas MeuPlano, CheckoutModal, NotificationBell.

### AC-10: Login Google e conversas existentes não quebram
- **Type**: `rule`
- **Given**: Usuário existente com conversas salvas e login Google funcional.
- **When**: Faz login Google e abre conversa antiga.
- **Then**: Login funciona, subscription é criada como Gratuito se não existia, conversas aparecem normalmente, envio de mensagem respeita limite de 10/dia.
- **Pass Condition**: Nenhum erro 500, nenhuma perda de conversa, login com Google retorna 200 com token.
- **Evidence**: Resposta de `/auth/google`, lista de `/conversations`, mensagem enviada com sucesso.

### AC-11: Variáveis de ambiente atualizadas no .env.example
- **Type**: `rule`
- **Given**: Arquivos `backend/.env.example` e `frontend/.env.example`.
- **When**: Abertos.
- **Then**: backend contém: `PAYMENT_PROVIDER`, `PAYMENT_ACCESS_TOKEN`, `PAYMENT_WEBHOOK_SECRET`, `FRONTEND_URL`, `BACKEND_URL`.
- **Then**: frontend contém `REACT_APP_BACKEND_URL`, `REACT_APP_PAYMENT_PROVIDER_PUBLIC_KEY` (ou equivalente para public key do MP/Stripe) se necessário, `REACT_APP_FRONTEND_URL`.
- **Pass Condition**: Strings exatas estão presentes nos arquivos.
- **Evidence**: Conteúdo dos dois `.env.example`.

### AC-12: Webhook de pagamento valida assinatura e é idempotente
- **Type**: `rule`
- **Given**: Webhook enviado 2 vezes pelo provider com mesmo `x-signature` e `payment_id`.
- **When**: `POST /api/payments/webhook` recebe ambos.
- **Then**: Primeiro: valida assinatura (usa `PAYMENT_WEBHOOK_SECRET`), processa, ativa plano.
- **Then**: Segundo: mesma assinatura/payment_id → retorna 200 mas NÃO repete processamento (plano continua active sem alterar datas).
- **Then**: Webhook com assinatura errada retorna 401 e NÃO altera nada.
- **Pass Condition**: Ativa uma vez, rejeita assinatura errada.
- **Evidence**: Respostas HTTP e estado subscription final.

### AC-13: Área "Meu plano" exibe status, vencimento e uso hoje
- **Type**: `rule`
- **Given**: Usuário no plano Fundador ativo, com 25/80 mensagens usadas hoje e vencimento daqui 12 dias.
- **When**: Acessa "Meu plano".
- **Then**: Mostra: plano = Aurélio Fundador, status = active, vencimento formatado dd/mm/aaaa, limite diário 80, usadas hoje 25, restantes 55.
- **Then**: Gratuito mostra: sem vencimento (ou "Sempre ativo"), limite 10, usadas/restantes hoje.
- **Pass Condition**: Valores numéricos e datas corretamente formatados.
- **Evidence**: DOM renderizado ou snapshot.
