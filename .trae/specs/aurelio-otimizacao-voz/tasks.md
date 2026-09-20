# Tasks — Otimização Aurélio + Voz

Artefato de implementação. Cada tarefa mapeia para um ou mais Critérios de Aceitação (AC) do `spec.md`.

---

## Task 1: Backend — httpx singleton + pool de conexões

**Status**: pending
**Priority**: high
**AC coberto**: AC1
**Arquivos**: `backend/server.py`

### Descrição
Substituir criação ad-hoc de `httpx.AsyncClient` dentro de handlers (routes `/auth/session` e `/auth/google`) por um cliente singleton reutilizável em nível de módulo.

### Passos
1. Criar `_httpx_client` em nível de módulo usando `httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0), limits=httpx.Limits(max_connections=50, max_keepalive_connections=20))`
2. No evento `startup`, inicializar explicitamente (se necessário)
3. No evento `shutdown`, chamar `await _httpx_client.aclose()`
4. Refatorar `/auth/session` para usar `_httpx_client.get(...)`
5. Refatorar `/auth/google` (duas chamadas) para usar `_httpx_client.get(...)`
6. Remover imports locais e `async with httpx.AsyncClient` redundantes

### TR1 (rule): Cliente singleton existe em nível de módulo
- Evidência: grep por `_httpx_client = httpx.AsyncClient` em server.py

### TR2 (rule): Nenhum handler cria AsyncClient novo por requisição
- Evidência: grep por `AsyncClient(timeout` retorna vazio

### TR3 (rule): Shutdown fecha cliente httpx
- Evidência: `shutdown_db_client` chama `await _httpx_client.aclose()` antes de `client.close()`

---

## Task 2: Backend — Cleanup de memória + índices

**Status**: pending
**Priority**: high
**AC coberto**: AC1
**Arquivos**: `backend/server.py`

### Descrição
Reduzir retenção de memória e acelerar queries frequentes.

### Passos
1. Em `generate_reply`, trocar `await asyncio.sleep(90)` por `await asyncio.sleep(30)` antes de `_live.pop`
2. Adicionar índice composto no startup:
   ```python
   await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
   ```
3. Em `list_conversations`: usar projeção mínima OK (já sem _id: 0); manter como está.
4. Em `get_conversation`: messages já tem projeção `{"_id": 0}`, manter.
5. Adicionar `gc.collect()` opcional em shutdown não necessário; não adicionar.
6. Garantir que `_tasks.discard` em callback está adequado (já existe — validar).

### TR1 (rule): Cleanup _live timeout 30s
- Evidência: linha `await asyncio.sleep(30)` antes de `_live.pop`

### TR2 (rule): Índice composto existe
- Evidência: `create_index([("conversation_id", 1), ("created_at", 1)])` em startup event

---

## Task 3: Backend — Voz mais humana (velocidades + clean_for_tts)

**Status**: pending
**Priority**: high
**AC coberto**: AC2, AC3
**Arquivos**: `backend/server.py`

### Descrição
Ajustar velocidades e limpeza de texto para TTS soar mais natural.

### Passos
1. Atualizar `AVAILABLE_VOICES` speeds:
   - male_mature / onyx: speed 0.86 → **0.84**
   - female_serene / shimmer: speed 0.90 → **0.92**
   - female_warm / nova: speed 0.88 → **0.90**
   - male_confident / echo: speed 0.90 → **0.88**
2. Melhorar `clean_for_tts`:
   - Preservar reticências `...` (não remover pontos excessivos, apenas pontuação duplicada >2)
   - Trocar regex `([!?.])\1+` por `([!?])\1+` → manter `...` intacto
   - Adicionar: `text = text.replace("/", " ou ")` (após remoção de URLs)
   - Converter hífens isolados `-` em vírgula para pausa (e não remover completamente)
   - Manter tratamento de `;` → `,`
   - Antes do strip final: garantir que não há espaços antes de vírgulas/pontos
3. Validar que `build_system_prompt` sempre é chamado com persona/gender corretos

### TR1 (rule): Velocidades ajustadas
- Evidência: grep speeds em AVAILABLE_VOICES correspondem aos valores acima

### TR2 (rule): clean_for_tts preserva reticências e trata "/"
- Evidência: função atualizada contém as regras acima (teste com texto `...` deve retornar `...`)

---

## Task 4: Backend — Garantir voz feminina aplicada em TODOS os fluxos

**Status**: pending
**Priority**: high
**AC coberto**: AC3
**Arquivos**: `backend/server.py`

### Descrição
Auditar e garantir que em nenhum ponto cai em voz padrão sem consultar o usuário.

### Passos
1. `get_or_create_reflection()`: o texto da reflexão atualmente usa `AURELIO_SYSTEM_PROMPT` hardcoded (gênero masculino). **Corrigir**:
   - Refatorar: gerar reflection apenas no endpoint (com contexto de user voice_id) ou gerar texto neutro (embora o endpoint de áudio use a voz correta, o TEXTO da reflexão é compartilhado e não pode ser personalized por usuário — OK manter texto genérico).
   - Ajuste aceitável: no REFLECTION_PROMPT, remover referências de gênero que conflitem. Hoje diz "Escreva a Reflexão do Dia de Aurélio". Tornar genérico: "Escreva a Reflexão do Dia do seu mentor(a) estoico(a)..." ou simplesmente manter nome neutro. **Alternativa melhor**: reflection sem nome personalizado no texto.
