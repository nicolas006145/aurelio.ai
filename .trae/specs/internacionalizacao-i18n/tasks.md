# Sistema de Idioma e Localização do Aurélio - Implementation Plan

## Task 1: Tabela de locales backend + resolver locale + header X-Locale + cache lookup IP
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Em `server.py` criar `SUPPORTED_LOCALES = {"pt-BR": {...}, "en-US": {...}, "es-ES": {...}}` com `code`, `intl_date`, `intl_currency`, `stt_lang`, `tts_voice_map_by_gender` (M/F → voz OpenAI por idioma).
  - Adicionar função pura `resolve_locale(request=None, user=None, headers_only=False)` com prioridade: user.settings.locale > header `X-Locale` validado em whitelist > cookie aurelio_locale > Accept-Language > fallback pt-BR.
  - Whitelist: qualquer valor fora da whitelist é descartado e cai pro próximo nível.
  - Adicionar lookup IP opcional via `ip-api.com/json` (se nada acima acertar) usando singleton `_httpx_client`; cache dict em memória `_IP_CACHE` TTL 24h; se request falhar só skipa sem quebrar.
- **Acceptance Criteria Addressed**: AC-2, AC-8, FR-2, FR-3, FR-5
- **Test Requirements**:
  - `rule` TR-1.1: Dado request com X-Locale: "en-US" e sem user, resolver retorna en-US com stt_lang="en". Evidence: pytest ou script teste.
  - `rule` TR-1.2: Dado X-Locale "xx-XX" inválido, cai para Accept-Language. Evidence: script que injeta Accept-Language "es;q=0.9".
  - `rule` TR-1.3: Usuário logado com settings.locale=en-US e request X-Locale=pt-BR: resultado final en-US (user vence). Evidence: mock user doc + resolve.
- **Notes**: Chamada ip-api só quando nenhuma outra heurística bater; nunca armazenar IP no BD.

## Task 2: System prompt, reflection, STT e TTS dinâmicos por locale
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Criar versão `build_system_prompt(persona_name, gender, locale_code="pt-BR")` com base em strings de persona por idioma: PT = original existente; EN = "You are {name}, a mature stoic-style personal mentor. Your name honors stoic philosophy. Speak honestly, never flattering — the truth that helps the user mature, not the one they want to hear."; ES = "Eres {name}, un mentor de madurez estoico. Tu nombre rinde homenaje a la filosofía estoica. Habla con verdad, nunca adulescentes — la verdad que ayuda a madurar."; mesma estrutura (poupança emocional, conversas, perguntas retóricas, ética).
  - Injetar linha obrigatória "You must answer in <FULL_LANGUAGE_NAME>, always." / "Siempre respondes en <IDIOMA>." no final do system prompt, independente do idioma do usuário.
  - REFLECTION_SYSTEM_PROMPT por locale (PT/EN/ES) — `get_reflection_system_prompt(locale_code)`.
  - `_stt.transcribe(bio, language=stt_lang, ...)` usar `stt_lang` do locale do usuário em vez de `language="pt"` fixo (em rotas `/voice` e `/conversations/{id}/voice`).
  - `get_user_voice_config` + TTS gerar voz usando `tts_voice_map_by_gender` do locale e gender da persona (não voz fixa PT).
- **Acceptance Criteria Addressed**: AC-4, AC-5, FR-5
- **Test Requirements**:
  - `rule` TR-2.1: build_system_prompt("Aurélio", "male", "en-US") contém substring "answer in English". Evidence: print output string.
  - `rule` TR-2.2: `get_reflection_system_prompt("es-ES")` contém "reflexión diaria" (sem "reflexão diária" PT). Evidence: assert not in.
  - `rubric` TR-2.3: Naturalidade do system prompt EN/ES (igual tom, não robótico); scale 1-5; 1=literal ruim, 3=ok, 5=nativo maduro; threshold >= 4; evidence leitura humana.

## Task 3: Templates de email backend traduzidos por locale
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - Criar dict `EMAIL_STRINGS = { "pt-BR": {subject_activated: "...", button_manage: "...", ...}, "en-US": {...}, "es-ES": {...} }` cobrindo todos os emails já codificados: confirmação ativação, avisos 5d/3d/1d antes, vencido overdue, cancelado após 5 dias.
  - `build_subscription_email_html(kind, locale_code="pt-BR", plan_name=None, days_left=None, expires_at=None)` seleciona strings apropriadas. Nomes/valores monetários formatados por locale (`format_currency_brl_for_email(value, locale)`).
  - Em `send_email` de `activate_subscription`, maintenance, `_downgrade_to_free`, passar `locale=user.settings.locale or "pt-BR"`.
