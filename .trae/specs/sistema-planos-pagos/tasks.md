# Sistema de Planos Pagos - Plano de Implementação

## Task 1: Atualizar .env.example e variáveis de ambiente
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Incluir em `backend/.env.example`: `PAYMENT_PROVIDER`, `PAYMENT_ACCESS_TOKEN`, `PAYMENT_WEBHOOK_SECRET`, `FRONTEND_URL`, `BACKEND_URL`, opcionais SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`).
  - Incluir em `frontend/.env.example`: `REACT_APP_BACKEND_URL`, `REACT_APP_PAYMENT_PUBLIC_KEY` (chave pública do Mercado Pago / publishable key do Stripe, se houver), `REACT_APP_PAYMENT_PROVIDER` (espelho para frontend usar o provider correto em elementos seguros), `REACT_APP_FRONTEND_URL`.
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-1.1: Ambos arquivos `.env.example` contêm todas as variáveis listadas acima (verificar grep).
- **Notes**: Não criar arquivo `.env` real, apenas o exemplo.

---

## Task 2: Camada de domínio de planos e subscriptions (backend)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Em `server.py` (ou em módulos separados novos se necessário, mas mantendo server.py como ponto único por enquanto por simplicidade e convenções do projeto), definir:
    - Constante `PLANS` com os 3 planos (id, name, price_monthly, daily_message_limit, features, tier_order).
    - Função `get_plan(plan_id) -> dict`.
    - Função `get_free_plan() -> dict`.
    - Definir collection `subscriptions` e `payments`.
    - Schema em memória Pydantic opcional (recomendado) `SubscriptionCreate`, `PaymentInitInput`, etc.
    - Função `get_or_create_subscription(user_id) -> dict` que cria Gratuito se não existir (migração retroativa).
    - Função `mask_email(email) -> str` (ex: `nick@gmail.com` → `n***@gmail.com`).
    - Função `validate_cpf(cpf: str) -> bool` com algoritmo oficial.
    - Função `lookup_cep(cep: str) -> Optional[dict]` chamando viacep.com.br usando `_httpx_client` singleton já existente.
    - Função `compute_subscription_notices(sub: dict) -> list[dict]` que calcula notices de 5/3/1 dias, overdue e canceled.
    - Função `get_today_usage(user_id: str) -> tuple[int, int, str]` -> (used_today, limit, usage_date_brt).
- **Acceptance Criteria Addressed**: AC-1, AC-5, AC-7, AC-8, FR-2, FR-3, FR-4, FR-7
- **Test Requirements**:
  - `rule` TR-2.1: `mask_email("nick@gmail.com")` retorna `"n***@gmail.com"`; `mask_email("a@b.co")` retorna `"a***@b.co"`.
  - `rule` TR-2.2: `validate_cpf` retorna True para CPF de exemplo válido, False para `"00000000000"` e `"11111111111"`.
  - `rule` TR-2.3: `get_or_create_subscription` para user_id novo cria doc Gratuito (id free, limit 10, status active).
  - `rubric` TR-2.4: Coerência e clareza das funções auxiliares; escala 1-5, 1=código confuso, 3=funciona mas inconsistente, 5=limpo e seguindo estilo do server.py. Threshold >= 4.
- **Notes**: Validar CPF no backend e frontend. Lookup CEP: sanitizar cep (remover "-" e ".") antes de chamar viacep.

---

## Task 3: Camada de adaptação para gateway de pagamento
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Criar classe abstrata `PaymentProvider` com métodos: `init_payment(payload)`, `verify_webhook(request)`, `confirm_pending(payment_id)` (opcional para Pix).
  - Implementar `MercadoPagoProvider` (usar SDK `mercadopago` se disponível no `requirements.txt`, senão httpx puro) e `StripeProvider` (SDK `stripe`).
  - Implementar `MockProvider` para ambiente de desenvolvimento sem credenciais (sempre retorna pending/approved simulado).
  - Factory `get_payment_provider() -> PaymentProvider` baseado em `os.environ["PAYMENT_PROVIDER"]` com fallback para Mock se variável vazia/desconhecida + warning em log.
  - Tratar métodos pix e credit_card em cada provider.
  - Mapear eventos comuns: pagamento aprovado, rejeitado, recorrência renovada.
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-12, NFR-1, NFR-2
- **Test Requirements**:
  - `rule` TR-3.1: `MockProvider.init_payment` com método pix retorna `{qr_code, qr_code_base64, copy_paste, provider_payment_id, status: pending_payment}`.
  - `rule` TR-3.2: `MockProvider.init_payment` com cartão aprovado retorna `{status: approved, provider_payment_id}`.
  - `rule` TR-3.3: `verify_webhook` rejeita assinatura inválida (quando provider suporta) e aceita válida.
  - `rubric` TR-3.4: Desacoplamento da camada (rotas não sabem qual provider está rodando). Escala 1-5, threshold >= 4.
- **Notes**: Atualizar `backend/requirements.txt` com `mercadopago>=2` e `stripe>=8` (pip install opcionais via requirements; se preferir manter puro httpx, ok também com nota). A convenção do projeto é usar singleton httpx; se SDK for mais simples, use SDK com cuidado.

---

## Task 4: Middleware de limite diário + contagem de mensagens + rotinas de ciclo
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Criar função `consume_daily_message(user_id: str) -> bool` que:
    - Garante `usage_date == hoje_brt` (reset se não for).
    - Incrementa `messages_used_today` com atomicidade MongoDB (`$inc` + `$setOnInsert`).
    - Retorna True se ainda não passou do limite, False caso contrário.
    - Não contar mensagens que não passarem na resposta (ex: antes de spawn_reply checar).
  - Criar dependência injetável `check_plan_limit` que roda ANTES de start_turn em chat, voice, etc.
  - Modificar rotas `/conversations/{id}/chat`, `/conversations/{id}/chat/start`, `/conversations/{id}/voice` para usar dependência e retornar 402 com mensagem amigável: "Você atingiu o limite diário de mensagens do seu plano. Volte amanhã ou considere assinar um plano com mais capacidade."
  - Criar função `run_subscription_maintenance()` para rodar no startup e em intervalo (a cada 1 hora via asyncio Task):
    - Atualiza planos com `status=active` e `expires_at` passado para `overdue`.
    - Atualiza planos com `status=overdue` há 5 dias para `canceled` + downgrade para doc free (não precisa remover subscription original — marcar como canceled e criar novo Gratuito OU substituir o plano corrente para Gratuito com novo started_at). Escolher opção mais simples: manter um único subscription por usuário e trocar seus campos para refletir downgrade.
  - Reset diário: feito em `consume_daily_message` on-demand, mas também em maintenance para garantir consistência.
- **Acceptance Criteria Addressed**: AC-2, AC-6, FR-2, FR-3, FR-7, NFR-4
- **Test Requirements**:
  - `rule` TR-4.1: Após 10 `consume_daily_message` em um dia BRT para usuário free, 11ª chamada retorna False e não incrementa count.
  - `rule` TR-4.2: Altera `usage_date` para ontem BRT manualmente no banco → próxima chamada reseta used para 0 e permite nova contagem.
  - `rule` TR-4.3: `run_subscription_maintenance()` com subscription active e `expires_at` 6 dias atrás → status muda para canceled e plano volta para free com limit 10.
- **Notes**: Manter logs claros de cada manutenção (quantas overdue marcadas, quantas canceladas).

---

## Task 5: Rotas backend de subscription, pagamento, CEP e CPF
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3, Task 4
- **Description**:
  - `GET /api/subscription` — retorna plano atual + notices + uso hoje (used_today, limit, remaining_today) + dados de pagamento (vencimento, status, método).
  - `POST /api/subscription/cancel` — cancela plano pago manual (marca canceled e volta para free).
  - `GET /api/plans` — lista os 3 planos para frontend exibir.
  - `GET /api/payments/cep/{cep}` — retorna dados de endereço via viacep ou 400/404.
  - `POST /api/payments/validate-cpf` — body `{cpf}` retorna `{valid: bool, message?: str}`.
  - `POST /api/payments/init` — body: `{plan_id, payment_method, payer: {name, cpf, email, cep, street, number, neighborhood, city, state, complement?}}`. Valida CPF, CEP (se cep não batido via backend retorna erro, ou confia no dado após validate). Chama provider. Cria doc em `payments` collection. Atualiza subscription para `pending_payment` (Pix) ou tenta ativar (Cartão se provider retornar aprovado síncrono).
  - `POST /api/payments/confirm` — fallback para Pix pending (verifica status no provider e atualiza subscription se aprovado).
  - `POST /api/payments/webhook` — sem autenticação (ou autenticação por header signature do provider). Verifica assinatura, parseia evento, idempotência por `provider_payment_id` + tipo evento em `payments`. Atualiza subscription (active/overdue) e `last_payment_at`, `expires_at` (+30 dias ou data do provedor). Se evento for recorrência renovada, estende `expires_at` com mais 30 dias.
- **Acceptance Criteria Addressed**: AC-1, AC-3, AC-4, AC-5, AC-7, AC-12, FR-4, FR-7
- **Test Requirements**:
  - `rule` TR-5.1: `GET /api/plans` retorna array com 3 planos (free, founder, mentor) com preços corretos.
  - `rule` TR-5.2: `GET /api/payments/cep/01311000` retorna 200 com logradouro/bairro/cidade/UF (SP, Bela Vista etc.) ou 400 se ViaCEP indisponível (tratar exceção como 502 mas não estourar).
  - `rule` TR-5.3: `POST /api/payments/webhook` com assinatura errada retorna 401 e não altera subscription.
  - `rubric` TR-5.4: Clareza e segurança das rotas (nenhum dado sensível salvo). Escala 1-5, threshold >= 4.
- **Notes**: Para idempotência, adicionar campo `webhook_events_seen: list[str]` em payment doc ou collection separada.

---

## Task 6: Atualizar modelo de usuário e integração Auth (backend + upgrade `public_user`)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Modificar `public_user` para incluir assinatura resumida (plano atual, status, vencimento opcional) e email mascarado opcional (manter email real só em resposta segura `/auth/me` — mas o frontend precisa do email real só para login? Prefira: retornar `email_masked` junto de `email` real em `/auth/me` apenas se frontend precisar do email completo em algum fluxo de pagamento. Conclusão: manter email completo em `/auth/me` pois é rota autenticada do próprio usuário; adicionar também `email_masked` para conveniência do frontend exibir sem recalcular).
  - Ao registrar usuário novo (email ou Google), chamar `get_or_create_subscription` após criar o user doc.
  - Criar índices MongoDB em startup: `subscriptions.user_id` (único), `payments.provider_payment_id` (único), `payments.user_id`, `subscriptions.status`, `subscriptions.expires_at`.
  - Atualizar função `get_current_user` / `public_user` para não quebrar caso subscription não exista (garantir por `get_or_create_subscription` on demand).
- **Acceptance Criteria Addressed**: AC-1, AC-10, FR-6, FR-9
- **Test Requirements**:
  - `rule` TR-6.1: Resposta de `/auth/me` contém campo `subscription` com `plan_id`, `plan_name`, `status`, `daily_message_limit` e campo `email_masked`.
  - `rule` TR-6.2: Índices `unique` em `subscriptions.user_id` e `payments.provider_payment_id` criados no startup (verificar collection indexes via pymongo info).
  - `rule` TR-6.3: Login Google de usuário existente sem subscription → subscription free criada automaticamente após request a `/auth/me`.
- **Notes**: Não excluir dados existentes.

---

## Task 7: Frontend — App Router, AuthContext, utilitários e integração API
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Em `App.js`, adicionar rota `/planos` → componente `PricingPlans` (já existe) e rota `/meu-plano` → componente novo `MyPlan` (a criar em Task 10).
  - Em `AuthContext.jsx`, adicionar função/estado `subscription` separado com `refreshSubscription()` e expor via value (ou usar custom hook `useSubscription`). Chama `GET /api/subscription` após login e periodicamente ou on-demand.
  - Atualizar `api.js` se precisar de novo interceptor, criar helpers:
    - `api.subscription.get()`
    - `api.subscription.cancel()`
    - `api.plans.list()`
    - `api.payments.init(payload)`
    - `api.payments.confirm(paymentId)`
    - `api.payments.validateCpf(cpf)`
    - `api.payments.lookupCep(cep)`
  - Criar utilitários `maskEmail(email)`, `formatCurrencyBRL`, `formatDateBR` em `lib/utils.js` existente.
  - Criar função `loadPaymentProviderSdk(provider)` que injeta script do MP ou Stripe dinamicamente (idêntico ao padrão do Google Identity já existente no AuthContext).
- **Acceptance Criteria Addressed**: AC-8, AC-11, FR-8, FR-6
- **Test Requirements**:
  - `rule` TR-7.1: Navegar para `/planos` renderiza PricingPlans sem crash.
  - `rule` TR-7.2: `maskEmail` em utils.js retorna valores esperados (mesmos casos do backend).
  - `rubric` TR-7.3: Integração com AuthContext não quebra fluxo de login existente. Escala 1-5, threshold >= 4.
- **Notes**: Verificar se existe utilitário em `utils.js` atual.

---

## Task 8: Frontend — PricingPlans com fluxo real + CheckoutModal
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7
- **Description**:
  - Reescrever `PricingPlans.jsx` (usando a estrutura visual atual NÃO ALTERADA visualmente — cores, bordas, textos, preços, ícones) e trocar toast fake por abrir um `CheckoutModal`.
  - Criar componente novo `CheckoutModal` usando Dialog shadcn (já existe em `components/ui/dialog.jsx`).
  - Etapas do CheckoutModal:
    1. Resumo do plano escolhido + total mensal.
    2. Escolha do método: Pix / Cartão de crédito.
    3. Form de dados do pagador:
       - Nome completo (obrigatório, min 3)
       - CPF (mascara + chama validate-cpf ao perder foco; erro vermelho em baixo do input)
       - Email (já preencher com o email do user logado; pode editar)
       - CEP (máscara 00000-000, blur → chama /cep para preencher endereço)
       - Rua (preenchido automaticamente; permitido editar)
       - Número (obrigatório)
       - Complemento (opcional)
       - Bairro (auto)
       - Cidade (auto)
       - UF (auto em 2 letras)
    4. Tela do método:
       - **Pix**: após init sucesso, exibir QR Code (img se provider der base64 senão biblioteca qrcode frontend opcional ou fallback copiar código PIX) + botão "Copiar código PIX" + botão "Já paguei, verificar" que chama /confirm. Mostrar aviso que pode demorar alguns minutos.
       - **Cartão**: Renderizar elemento seguro do provider. Mercado Pago: usar `MercadoPago` JS carregado via SDK com card form tokenizer (número/cvv são tokenizados sem tocar inputs próprios). Stripe: usar CardElement do Stripe. Botão "Pagar R$ X,XX". Se falhar, mostrar erro amigável.
    5. Sucesso: mostrar tela "Pagamento confirmado. Seu plano já está ativo." + fechar modal e atualizar subscription contexto.
  - Manter 100% do estilo visual atual: usar variáveis CSS, classes Tailwind existentes nos components do projeto. Sem novos sistemas de cor.
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-5, AC-9, FR-4, FR-8, NFR-5
- **Test Requirements**:
  - `rule` TR-8.1: Tentar avançar no checkout com CPF 00000000000 mostra erro e bloqueia clique em continuar.
  - `rule` TR-8.2: Preencher CEP válido → campos logradouro/bairro/cidade/UF preenchidos automaticamente.
  - `rule` TR-8.3: Escolher Pix + mock provider → modal mostra QR code/codigo e status pending. Webhook simulado (ou /confirm) atualiza para active e reflete em "Meu plano".
  - `rubric` TR-8.4: Fidelidade visual aos componentes PricingPlans existentes. Escala 1-5, threshold >= 4.
- **Notes**: Se não houver biblioteca de QR code no frontend, basta exibir texto copiar-colar e opcionalmente uma imagem `<img src={qr_code_base64}>` se provider der base64. Instalar biblioteca só se estritamente necessário.

---

## Task 9: Frontend — Sidebar, NotificationBell, mascara email
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7
- **Description**:
  - Em `Sidebar.jsx`, perto do avatar do usuário, adicionar ícone de sininho (`Bell` do lucide-react — verificar já existe em outros imports; se não, importar normalmente). Badge vermelho pequeno se houver notices não lidos.
  - Criar componente `NotificationBell` (popover/dropdown) listando notices. Para cada notice exibir mensagem amigável ("Seu plano vence em 5 dias.", "Seu plano venceu. Regularize para continuar usando os benefícios.", "Seu plano foi cancelado após 5 dias sem pagamento.") com cor apropriada. Cada notice tem CTA "Ver planos" ou "Regularizar".
  - Mostrar nome do usuário como primário no Sidebar. Email exibido só mascarado (usar `email_masked` da API ou `maskEmail` local).
  - Se usuário não tiver nome, exibir `email_masked` como primário.
  - No botão de upgrade existente no Sidebar (free), manter o design e adicionar link para `/planos` (já tem). Adicionar também um item para "Meu plano" que abre `/meu-plano`.
- **Acceptance Criteria Addressed**: AC-7, AC-8, AC-9, FR-5, FR-6, FR-8
- **Test Requirements**:
  - `rule` TR-9.1: Usuário com name definido → Sidebar mostra name como primeira linha, email mascarado como segunda.
  - `rule` TR-9.2: Sem name → Sidebar mostra email mascarado como primeira linha.
  - `rule` TR-9.3: NotificationBell com notice de expirar em 1 dia mostra a frase correta e badge.
  - `rubric` TR-9.4: Integração visual com Sidebar (não parece fora do lugar). Escala 1-5, threshold >= 4.
- **Notes**: Bell do lucide: `import { Bell } from "lucide-react"`.

---

## Task 10: Frontend — Tela "Meu plano" (MyPlan.jsx)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7
- **Description**:
  - Criar página `src/pages/MyPlan.jsx` (rota `/meu-plano`).
  - Estrutura:
    - Header com voltar e logo (igual a PricingPlans.jsx).
    - Card principal com dados:
      - Plano atual (nome + badge se pago).
      - Status: colorido — active=verde suave / pending_payment=amarelo / overdue=vermelho claro / canceled=cinza.
      - Data de início e vencimento (formatado dd/mm/aaaa).
      - Método de pagamento: Pix, Cartão (**** 1234) ou vazio.
    - Card "Uso de hoje": barra de progresso `messages_used_today / daily_message_limit` com texto "25 de 80 mensagens usadas hoje — 55 restantes".
    - Botões:
      - Se Gratuito: "Ver planos" → /planos.
      - Se Fundador/Mentor active: "Ver planos (upgrade/downgrade)" → /planos; "Cancelar plano" (com modal de confirmação amigável, avisa que benefícios cessam no vencimento ou imediatamente? Definir: cancelamento manual marca canceled_at e expires_at continua valendo até o final do período pago, então usuário usa até lá e depois volta free. Usar status `canceled_at` e manter `status=active` até expirar? Ou status `canceled_at` é só um campo extra com cancelamento pendente. Decisão: adicionar `cancel_at_period_end: bool`; se true, mostrar "Seu plano será cancelado ao fim do ciclo em {data}" e status continua active até data; depois vira canceled+free. Simplifica UX).
    - Histórico de pagamentos recentes (3 últimos), opcional: data, valor, método, status (approved/pending).
- **Acceptance Criteria Addressed**: AC-13, FR-6, FR-8, AC-9
- **Test Requirements**:
  - `rule` TR-10.1: Plano Fundador active 25/80 → barra mostra 25/80 e texto 55 restantes.
  - `rule` TR-10.2: Usuário Gratuito 3/10 → barra mostra 3/10, 7 restantes, vencimento "Sempre ativo".
  - `rubric` TR-10.3: Fidelidade visual (cores, bordas, tipografia). Escala 1-5, threshold >= 4.
- **Notes**: Não criar gráficos complexos. Progress bar simples como em `components/ui/progress.jsx` se já existir, senão divs inline com variáveis CSS.

---

## Task 11: Erros amigáveis no chat ao atingir limite diário + toast
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 4, Task 7
- **Description**:
  - No Chat.jsx, quando a requisição de envio retorna erro 402 ou 429 com a mensagem de limite, exibir toast amigável e não remover o texto do input (usuário pode reenviar amanhã).
  - Texto do toast: "Você atingiu seu limite diário de mensagens. Amanhã ele reseta, ou você pode assinar um plano com mais capacidade agora." + ação "Ver planos" → navega para /planos.
  - Similar para voice call: se retornar 402, informar no VoiceCall UI / toast.
- **Acceptance Criteria Addressed**: AC-2, FR-2
- **Test Requirements**:
  - `rule` TR-11.1: Simulando erro 402, toast aparece com CTA e input não é limpo.
- **Notes**: Evitar spam de toasts.

---

## Task 12: Notificações por email (opcional com fallback)
- **Status**: `pending`
- **Priority**: low
- **Depends On**: Task 5
- **Description**:
  - Criar função `send_email(to, subject, html_body)` opcional usando SMTP via `smtplib` Python, com try/except. Se SMTP_HOST não estiver no env, a função loga "email not configured" e retorna True sem erro.
  - Disparar email em:
    - 5 dias, 3 dias, 1 dia antes do vencimento (ao rodar maintenance).
    - Ao se tornar overdue.
    - Ao ser canceled após 5 dias.
    - Ao pagamento ser confirmado (recibo).
  - Templates HTML simples: logo Aurélio (texto) + mensagem em português claro e link para `/meu-plano` ou `/planos`.
- **Acceptance Criteria Addressed**: FR-5 (email parte)
- **Test Requirements**:
  - `rule` TR-12.1: Se SMTP_HOST ausente, função não levanta exceção; se presente (simulado por stub), chama smtplib corretamente.
  - `rubric` TR-12.2: Clareza dos emails (sem design quebrado). Escala 1-5, threshold >= 3.
- **Notes**: Adicionar campos SMTP no .env.example em Task 1.

---

## Task 13: Testes manuais e regressão
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1 a 12
- **Description**:
  - Rodar backend (python -m uvicorn server:app ...) e frontend (npm start).
  - Verificar: login email, login Google, envio de 10+ mensagens free (blocked).
  - Upgrade para Fundador via Pix mock: pending → /confirm → active.
  - Expiração manual via update no banco: overdue → 5 dias → canceled/free.
  - Notifications Bell mostra avisos corretos.
  - Sidebar mostra nome/email mascarado corretamente.
  - Validações CPF/CEP no checkout.
  - Resposta de `/auth/me` contém subscription e email_masked.
  - Rodar testes existentes se houver (backend/tests/test_aurelio_api.py).
- **Acceptance Criteria Addressed**: Todos (especialmente AC-10 e NFR)
- **Test Requirements**:
  - `rule` TR-13.1: Testes existentes passam (pytest).
  - `rule` TR-13.2: Nenhum passo manual acima apresenta exceção não tratada.
  - `rubric` TR-13.3: Experiência geral fluida. Escala 1-5, threshold >= 4.
- **Notes**: Fazer ajustes de correção de bugs conforme necessário durante esta tarefa.