2. Verificar endpoints:
   - `/chat` → usa `vc = await get_user_voice_config(user["id"])` → OK
   - `/chat/start` → idem → OK
   - `/voice` → idem → OK
   - `/tts` → tem fallback para user config → OK
   - `/messages/{id}/audio` → user config → OK
   - `/messages/{id}/audio/stream` → user config → OK
   - `/reflection/today/audio` → user config → OK
3. Validar `build_system()` recebe `voice_id` correto do user em todas as chamadas de `start_turn` (sim, parâmetro `voice_id` propagado)

### TR1 (rule): Reflection prompt neutro (sem gênero fixo)
- Evidência: REFLECTION_PROMPT atualizado para não forçar gênero masculino no texto

### TR2 (rule): Nenhum DEFAULT_VOICE_ID usado sem fallback a user config em endpoints autenticados
- Evidência: revisão manual de todos os endpoints com `Depends(get_current_user)` → todos usam `get_user_voice_config`

---

## Task 5: Frontend — Memoização e cleanup de recursos

**Status**: pending
**Priority**: high
**AC coberto**: AC5
**Arquivos**:
- `frontend/src/lib/useTTS.js`
- `frontend/src/components/MessageBubble.jsx`
- `frontend/src/pages/Chat.jsx`
- `frontend/src/pages/Landing.jsx`

### Descrição
Memoizar componentes puros, limpar URLs de áudio corretamente, memoizar arrays estáticos.

### Passos
1. **useTTS.js** — Adicionar cleanup de cache no unmount do hook:
   - Usar `useEffect` com return function que revoga todas as URLs do `cache.current`
2. **MessageBubble.jsx** — Envolver export com `React.memo(MessageBubble)` (comparação rasa)
3. **Chat.jsx**:
   - Extrair `SUGGESTIONS`, `STATUE` (já fora, OK) — estão fora do componente; manter.
   - `STATUE`, `draftKey`, etc. fora → OK.
   - Confirmar SUGGESTIONS fora do componente → sim (linha 22).
4. **Landing.jsx**:
   - `PILLARS`, `STATUE`, `STATUE2`, `DEMO_LINE` estão fora do componente → OK.
5. **Sidebar.jsx** (se existir) — memoizar itens de lista internamente se necessário.

### TR1 (rule): useTTS revoga URLs no unmount
- Evidência: `useEffect(() => () => { /* revoke all URLs */ }, [])` no hook useTTS

### TR2 (rule): MessageBubble exporta com memo
- Evidência: `export const MessageBubble = React.memo(...)` ou `export default React.memo(MessageBubble)`

---

## Task 6: Frontend — Validar navegação e fluxos de configuração (funcionalidade existente)

**Status**: pending
**Priority**: medium
**AC coberto**: AC4
**Arquivos**:
- `frontend/src/pages/Chat.jsx`
- `frontend/src/pages/Auth.jsx`
- `frontend/src/components/VoiceSettingsDialog.jsx`

### Descrição
Verificar que as funcionalidades solicitadas já estão implementadas e funcionais. Ajustar apenas se houver bugs. Não alterar visual.

### Passos
1. **Chat.jsx Home button**: linha ~388 → `<Home size={16} />` + `navigate("/")`. Validar que existe e está visível (header esquerdo, ao lado do menu hamburguer). **Status: já implementado.**
2. **Chat.jsx Settings button**: linha ~415 → `<Settings size={16} />` + `setVoiceSettingsOpen(true)`. **Status: já implementado.**
3. **VoiceSettingsDialog**:
   - Busca vozes via `/api/voices` → OK
   - Separa maleVoices / femaleVoices → OK
   - Play demo por voz → OK
   - Salvar chama onSave → OK
   **Status: já implementado.**
4. **Auth.jsx pós-cadastro**:
   - `register()` → `setPendingUser(user)` → `setShowVoiceSetup(true)` → OK
   - `submitGoogle()` → mesmo fluxo → OK
   - VoiceSettingsDialog é renderizado com onSave → saveVoice → updateSettings + navigate("/chat") → OK
   - Botão "Pular por enquanto" chama goToChat → OK
   **Status: já implementado.**
5. **Nenhum ajuste visual permitido**; apenas correções de bug se houver.

### TR1 (rule): Elementos UI existem e tem data-testids/aria-labels corretos
- Evidência:
  - Chat contém botão com aria-label "Voltar para a página inicial"
  - Chat contém botão com data-testid "chat-voice-settings-button"
  - Auth contém VoiceSettingsDialog após registro

---

## Task 7: Verificação final + testes

**Status**: pending
**Priority**: high
**AC coberto**: AC1, AC2, AC3, AC4, AC5
**Arquivos**: todos os modificados

### Descrição
Rodar testes, checar lint/diagnostics, confirmar que nada quebrou.

### Passos
1. Rodar testes backend: `cd backend && pytest tests/` (se houver)
2. Rodar build frontend: `cd frontend && npm run build` ou `yarn build`
3. Verificar diagnostics VSCode para JSX/Python (GetDiagnostics)
4. Confirmar que não houve alteração visual no CSS / classes tailwind
5. Checklist de AC:
   - AC1 ✓ httpx singleton, timeout 30s, índices
   - AC2 ✓ speeds + clean_for_tts
   - AC3 ✓ reflection neutro + todos endpoints consultam user voice
   - AC4 ✓ elementos UI revisados
   - AC5 ✓ memoização + cleanup

### TR1 (rule): Backend tests passam
- Evidência: saída pytest sem erros

### TR2 (rule): Frontend builda sem erros
- Evidência: `npm run build` exit code 0

### TR3 (rule): Diagnostics limpos (sem novos erros)
- Evidência: GetDiagnostics não reporta novos erros TypeScript/Python
