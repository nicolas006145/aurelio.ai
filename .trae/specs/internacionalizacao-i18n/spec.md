# Sistema de Idioma e Localização do Aurélio - Especificação

## Overview
- **Summary**: Implementar sessão completa de seleção de idioma, detecção heurística de localização (funciona inclusive com VPN) e coerência total entre idioma da interface, voz do Aurélio, idioma das respostas no chat, reflexões diárias, formatação de datas e moeda, e emails transacionais. Idiomas de lançamento: Português do Brasil, Inglês Americano, Espanhol (Espanha/LatAm).
- **Purpose**: Abrir o Aurélio para público internacional e usuários de língua inglesa/espanhola, mantendo 100% a identidade da marca (tom maduro, elegante, variáveis de cor/layout/tipografia existentes, nomes das personas Aurélio/Clara/Lua/Marco/Marina preservados). Experiência: usuário chega, sistema sugere o idioma certo automaticamente, mas a escolha manual sempre tem prioridade máxima e persiste.
- **Target Users**: (a) Usuários não logados (landing, auth); (b) Usuários logados dentro da aplicação (chat, perfil, planos, meu plano, reflexões); (c) Destinatários de emails do sistema (assinatura, avisos).

## Goals
- Sessão de seleção de idioma acessível em 3 pontos: header da Landing, tela de Auth e dentro da Sidebar/Perfil (logado).
- Detecção heurística por 3 sinais, em ordem de prioridade: (1) `navigator.language` do browser, (2) header HTTP `Accept-Language`, (3) geolocalização por IP (ip-api.com free tier). VPN mascara IP, mas os 2 primeiros sinais continuam confiáveis.
- Escolha manual do usuário SEMPRE vence a detecção automática.
- Persistência dupla: (a) `localStorage` + cookie para não logados; (b) campo `settings.locale` no MongoDB para usuários logados (sobrevive a login/logout, múltiplos dispositivos).
- Tradução 100% da UI para os 3 idiomas, usando fallback para PT-BR se alguma chave faltar.
- Respostas do chat (LLM), reflexões diárias e system prompt do Aurélio em **tempo real** no idioma selecionado, mantendo a personalidade e nomes das personas.
- Voz do Aurélio (TTS) e reconhecimento de voz (STT) usam voz OpenAI correta por idioma e locale no parâmetro `language` do STT.
- Formatação de datas (dd/mm/aaaa vs mm/dd/aaaa) e moedas (BRL sempre cobrado, só formato visual muda por locale).
- Emails de assinatura e avisos traduzidos para o locale salvo no usuário.
- **NÃO alterar identidade visual existente**: cores, fontes, espaçamentos, bordas, layout geral permanecem. Apenas traduções e seletor novos seguem o mesmo estilo.

## Non-Goals
- Não traduzir nomes próprios das personas (Aurélio continua Aurélio em todos os idiomas; não "Aurelius" em EN).
- Não implementar cobrança multi-moeda; preço sempre em BRL, só formato visual muda.
- Não mudar a personalidade/tom do Aurélio (continua maduro, elegante, sábio, sem bajulação).
- Não usar bibliotecas de i18n pesadas (ex: `react-i18next` com plugins extras); solução leve com contexto React + JSON dicts mantém bundle pequeno.
- Não suportar 5+ idiomas na versão 1 (ficamos com PT-BR, EN-US, ES-ES).
- Não implementar timezone-aware (horário de verão etc.) nesta fase; continuamos usando BRT/UTC-3 para vencimentos.
- Não implementar tradução de mensagens antigas no chat (histórico); só novas mensagens e UI nova usam o locale ativo.

## Background & Context
- **Arquitetura hoje**: Backend Python/FastAPI + MongoDB Motor async; frontend React (Craco) com contexto `AuthContext.jsx` e `settings.voice_id` já persistido em `user.settings`.
- **System prompt hardcoded PT-BR**: Hoje `build_system_prompt()` em `server.py:779` gera prompt em PT "Você é Aurélio, um mentor de amadurecimento...". STT em `server.py:1950` fixa `language="pt"`.
- **5 personas já existem** em `AVAILABLE_VOICES`: Aurélio (M mature), Clara (F), Lua (F), Marco (M), Marina (F) — atualmente todas com voz OpenAI mapeadas para PT-BR.
- **Chat, voz, diario, reflexão diária, check-out de planos, Meu plano, Sidebar**: interfaces ricas em strings hardcoded em PT (são milhares de strings).
- **Convenções visuais existentes (RIGIDAS)**: `--terracotta #C46F39`, `--bg-main`, `--bg-card`, `--bg-surface`, `--border`, `--border-accent`, `--text-primary/secondary/muted`, `font-serif-display` (ex Playfair Display), `font-mono-jb`, cantos `rounded-full`/`rounded-2xl`/`rounded-3xl`, sobra `shadow-lg / shadow-[var(--terracotta)]/20`. Esses valores NÃO são alterados.
- **Pré-requisito de integração**: Após trocar idioma, a UI deve re-renderizar tudo sem refresh; backend deve receber o locale via header `X-Locale` (preferência manual do usuário, se salvo).
- **Convenções de segurança e singleton do projeto**: `_httpx_client` singleton para chamadas HTTP (ip-api lookup); `React.memo` em listas longas; `activeStreamsRef` SSE intacto.

