# Melhoria Chat + Escrita + Vozes Reais — Implementation Plan

## Repository Research

### Causas do "chat picotando falas" (confirmadas por inspeção):

1. **Backend relay_stream polling excessivo**: `await asyncio.sleep(0.04)` a cada 40ms envia evento vazio repetidamente enquanto aguarda deltas do LLM. Isso cria ruído no SSE e causa re-renders excessivos, onde o frontend recebe `delta: ""` ou `delta: " "` repetidamente, dando a impressão de fala picotada/interrompida.

2. **Backend não agrupa deltas pequenos**: O streaming do LLM pode gerar 1-2 caracteres por evento (palavras picotadas), e o backend repassa cada pedaço imediatamente sem agrupamento inteligente por palavra/fragmento maior.

3. **Frontend consumeSSE sem debouncing**: Cada evento delta (mesmo com 1 caractere) dispara `setMessages` imediatamente, re-renderizando todos os componentes da árvore repetidamente.

### Causas de escrita robotizada/genérica:

4. **System prompt tem instrução de resposta curta** (2-4 parágrafos curtos) mas sem orientação de ritmo variado, conectivos naturais, voz ativa, diálogo interno simulado.

5. **Falta de orientação de persona mais humana**: Incluir micro-pausas naturais (vírgulas, reticências), começar frases com conectivos variados ("Olha...", "Sabe o que eu acho?", "A verdade é que..."), evitar tom preachy.

### Causas de voz menos natural:

6. **Velocidades não calibradas individualmente ao máximo**: OpenAI onyx/shimmer/nova/echo têm caracterísitcas diferentes; 0.84-0.92 é bom mas pode ser afinado mais.
7. **tts-1-hd está OK** mas clean_for_tts pode ser mais agressivo em inserir pausas (vírgulas, pontos) em locais estratégicos para a voz não "correr" tudo junto.
8. **Falta de normalização de números/abreviações** em clean_for_tts: Ex: "15min" vira "quinze min", "vc" vira "você" etc — faz TTS ler mais natural.

## Files and Modules

- `backend/server.py`: relay_stream, build_system_prompt, AVAILABLE_VOICES speeds, clean_for_tts
- `frontend/src/lib/sse.js`: consumirSSE com batching
- `frontend/src/pages/Chat.jsx`: streaming handler com microdebouncing

## Implementation Steps

1. **Backend: relay_stream menos frequente e com skip de delta vazio**
   - Trocar sleep de 0.04 para 0.12ms (120ms): eventos menos frequentes
   - Só emitir `delta` SE realmente houve crescimento no conteúdo; caso contrário, não enviar evento vazio (economia banda + menos re-renders)
   - Acumular deltas até formar pelo menos ~2-3 palavras (ou ~10 chars) antes de enviar, exceto se for done/error.

2. **Backend: Melhorar build_system_prompt para escrita mais humana**
   - Adicionar instruções de ritmo variado (frases de 5, 15, 25 palavras intercaladas), conectivos reais ("O ponto crucial é...", "Não é um julgamento, mas..."), micro-pausas com reticências.
   - Tom de conversa, não de palestra: começar algumas respostas com "Veja bem...", "Escuta...", "A realidade é que...".
   - Evitar tom "coach motivacional" excessivo; ser direto mas caloroso.
   - Explicitamente pedir: "Não divida o texto em listas numéricas nem bullet points. Escreva como fala natural: parágrafos com conectivos."

3. **Backend: Vozes mais reais (speeds calibrados + clean_for_tts melhorado)**
   - Ajustar velocidades:
     - onyx (Aurélio) 0.84 → **0.82** (voz mais grave e pausada fica MAIS natural mais lenta)
     - shimmer (Clara) 0.92 → **0.95** (shimmer soa artificial em velocidades <0.94; 0.95 é ideal)
     - nova (Lua) 0.90 → **0.93** (nova precisa de um pouco mais de velocidade para soar real)
     - echo (Marco) 0.88 → **0.86** (echo com 0.86 é profundo e natural)
   - **Sempre usar tts-1-hd** (já é default, confirmar)
   - clean_for_tts:
     - Normalizar abreviações comuns em pt-BR: "vc" → "você", "tb" → "também", "pq" → "porque", "n" → "não", "q" → "que", "td" → "tudo", "mt" → "muito", "blz" → "beleza"
     - Substituir hífens entre números por vírgula + pausa: "1-2" → "um, dois"
     - Adicionar vírgula após conectivos de introdução: se texto começar com "Mas" seguido de palavra sem vírgula → "Mas, "
     - Manter reticências 3 pontos (não truncar)

4. **Frontend: consumeSSE batching de deltas**
   - Usar micro-debounce (30-40ms) no consumo de eventos: acumular todos os deltas que chegarem numa janela curta e aplicar de uma vez só → reduce drasticamente re-renders e "caractere por caractere".

5. **Frontend: Chat.jsx attachStream usar batch de patchMessages**
   - Já está via patchMessage; o que falta é o batching no consumidor SSE.

## Dependencies and Considerations

- Backend: não quebrar contrato de eventos SSE (start, delta, done, error). Apenas reduzir frequência e skip de vazios. Frontend não precisa saber do batching backend.
- Frontend: batching de SSE não pode atrasar evento `done` ou `error`. Esses devem ser flussidos imediatamente.
- Vozes: manter DEFAULT_VOICE_ID = male_mature; não alterar API existente `/api/voices`.

## Validation

1. **Sintaxe**: `ast.parse(server.py)` e build frontend se possível; GetDiagnostics.
2. **Grep checks**: confirmar novos speeds, novos textos de system prompt, ajustes clean_for_tts e debounce em sse.js.
3. **Sem quebra visual**: inspeção manual classes/JSX não alteradas para UI (só lógica).

## Risks

- **Risco**: Batching excessivo no SSE backend torna streaming "travado" em tela. → Mitigação: janelas curtas (120ms no backend, 30-40ms no frontend) e evento delta com pelo menos 1 caractere novo.
- **Risco**: Velocidade das vozes soar muito rápida/lenta. → Mitigação: escolher valores padrão do mercado para cada voz OpenAI (onyx 0.8x, shimmer/nova 0.9-1.0, echo 0.8-0.9).
- **Risco**: Abreviações normalizadas em contexto incorreto (ex: "q" em matemática). → Mitigação: regex com boundaries `\bvc\b` e lista pequena de abreviações MUITO comuns apenas.