- **Acceptance Criteria Addressed**: AC-7, FR-8
- **Test Requirements**:
  - `rule` TR-3.1: build_subscription_html("activated", "en-US", "Founder") subject não contém "assinatura ativada" em PT; contém "activated". Evidence: output str.
  - `rule` TR-3.2: Overdue notice es-ES contém Spanish "tu plan venció" e não PT. Evidence: contains().
  - `rubric` TR-3.3: Tradução emails tom elegante (não robótico); scale 1-5, threshold >=4. Evidence leitura.

## Task 4: Dicionários de tradução frontend (PT-BR / EN-US / ES-ES) ~95% cobertura
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Criar diretório `frontend/src/i18n/` com 3 arquivos JSON: `pt-BR.json`, `en-US.json`, `es-ES.json`.
  - Estrutura chave por domínio: `common.confirm`, `common.cancel`, `common.save`, `common.back`, `common.loading`; `landing.*`, `auth.*`, `sidebar.*`, `chat.*`, `plans.*`, `checkout.*`, `myplan.*`, `notices.*`, `journal.*`, `reflection.*`, `voice.*`, `errors.*`.
  - pt-BR.json = string originais 100% da UI (copy-paste direto dos componentes).
  - en-US.json e es-ES.json = tradução nativa tom maduro; manter termos como "Mentor" / "amadurecimiento" / "maturation"; nunca usar tradução literal automática genérica.
- **Acceptance Criteria Addressed**: AC-1, AC-10, FR-4
- **Test Requirements**:
  - `rule` TR-4.1: pt-BR.json contém >= 80 chaves; en-US e es-ES tem as mesmas 80+ chaves. Evidence: `jq 'keys | length'`.
  - `rubric` TR-4.2: Qualidade semântica EN e ES; scale 1-5, threshold >= 4. Evidence revisão humana.
  - `rule` TR-4.3: Nenhuma chave de ERROS contém "undefined" ou placeholder vazio. Evidence grep.

## Task 5: I18nProvider React + useTranslation hook + lazy load JSON + axios interceptor
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - Criar `frontend/src/i18n/I18nContext.jsx` com provider em volta de AuthProvider (ou dentro) no App.js.
  - Hook `useTranslation()` retorna `{ t, locale, setLocale, locales, isLoadingLocale }`.
  - `t(key, params?)` interpola `{var}` e faz fallback em cadeia: localeAtivo → pt-BR → key (string própria, nunca undefined/quebra UI).
  - Locale inicial resolvido por: (localStorage.aurelio_locale) → navigator.language match → Accept-Language (via backend `/api/locale/detect` se quiser; pode ser client-only no v1) → "pt-BR".
  - `setLocale(code)`: grava localStorage, dispara `document.cookie = aurelio_locale=code;path=/;max-age=31536000;SameSite=Lax`; atualiza estado (re-render tudo sem refresh); envia `axios.defaults.headers.common["X-Locale"] = code` no interceptor.
  - Lazy load JSON por `const dict = await import(`../i18n/${code}.json`)` no setLocale (evita baixar EN/ES no primeiro paint de usuário PT).
- **Acceptance Criteria Addressed**: AC-1, FR-4, FR-7, NFR-3
- **Test Requirements**:
  - `rule` TR-5.1: `t("common.inexistente_chave", {})` retorna `"common.inexistente_chave"` (key fallback); não undefined. Evidence React render.
  - `rule` TR-5.2: setLocale("en-US") → axios.defaults.headers.common["X-Locale"] === "en-US". Evidence console.log.
  - `rule` TR-5.3: localStorage.aurelio_locale="es-ES" antes do mount. Provider inicializa locale === es-ES. Evidence useState.

## Task 6: Componente LanguageSelector reutilizável + uso em Landing/Auth/Sidebar
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - Criar `frontend/src/components/LanguageSelector.jsx` (Popover shadcn existente, mesma UX de SubscriptionBell): botão pequeno com ícone `Globe` do lucide; nome do idioma atual; popover lista os 3 idiomas, cada item com bandeira (emoji bandeira 🇧🇷 🇺🇸 🇪🇸 basta — não precisa asset imagem) + nome idioma no próprio idioma ("Português", "English", "Español") + região pequeno ("Brasil", "United States", "España"). item ativo com marcação terracotta.
  - Inserir seletor no header da `Landing` (direita, antes de "Entrar" / "Cadastre-se") e na tela `Auth` (direita, canto superior).
  - Na Sidebar logado: inserir na seção de perfil inferior — botão Globe ao lado do SubscriptionBell.
  - Usar 100% variáveis CSS do projeto. Nenhum estilo hardcoded.
- **Acceptance Criteria Addressed**: AC-1, AC-9, FR-1
- **Test Requirements**:
  - `rule` TR-6.1: Trocar idioma via LanguageSelector da Landing causa re-render em < 200ms sem F5. Evidence console.time/timeEnd.
  - `rule` TR-6.2: Item ativo exibe border-accent terracotta. Evidence visualização.
  - `rubric` TR-6.3: Fidelidade visual (mesmo estilo restante do projeto); scale 1-5, threshold >=4. Evidence screenshot.