## Functional Requirements

**FR-1 — Sessão de Seleção de Idioma**
- Seletor de idioma visível em 3 lugares:
  1. **Landing page** (`/`): canto superior direito (antes do botão Entrar/Cadastrar).
  2. **Tela Auth** (`/auth`): canto superior direito.
  3. **Sidebar/Perfil** (usuário logado): nova seção "Idioma e região" no painel de perfil, acima ou abaixo de "Meu plano".
- Cada opção mostra: bandeira (ou ícone Globo) + nome do idioma no próprio idioma ("Português", "English", "Español") + região pequeno ("Brasil", "United States", "España").
- Idioma padrão fallback, quando nenhuma heurística acerta e usuário não escolheu manualmente: `pt-BR`.

**FR-2 — Detecção Heurística (mesmo com VPN)**
- 3 sinais, aplicados nesta ordem, com o primeiro resultado válido decidindo (exceto escolha MANUAL do usuário que sempre vence TUDO):
  1. **Escolha manual salva**: `localStorage.aurelio_locale` (não logado) OU `user.settings.locale` (logado) → **vence sempre**.
  2. `navigator.language` / `navigator.languages` do navegador → match prefixo `pt`, `en`, `es`.
  3. Header HTTP `Accept-Language` enviado para rotas públicas `/`, `/api/` → match prefixo no backend.
  4. Lookup IP via `https://ip-api.com/json/{ip}?fields=status,countryCode,country,lang` → só se nenhum dos 3 acima der match, cacheado 24h; se VPN mudar IP, só esse sinal falha, os outros 3 já acertam.
- Em todos os casos, seleção manual do usuário na UI SOBRESCREVE heurísticas e persiste imediatamente (salva em localStorage + user.settings quando logado).

**FR-3 — Localidade Suportadas v1**
- `pt-BR` (Português do Brasil, fallback padrão)
- `en-US` (Inglês Americano)
- `es-ES` (Espanhol — serve também ES-LatAm com formato ptbr-ish)
- Cada locale mapeia para:
  - `code` completo (ex: `pt-BR`)
  - `intl_date` Intl.DateTimeFormat locale (ex: `pt-BR`)
  - `intl_currency` locale para formatar BRL em diferentes convenções (ex: `en-US` → `BRL 7.90`, `pt-BR` → `R$ 7,90`, `es-ES` → `7,90 BRL`)
  - `stt_lang` OpenAI STT: `"pt" | "en" | "es"`
  - `tts_voice_map_by_persona_gender` — M/F → voz OpenAI por idioma (ex: EN: mature M = onyx, mature F = nova; ES: M = onyx, F = shimmer)

**FR-4 — Tradução da UI (i18n Frontend)**
- Solução sem biblioteca pesada: `src/i18n/pt-BR.json`, `src/i18n/en-US.json`, `src/i18n/es-ES.json` + `I18nProvider` React em `src/i18n/I18nContext.jsx`.
- Hook `useTranslation()` retorna `{ t, locale, setLocale, locales }`. Função `t(key, params?)` retorna string traduzida; se chave faltar no locale ativo, faz fallback para `pt-BR.json`; se também faltar, retorna a própria `key` como string (nunca quebra UI).
- Interpolação de parâmetros com chaves `{nome_variavel}`. Ex: `t("planos.msg_usadas_hoje", {usadas: 3, limite: 10})`.
- Todas as páginas, componentes e mensagens de toast hardcoded hoje em PT devem ser extraídas para o dicionário. Cobertura mínima v1: 95% de strings visíveis ao usuário (logs do console e código interno podem ficar em PT por enquanto).
- Componentes mantêm 100% estilo visual existente (variáveis CSS, bordas, fontes, espaçamentos).

