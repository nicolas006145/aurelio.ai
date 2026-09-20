# Especificação: Otimização Backend + Frontend e Melhorias de Voz

## Problema
O projeto Aurélio é um mentor de amadurecimento com interface web (React) e API (FastAPI). O usuário solicita:
1. Otimização geral de backend e frontend **sem alterar o visual**
2. Botão no chat para voltar à tela inicial (Landing)
3. Voz mais humana/natural
4. Tela de configuração do bot após cadastro
5. Voz feminina configurável e realmente utilizada em todos os fluxos
6. Botão de engrenagem no chat para configurar voz

## Usuários
- Usuários finais do aplicativo web Aurélio

## Objetivos
- Melhorar performance e eficiência de backend e frontend sem mudar UI
- Garantir que todas as vozes (masculina e feminina) sejam funcionais e usadas consistentemente
- Garantir funcionamento das funcionalidades de navegação e configuração

## Não Objetivos
- Redesenhar UI/UX visual
- Mudar esquema de cores, fontes ou layout
- Alterar a persona do Aurélio (exceto ajustes de voz/gender para vozes femininas)
- Adicionar novas features não relacionadas às solicitações

---

## Requisitos Funcionais (RF)

### RF1 — Otimização Backend
- **rule**: Usar cliente httpx com pool de conexões reutilizável em vez de criar `AsyncIOMotorClient` novos por requisição (auth Google, session Emergent)
- **rule**: Criar cliente httpx singleton em nível de módulo com timeout e limites de conexão
- **rule**: Garantir cleanup das tasks async pendentes em `_tasks` após erros
- **rule**: Limpeza preventiva do dicionário `_live` com timeout menor (90s é muito longo; usar 30s)
- **rule**: Adicionar projection (campos específicos) em consultas MongoDB onde possível para reduzir transferência
- **rule**: Manter todos os índices existentes; adicionar índice composto em `messages(conversation_id, created_at)`

### RF2 — Voz mais humana
- **rule**: Ajustar velocidades padrão das vozes para maior naturalidade:
  - male_mature (onyx): 0.84 → ainda grave e pausado, mas menos lento
  - female_serene (shimmer): 0.92 → mais natural
  - female_warm (nova): 0.90 → equilibrado
  - male_confident (echo): 0.88 → profundo e natural
- **rule**: Melhorar `clean_for_tts` para:
  - Inserir vírgula/pausa após emojis ou caracteres especiais removidos
  - Preservar reticências como indicativo de pausa
  - Substituir `/` por ` ou ` para TTS ler corretamente
  - Adicionar pequena pausa (vírgula) após ponto e vírgula quando apropriado
- **rule**: System prompt ajusta dinamicamente o nome e gênero do mentor (já existe via `build_system_prompt` — **validar** que é aplicado em TODOS os fluxos)

### RF3 — Voz feminina utilizável em todos os fluxos
- **rule**: `get_or_create_reflection()` deve usar a voz configurada do usuário (já usa `get_user_voice_config` via endpoint `/reflection/today/audio` — **validar** que reflection em texto também menciona o nome correto do mentor/a)
- **rule**: `build_system()` sempre recebe `voice_id` e aplica nome/gênero corretos no system prompt
- **rule**: Todos os endpoints de voz (`/voice`, `/tts`, `/messages/{id}/audio`, `/reflection/today/audio`) sempre consultam `get_user_voice_config(user_id)` e não usam DEFAULT hardcoded sem fallback correto

### RF4 — Botão voltar no Chat
- **rule**: Botão Home (ícone casa) no header esquerdo do Chat já existe; **validar** que o clique navega para "/" e confirma visualmente que está presente
- **rule**: O botão deve manter o estilo visual existente (não alterar aparência)

### RF5 — Configuração após cadastro
- **rule**: Fluxo já implementado no Auth.jsx (após register/login com Google, exibe VoiceSettingsDialog). **Validar** que:
  - Diálogo aparece imediatamente após criar conta
  - Salvar a voz chama `updateSettings` e navega para /chat
  - Botão "Pular por enquanto" também navega para /chat
- **rule**: Register endpoint já aceita `voice_id`; se fornecido, usar como configuração inicial (já existe)

### RF6 — Botão de engrenagem no Chat
- **rule**: Botão Settings já existe no header direito do Chat. **Validar** que:
  - Abre VoiceSettingsDialog com vozes listadas
  - Listagem separa vozes femininas e masculinas
  - Cada voz tem botão de demo funcional
  - Salvar atualiza `user.settings.voice_id` e atualiza `personaName` no Chat sem reload

### RF7 — Otimização Frontend
- **rule**: Memoizar componentes puros com `React.memo` onde há re-renders desnecessários:
  - `MessageBubble`
  - `Sidebar` (ou item interno de conversa)
- **rule**: Limpar corretamente URLs criadas com `URL.createObjectURL` no `useTTS` quando o hook desmonta (não apenas quando clearCache chamado)
- **rule**: Usar `useMemo` para `STATUE`, `SUGGESTIONS`, `PILLARS` e outros arrays/objetos estáticos
- **rule**: Adicionar `AbortController` em chamadas fetch/axios passíveis de cancelamento ao trocar de conversa rapidamente