## Task 7: Sidebar nova seção "Idioma e região" + persistência backend via PATCH settings
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 6
- **Description**:
  - No `Sidebar.jsx`, criar novo card/section acima de "Meu plano": label eyebrow uppercase `IDIOMA E REGIÃO` / `LANGUAGE & REGION` (via `t()`) + selector grande ou inline mostrando idioma atual com botão "Alterar" que abre o LanguageSelector expandido.
  - Quando usuário logado troca idioma via qualquer seletor, disparar chamada `api.patch("/auth/settings", { locale: newCode })` (backend já tem rota `/auth/settings` — adicionar suporte a campo `locale` e validar whitelist); atualizar `user.settings.locale` do AuthContext também em memória.
  - Em caso de erro na chamada PATCH (falta internet), manter localStorage e mostrar toast informativo "Configuração salva localmente e será sincronizada na próxima conexão.".
- **Acceptance Criteria Addressed**: AC-3, FR-7
- **Test Requirements**:
  - `rule` TR-7.1: Trocar → PATCH /auth/settings enviado com `{locale: "en-US"}` e BD atualiza settings.locale. Evidence request e Mongo.
  - `rule` TR-7.2: PATCH offline não quebra interface; localStorage atualiza imediatamente. Evidence mock offline (desativar net, toggle locale).

## Task 8: Extrair strings hardcoded para t() — cobertura 95% da UI
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - Iterar por todos os componentes e páginas existentes e trocar literais hardcoded por `t("key")` com interpolação:
    - Landing.jsx (herói, CTA, features, depoimentos, footer).
    - Auth.jsx (Entrar / Cadastre-se, labels inputs, "Esqueci minha senha", mensagens de erro, toast).
    - Chat.jsx (botões, "Digite sua mensagem", "Enviar", toast limite diário, títulos de erro).
    - Sidebar.jsx, SubscriptionBell.jsx, PricingPlans.jsx, CheckoutModal.jsx, MyPlan.jsx, JournalDrawer.jsx, DailyReflection.jsx, VoiceCall.jsx, VoiceSettingsDialog.jsx, MessageBubble.jsx, ThemeToggle.jsx, App.js (rotas Loader label, auth callback erro).
  - Manter `font-serif-display` em títulos, `eyebrow` uppercase e variações de cor. Nunca estilizar via string do dicionário.
- **Acceptance Criteria Addressed**: AC-1, AC-9, FR-4
- **Test Requirements**:
  - `rule` TR-8.1: Após troca, grep `strings hardcoded visíveis` em arquivos JSX encontra <= 5% strings literais que não são nome próprio (Aurélio, Clara, etc). Evidence relatório grep.
  - `rubric` TR-8.2: Nenhum texto visual parece "deslocado" ou com tamanho que quebra layout após tradução EN/ES (palavras longas ES cabem em botões/labels); scale 1-5, threshold >=4. Evidence screenshots.

## Task 9: Formatadores utilitários locale-aware (data + moeda BRL)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - Em `utils.js`: criar `formatDate(iso, locale?)` e `formatCurrencyBRL(value, locale?)` que usam locale do `useI18n()` ou parâmetro direto.
  - Regras moeda: `new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : locale === "en-US" ? "en-US" : "es-ES", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })` — isso naturalmente produz "R$ 7,90", "BRL 7.90", "7,90 BRL".
  - Regras data: `new Intl.DateTimeFormat(locale)` (dd/mm/aaaa vs mm/dd/aaaa vs dd/mm/aaaa).
  - Atualizar `PricingPlans.jsx`, `MyPlan.jsx`, `CheckoutModal.jsx` e `SubscriptionBell.jsx` para usar esses formatadores (remover `formatCurrencyBRL` old que não leva locale).
- **Acceptance Criteria Addressed**: AC-6, FR-6
- **Test Requirements**:
  - `rule` TR-9.1: formatCurrencyBRL(7.9, "en-US") === "BRL 7.90"; formatCurrencyBRL(7.9, "pt-BR") === "R$ 7,90"; formatCurrencyBRL(7.9, "es-ES") === "7,90 BRL". Evidence Node ou browser console output.
  - `rule` TR-9.2: formatDate("2026-09-22T00:00:00Z", "en-US") contém "09/22/2026". Evidence.