**FR-5 — Locale no Backend e Respostas IA**
- Backend deve resolver locale ativo para o request, na seguinte prioridade:
  1. (Logado) `user.settings.locale` salvo no BD.
  2. Header `X-Locale: pt-BR|en-US|es-ES` enviado pelo frontend (axios interceptor).
  3. Cookie `aurelio_locale` HttpOnly (opcional, pode pular).
  4. Header `Accept-Language` do HTTP.
  5. Fallback final: `pt-BR`.
- Função `resolve_locale(request, user?)` → retorna `code`, `stt_lang`, `intl_date`, `intl_currency`.
- **System prompt LLM**: injetar linha "You must answer in <language_name>. Respond only in <language_name>, no matter what language the user writes in." (ou equivalente em PT/ES) **em segundo lugar**, logo abaixo da identidade do Aurélio — sem alterar o núcleo da personalidade.
- **Reflexão diária** (`REFLECTION_SYSTEM_PROMPT`): mesmo tratamento, versão por idioma.
- **STT (reconhecimento de voz)**: parâmetro `language` do `_stt.transcribe()` = `stt_lang` do locale ativo do usuário.
- **TTS (voz do Aurélio)**: mapa `tts_voice_map` por locale → para cada persona/gender usar voz OpenAI apropriada que soa natural no idioma.

**FR-6 — Formatação (datas e moedas)**
- Funções utilitárias frontend (em `utils.js`) para serem usadas SEMPRE em vez de strings hardcoded:
  - `formatDate(iso, locale?)` → `toLocaleDateString` do locale correto.
  - `formatCurrencyBRL(value, locale?)` → sempre moeda BRL, mas formato muda por locale.
- Backend não altera preços: planos custam sempre R$ 0, R$ 7,90, R$ 19,90 em BRL. Apenas formatador muda.

**FR-7 — Persistência e Sync**
- **Não logados**: ao selecionar idioma, grava `localStorage.aurelio_locale` (expira nunca) e dispara também `document.cookie` (para backend ler em rotas públicas). Frontend axios interceptor manda `X-Locale` com locale ativo.
- **Logados**: ao selecionar idioma, chama `PATCH /api/auth/settings` endpoint já existente com `locale: <code>` (campo novo dentro de `settings` do usuário); em paralelo atualiza localStorage para coerência. Ao trocar dispositivo e entrar com mesma conta, idioma permanece.

**FR-8 — Emails do Sistema Traduzidos**
- Templates HTML de email já existentes: `build_subscription_email_html()` em server.py.
- Adicionar mapas de strings por idioma (assunto, corpo, botão) e usar locale salvo do usuário (`user.settings.locale` → fallback `pt-BR`) para escolher o texto.
- Avisos de vencimento (5/3/1 dias), confirmação de pagamento, cancelamento — todos traduzidos.

**FR-9 — Não quebra retrocompatibilidade / fluxos existentes**
- Login email/senha, Login Google, registro, streaming chat SSE, rotina diária de planos, manutenção, checkout Pagamento, Meu Plano, Notificação Sininho, Sidebar existente — tudo continua funcionando, agora só com strings trocadas.
- Usuários existentes sem `settings.locale` no banco: considerado `pt-BR` implicitamente (não precisa de migração batch; resolução dinâmica já lida).
- Testes `test_aurelio_api.py` existentes continuam passando (requests default Accept-Language PT ok).

## Non-Functional Requirements
- **NFR-1 (Estilo Visual Rígido)**: Seletor de idioma, painéis, botões, toasts, modais — 100% usando `--terracotta`, `--bg-card`, `--border-accent`, `font-serif-display`, `rounded-full`/`rounded-2xl`/`rounded-3xl`. Nenhum hex novo, nenhuma fonte nova.
- **NFR-2 (Performance)**: Lookup IP só roda quando **nenhuma** das heurísticas de browser/acess-language acertar. Quando roda, cache 24h em `localStorage` e também no backend `_IP_CACHE` dict + TTL.
- **NFR-3 (Latência i18n)**: Provider de tradução carrega locale JSON dinamicamente por `import()` quando usuário muda idioma (não enche o bundle de todos os 3 idiomas no primeiro paint). Fallback PT-BR carregado sempre (menor latência inicial).
- **NFR-4 (Segurança)**: Header `X-Locale` validado contra whitelist `["pt-BR", "en-US", "es-ES"]` antes de usar no backend; nenhum locale arbitrário passa.
- **NFR-5 (Privacidade)**: Lookup IP não armazena IP pessoal no banco do usuário; só guarda `countryCode` temporariamente em cache e descarta. Conformidade básica com LGPD/GDPR (usuário pode "negar" a detecção automática ao escolher manualmente — na prática, a escolha manual simplesmente desliga as heurísticas).
- **NFR-6 (Convenções do Projeto)**: Sempre usar singleton `_httpx_client` para request externo (ip-api). Manter `React.memo` nas listas da Sidebar, Mensagens. Não alterar fluxo SSE.
- **NFR-7 (Qualidade das traduções)**: Tradução para EN-US e ES-ES NÃO pode ser literal Google Translate — manter tom maduro e elegante, não robótico. Coerência terminológica: "amadurecimento" traduz como "maturation" (EN) e "amadurecimiento" (ES); "mentor" = "mentor" em todos; "reflexão diária" = "daily reflection" / "reflexión diaria".

