# Assessment Decision: Reproduzir canais ao vivo no navegador do dev

- **Slug**: mpegtsjs-no-htmlvideoadapter-tocar-canais-no
- **Decidido**: 2026-10-02
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Reproduzido hoje com a lista Xtream real em Chromium: painel responde 302 → 200 `video/mp2t`, `canPlayType('video/mp2t')` vazio, `<video>.error.code = 4`, tela mostra `PLAY-04`. Não é bug do app: o `htmlVideoAdapter` já documenta a limitação. |
| Força da evidência | adequate | A causa e a viabilidade de rede estão medidas: CORS do painel liberado (`Access-Control-Allow-Origin: *`) na 302 e no 200, o que afasta o maior risco de uma lib que baixa por `fetch`. **Sem medida ainda**: se o codec dos canais reais (H.264/AAC vs HEVC/AC3) é decodificado pelo Chromium — por isso o primeiro passo do plano deve ser um spike. |
| Valor vs. custo de inação | adequate | O motivo declarado (testar fluxos de player sem a TV) é real e recorrente nas pendências de TV física, mas o valor é de velocidade de desenvolvimento, não de usuário final. Já existem E2E com `webapis.avplay` falso (3 scripts), então parte da cobertura existe; a lacuna é vídeo de verdade. |
| Viabilidade / apetite | adequate | Pequena e isolada: `import()` dinâmico atrás de `import.meta.env.DEV` dentro de `createHtmlVideoAdapter`, sem tocar tela nem contrato. `unknown` reconhecido: o tamanho real do bundle de dev e o comportamento de trocar de canal (zapping) com a lib — decidir no plano. |
| Fit estratégico | adequate | Não conflita com ADR-008/011 nem com a constituição (nenhum segredo novo, nada vai à TV). Atenção ao princípio de veredito honesto: o adaptador de dev não pode virar "prova" de reprodução — a mensagem do `htmlVideoAdapter` e os verdicts de feature continuam apontando a TV como porta de aceite. |

## Abordagens Candidatas

### 1. `mpegts.js` só em dev, dentro do `htmlVideoAdapter`

- Demuxa MPEG-TS para MSE; carregada por import dinâmico só quando `import.meta.env.DEV`, então o build de produção a elimina. Aproveita o CORS já liberado pelo painel.
- **Recomendada**: sim — é o menor caminho que atinge o objetivo e mantém a TV intacta. `hls.js` entra apenas se `.m3u8` aparecer como necessidade real.

### 2. Remux externo (script/proxy local para HLS ou MP4)

- Nenhuma mudança no app; um processo local (ex.: ffmpeg) converte o stream e o dev aponta para ele.
- **Recomendada**: não — depende de ferramenta instalada, de credencial passando por um processo extra, e não ajuda os E2E.

### 3. Aceitar a limitação

- Continuar com `PLAY-04` no dev e validar vídeo só na TV.
- **Recomendada**: não por ora — mas é a alternativa correta se o spike mostrar que os canais reais usam codecs que o Chromium não decodifica.

## Veredito

**go**, com uma condição declarada: o problema é válido e medido (strong) e os demais critérios centrais ficaram `adequate`; o único `unknown` relevante (codec dos canais reais no Chromium) é barato de resolver e deve ser a primeira tarefa. Se o spike falhar, o caminho é a abordagem 3 e este assessment vira `kill` por inviabilidade, sem custo de implementação.

### Se go — Handoff

- **Problema**: no `npm run dev` canais `.ts` não tocam (Chromium não decodifica MPEG-TS), então fluxos de player só se validam com vídeo real na TV.
- **Abordagem recomendada**: `mpegts.js` carregada dinamicamente só em dev dentro do `htmlVideoAdapter`, atrás do contrato `PlayerAdapter` existente.
- **Escopo sugerido**: entra — canal `.ts` ao vivo no dev, lib fora do bundle de produção/Tizen, teste que prove isso (build sem a lib), script Playwright com a lista real (saída só com estados). Não entra — HLS/VOD (salvo de graça), decodificação de HEVC/AC3, qualquer prova de compatibilidade da TV, mudança no AVPlay.
- **Métricas de sucesso**: canal `.ts` real em `playing` ≤ 15 s no Chromium; `build`/`build:tizen` com os mesmos arquivos e sem a lib; suítes existentes verdes sem editar asserções.
- **Perguntas em aberto pro sdd-specify**: (1) spike do codec: os canais reais da lista decodificam no Chromium (vídeo e áudio)? (2) a troca de canal (zapping, `close()` seguido de `open()`) destrói a instância da lib sem vazar conexão? (3) a lib deve ser `devDependency` e como garantir por teste que não entra no bundle? (4) o `PLAY-xx` mostrado quando o codec não for suportado deve continuar sendo `PLAY-04`?