## Task 10: AuthContext sincroniza locale (login/logout, refreshMe, multiple devices)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5, Task 7
- **Description**:
  - No AuthContext: após `login`, `register`, `exchangeSession`, `loginGoogle`, `refreshMe`, sincronizar `i18n.setLocale(user.settings.locale || localStorage.aurelio_locale || "pt-BR")` dando preferência a user.settings.
  - `logout()` deve resetar locale para localStorage (se havia escolha manual anônima) ou heurística.
  - Adicionar `refreshLocale()` opcional que faz PATCH e recarrega dados do user para sincronizar cross-device.
  - Garantir `user.settings.locale` aparece no `public_user` do backend já no /auth/me (adiciona no objeto settings).
- **Acceptance Criteria Addressed**: AC-3, FR-7
- **Test Requirements**:
  - `rule` TR-10.1: Login com usuário que tem settings.locale en-US salvo. UI carrega em EN sem clique manual. Evidence.
  - `rule` TR-10.2: Dispositivo B escolhe idioma ES; dispositivo A, após refreshMe, sincroniza ES. Evidence fluxo 2 abas.

## Task 11: Heurística de primeiro paint não-logado (navigator.language + ip-api fallback opcional cacheado 24h)
- **Status**: `pending`
- **Priority**: low
- **Depends On**: Task 5
- **Description**:
  - No efeito inicial do I18nProvider, quando localStorage vazio e sem user: 1) testar navigator.language/languages; se der match, pronto. 2) senão, tentar chamada `fetch("https://ipapi.co/json/")` ou backend `/api/locale/detect` novo que roda lookup ip-api server-side; cachear resultado 24h em localStorage também. Resultado só altera locale se nenhum match aconteceu na etapa 1.
  - Backend opcionalmente criar `GET /api/locale/detect` protegido ou público (sem limite rigoroso) que usa singleton `_httpx_client` e cache 24h em memória para retornar { countryCode, suggested_locale }.
- **Acceptance Criteria Addressed**: AC-2, FR-2
- **Test Requirements**:
  - `rule` TR-11.1: Mock navigator.language = "en-US". I18n inicial = en-US. Skip ip-api. Evidence.
  - `rule` TR-11.2: navigator.language = "de-DE" (sem match). Ip-api retorna countryCode "ES". Provider inicializa "es-ES". Evidence mock fetch.

## Task 12: Backend valida X-Locale + expõe locale no public_user.settings + endpoint settings aceita locale
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1, Task 10
- **Description**:
  - No `get_current_user` ou middleware, aplicar `resolve_locale(request, user)` e anexar ao request.state: `request.state.locale = {...}`.
  - `public_user.settings` manter voice_id existente, adicionar campo `locale: "pt-BR" | "en-US" | "es-ES"` usando user.settings.locale (default pt-BR).
  - Rota `PATCH /api/auth/settings` aceitar novo campo `locale: str`, validar whitelist `SUPPORTED_LOCALES`, gravar `settings.locale` no banco e retornar public_user atualizado.
  - Aplicar locale em todos os handlers que geram: system prompt / reflection / STT / TTS / emails (já pega user.settings.locale).
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-8, NFR-4
- **Test Requirements**:
  - `rule` TR-12.1: PATCH /auth/settings locale = "xx-XX" retorna 400. Evidence HTTP 400.
  - `rule` TR-12.2: GET /auth/me sem locale salvo retorna settings.locale === "pt-BR". Evidence response.
  - `rule` TR-12.3: Handler /chat usa request.state.locale.stt_lang === "es" quando X-Locale = "es-ES". Evidence debug log.

## Task 13: Testes manuais, regressão, evidências de todos os ACs
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1..12
- **Description**:
  - Rodar `py_compile backend/server.py`; `GetDiagnostics` frontend vazio.
  - Rodar `pytest tests/test_aurelio_api.py` sem quebrar (requests default Accept-Language).
  - Gerar screenshots ou pequena gravação evidenciando:
    - Troca de idioma em Landing/Auth/Sidebar sem F5 (AC-1).
    - 3 casos heurística VPN (AC-2).
    - Login cross-device após toggle (AC-3).
    - Chat em EN e ES com voz (AC-4).
    - Reflexão diária ES (AC-5).
    - PricingPlans/MyPlan formatos moeda-data (AC-6).
    - Template email EN (AC-7).
    - Usuário antigo sem locale (AC-8).
  - Pontuação AC-9 (fidelidade visual) >= 4. Pontuação AC-10 (qualidade traduções) >= 4.
- **Acceptance Criteria Addressed**: Todos ACs 1..10
- **Test Requirements**:
  - `rule` TR-13.1: py_compile === 0, GetDiagnostics === [].
  - `rule` TR-13.2: pytest não quebra.
  - `rule` TR-13.3: Todas evidências visuais capturadas (pelo menos 10 imagens/prints).
  - `rubric` TR-13.4: Fidelidade visual geral pós-internacionalização; scale 1-5, threshold >=4.
  - `rubric` TR-13.5: Qualidade traduções EN/ES (rodapés, toasts, mensagens chat); scale 1-5, threshold >=4.