## Constraints
- **Técnicas**:
  - Frontend React existente, hooks; sem `react-i18next` (solução caseira leve).
  - Backend FastAPI/Pydantic v2/Motor async.
  - i18n JSON dict files; não gettext/.po.
  - STT/TTS OpenAI via emergent key existente.
  - Ip-api.com free tier (não precisa key); fallback se request falhar = ignora sinal de IP, usa heurísticas 1 e 2.
- **Negócio**:
  - Nomes de personas: Aurélio, Clara, Lua, Marco, Marina — preservados.
  - Tom maduro/elegante preservado; não casual, não gíria.
  - Moeda sempre BRL. Cobrança só via gateways já existentes.
- **Dependências**:
  - Externas: ip-api.com free tier; OpenAI (LLM/TTS/STT); gateways de pagamento já configurados.
  - Internas: `settings.voice_id` existente, `AuthContext`, `PricingPlans.jsx`, `CheckoutModal.jsx`, `Sidebar.jsx`, `MyPlan.jsx`, `Chat.jsx`.

## Assumptions
- Traduções de qualidade (EN/ES) serão escritas manualmente no spec/implementação — não rodar Google Translate direto em strings (pode soar artificial).
- Serviço ip-api.com tem limite free ~45 req/min por IP; cache TTL 24h evita bater rate limit.
- OpenAI vozes `onyx / nova / shimmer / echo / alloy / fable` soam naturais em EN/ES e PT.
- Frontend consegue fazer `import.meta.glob` ou `import()` lazy para JSONs de tradução (Create React App / Craco suporta).
- Usuários logados em múltiplos dispositivos: se trocarem idioma em um, outro device ao fazer request vai pegar `user.settings.locale` no backend e frontend deve sincronizar via `refreshMe()` / novo `refreshLocale()` no AuthContext.

## Open Questions
- Nenhuma. Respostas das perguntas de clarificação user estão refletidas neste spec.

---

## Acceptance Criteria

### AC-1: Seletor de idioma existe em 3 pontos e troca UI sem refresh
- **Type**: `rule`
- **Given**: Usuário acessa landing, auth ou sidebar (logado).
- **When**: Usuário clica no seletor e escolhe "English" ou "Español".
- **Then**: Toda a interface (menus, botões, títulos, toasts, Meu plano, PricingPlans, CheckoutModal) aparece no idioma escolhido, sem recarregar a página. Fallback: se faltar uma chave em EN/ES, usa texto PT-BR correspondente sem quebrar.
- **Pass Condition**: Troca em < 200ms e nenhum elemento visível permanece em idioma errado após troca (exceto mensagens do chat já enviadas).
- **Evidence**: Screenshot da landing e do Chat em EN e ES após toggle; gravação de tela da troca sem refresh.

### AC-2: Heurística deteta idioma correto mesmo com VPN
- **Type**: `rule`
- **Given**: Usuário nunca escolheu idioma manualmente (localStorage vazio, sem conta logada).
- **When**: (a) Browser em EN-US + VPN IP no Brasil, (b) Browser em PT-BR + VPN IP na Alemanha, (c) Browser em ES-ES.
- **Then**: Idioma escolhido pela heurística é o do browser/Accept-Language — sinal de IP não interfere. Resultado final: (a) EN, (b) PT, (c) ES.
- **Pass Condition**: Todos os 3 casos retornam idioma correto, sem lookup IP no caso (a) e (b) porque já bateu navigator.language.
- **Evidence**: console.log mostrando ordem dos sinais e resultado final; `window.navigator.language` confirmado.

### AC-3: Escolha manual do usuário vence heurísticas e persiste no BD (logado)
- **Type**: `rule`
- **Given**: Usuário logado, browser em PT-BR, escolhe manualmente EN-US.
- **When**: Desloga, fecha navegador, entra novamente na mesma conta.
- **Then**: Idioma permanece EN-US (vindo de user.settings.locale), independentemente do browser.
- **Pass Condition**: campo `settings.locale` no MongoDB do usuário = `en-US` e UI carrega EN no login.
- **Evidence**: Registro no banco `users.settings.locale` salvo; UI após novo login mostra EN.