---

## Requisitos Não Funcionais (RNF)

### RNF1 — Performance
- **rubric**: Latência percebida no chat (enviar mensagem até primeiros tokens streamados) — escala 0-2
  - 0: sem melhoria perceptível
  - 1: pequena melhora (~10-15% mais rápido)
  - 2: melhora clara (~20%+) com pooling httpx e projections
  - **threshold ≥ 1**
- **rubric**: Consumo de memória do servidor após 50 requisições TTS simultâneas — escala 0-2
  - 0: acúmulo sem limpeza (crescimento > 150MB)
  - 1: limpeza parcial (crescimento ~80-150MB)
  - 2: limpeza consistente de _live, cache, tasks (crescimento < 80MB)
  - **threshold ≥ 1**

### RNF2 — Qualidade de voz (humanidade)
- **rubric**: Naturalidade da fala ao ouvir uma frase de ~50 palavras — escala 0-3
  - 0: robótica, artificial, com glitches
  - 1: compreensível mas pouco natural
  - 2: boa naturalidade, humano suficiente para conversa
  - 3: muito natural, quase indistinguível de gravação humana
  - **threshold ≥ 2**
- **rule**: Todas as 4 vozes (2F + 2M) devem gerar áudio demo sem erro via `/tts/demo?voice_id=...`

### RNF3 — Estabilidade visual
- **rule**: Nenhuma mudança visual perceptível: cores, layout, fontes, espaçamentos, ícones permanecem idênticos
- **rule**: Todos os data-testids existentes continuam funcionando (sem quebrar testes E2E)

### RNF4 — Compatibilidade
- **rule**: Usuários existentes com voice_id configurado continuam tendo sua voz respeitada
- **rule**: Usuários sem configuração (default) continuam usando male_mature como padrão

---

## Dependências
- OpenAI TTS (tts-1-hd) disponível via EMERGENT_LLM_KEY
- MongoDB acessível via MONGO_URL
- React + FastAPI stack existente

## Assumptions
- As vozes OpenAI (onyx, shimmer, nova, echo) estão disponíveis e produzem áudio em pt-BR com qualidade aceitável
- Nenhum asset visual precisa ser adicionado/removido
- A API `/api/voices` já retorna as 4 vozes corretamente

## Perguntas em aberto (resolvidas via inspeção)
- Botão Home existe? SIM (Chat.jsx linha ~388)
- Botão Settings (engrenagem) existe? SIM (Chat.jsx linha ~415)
- Setup pós-cadastro existe? SIM (Auth.jsx VoiceSettingsDialog)
- Vozes femininas existem no backend? SIM (female_serene + female_warm)
- Voz configurada é usada em reflection audio? SIM (server.py linha ~979)

---

## Critérios de Aceitação (AC)

### AC1 (rule) — Backend otimizado
- [ ] Cliente httpx singleton criado em nível de módulo
- [ ] Cleanup de _live após 30s (reduzido de 90s)
- [ ] Índice composto messages(conversation_id, created_at) criado no startup
- [ ] Projections aplicados em consultas Mongo frequentemente usadas (list_conversations, get_conversation)
- [ ] Tasks async com erro são removidas de `_tasks` via done_callback (já existe — validar)

### AC2 (rule) — Voz mais humana
- [ ] Velocidades ajustadas conforme RF2
- [ ] clean_for_tts melhora: reticências preservadas, "/"→" ou ", limpeza mais inteligente
- [ ] System prompt usa build_system_prompt com persona_name/gender corretos em chat/voice/reflection

### AC3 (rule) — Voz feminina funcional em todos os fluxos
- [ ] GET `/api/voices` retorna 2 vozes femininas e 2 masculinas
- [ ] POST `/tts` com `{text, voice_id: "female_serene"}` retorna áudio 200
- [ ] GET `/messages/{id}/audio` de um usuário com voz feminina configurada usa a voz correta
- [ ] GET `/reflection/today/audio` usa a voz do usuário configurada
- [ ] Resposta em chat usa o nome da persona (Clara/Lua) no system prompt quando voz feminina

### AC4 (rule) — Navegação e configuração
- [ ] Botão Home no Chat → ao clicar navega para "/"
- [ ] Botão Settings no Chat → abre diálogo com vozes femininas visíveis e demo funcional
- [ ] Cadastro novo → diálogo de voz aparece, salvar funciona, pular funciona

### AC5 (rule) — Frontend otimizado, sem mudanças visuais
- [ ] MessageBubble usa React.memo com comparação rasa
- [ ] useTTS revoga URLs de objeto no cleanup do hook (useEffect return)
- [ ] Arrays constantes memoizados com useMemo ou extraídos para fora do componente
- [ ] Snapshot visual: espaçamentos, cores, ícones idênticos ao anterior (verificação manual por Reviewer)