### AC-4: Respostas do chat e system prompt no idioma selecionado
- **Type**: `rule`
- **Given**: Usuário setou locale para EN-US.
- **When**: Envia mensagem qualquer (até mesmo em PT: "oi") e clica no play da voz depois.
- **Then**: Resposta da LLM em INGLÊS coerente com tom Aurélio maduro/elegante. TTS gera áudio em voz natural inglesa, não PT-acentado. STT do voice input reconhece inglês.
- **Pass Condition**: Repetido 2x em EN e 2x em ES. Nenhuma resposta sai em PT quando locale é EN/ES.
- **Evidence**: 4 screenshots e áudios.

### AC-5: Reflexão diária no idioma ativo do usuário
- **Type**: `rule`
- **Given**: Usuário locale = ES-ES, dia corrente 2026-09-22.
- **When**: Abre diário/reflexão diária.
- **Then**: Reflexão gerada pelo sistema está em espanhol, mesma personalidade.
- **Pass Condition**: `daily_reflections` do dia tem texto em ES.
- **Evidence**: Texto da reflexão no endpoint GET.

### AC-6: Formatação de data e moeda por locale (BRL sempre, formato muda)
- **Type**: `rule`
- **Given**: Planos com preço 7.9, data "2026-09-22T12:00:00Z".
- **When**: Visualiza PricingPlans / Meu plano em (a) PT-BR, (b) EN-US, (c) ES-ES.
- **Then**: (a) "R$ 7,90" + "22/09/2026", (b) "BRL 7.90" + "09/22/2026", (c) "7,90 BRL" + "22/09/2026".
- **Pass Condition**: Todos os 3 formatos batem com especificação acima em qualquer tela.
- **Evidence**: Screenshot PricingPlans e MeuPlano nos 3 idiomas.

### AC-7: Emails de pagamento traduzidos (locale do user)
- **Type**: `rule`
- **Given**: Usuário com settings.locale = en-US ativa plano Fundador via Pix confirmado (webhook).
- **When**: `activate_subscription` dispara email.
- **Then**: Assunto e corpo do `build_subscription_email_html()` em INGLÊS, mantendo cores/template do email.
- **Pass Condition**: String subject não contém "Assinatura" ou "ativada" em PT; contém "Subscription" e "activated".
- **Evidence**: HTML do email renderizado; subject line no log do servidor.

### AC-8: Usuários existentes sem locale = PT-BR por padrão (migração zero)
- **Type**: `rule`
- **Given**: Usuário antigo no BD sem campo settings.locale.
- **When**: Faz login pela primeira vez após deploy da feature.
- **Then**: Interface em PT-BR; nenhum erro. Ao escolher novo idioma e salvar, atualiza settings.locale no BD.
- **Pass Condition**: Backend não 500; `resolve_locale` retorna pt-BR default.
- **Evidence**: Request /auth/me sem locale salvo retorna PT + UI em PT.

### AC-9: Nenhum erro visual/estrutural contra identidade do Aurélio
- **Type**: `rubric`
- **Dimension**: Fidelidade visual ao design existente após internacionalização
- **Scale**: 0-5
- **Anchors**: 0 = quebrou layout, cores, fontes em pelo menos uma tela; 3 = 90% certo, só algumas bordas/espaços 1px diferentes; 5 = seletor e textos novos parecem ter sido parte do Aurélio desde o primeiro dia — mesma estética, mesmo nível visual, nenhum elemento destoante.
- **Pass Threshold**: >= 4
- **Evidence**: Comparação visual lado a lado (PT base vs EN/ES) de Landing, Auth, Chat, Meu plano, Sidebar, PricingPlans, CheckoutModal.

### AC-10: Qualidade semântica das traduções EN-US e ES-ES
- **Type**: `rubric`
- **Dimension**: Naturalidade, tom maduro/elegante, coerência terminológica (não robótico, não Google Translate)
- **Scale**: 0-5
- **Anchors**: 0 = traduções literais, gírias, quebra tom; 3 = corretas gramaticalmente mas ocasionalmente soam mecânicas; 5 = traduções soam nativas, tom maduro/elegante igual PT, terminologia consistente.
- **Pass Threshold**: >= 4
- **Evidence**: Revisão humana dos JSONs EN/ES; revisão resposta de chat exemplo EN/ES.
