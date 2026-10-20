# Assessment Explora: Leitura de rede em fluxo mais eficiente na TV

- **Slug**: leitura-rede-fluxo-tv
- **Criado**: 2026-10-19
- **Origem**: ideia do backlog (`.planning/backlog.md` → "[Feature] Leitura de rede em fluxo mais eficiente")

## Ideia Bruta

Na TV, ler 20 MB por `body.getReader()` levou 5,9 s em 3 065 pedaços de ~7 KB, contra 3,8 s para baixar o mesmo
arquivo inteiro. A ideia é juntar os pedaços em buffers maiores antes de decodificar e interpretar, ou ler a resposta
inteira quando ela cabe com folga na memória.

## Evidência a Favor

- **Medido na TV** (`sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda2-capacidades-tv-2026-10-18.md`, "Rede
  local"): 20 MB inteiros em 3,8 s (43,8 Mbit/s); os mesmos 20 MB em fluxo em 5,9 s, **55 % mais lento**. O laço da
  sonda só somava bytes, sem decodificar nem interpretar nada: o custo extra é da própria leitura, um `await` por pedaço
  de ~7 KB.
- **Os três leitores do app trabalham por pedaço**:
  - `readJsonArrayStream` (`lib/catalog/jsonArrayStream.ts:92-104`), usado pela carga por seção (`sectionLoader.ts:149`):
    `TextDecoder` + parser + `await afterChunk()` **a cada pedaço**;
  - `linesFromResponse` (`lib/catalog/m3uParser.ts:219-236`), da importação M3U e do teste de conexão: decodifica e
    corta linhas por pedaço, copiando o resto do buffer a cada linha (`buffer.slice`);
  - `textChunks` (`lib/epg/epgFetch.ts:50-94`), do guia (`epgSync.ts:84`): decodifica por pedaço, com ou sem gzip.
- **Volume real** (`medicao-lista-real-pc-2026-10-18.json`): filmes 16,5 MB de JSON, séries 8,9 MB, canais 0,75 MB e
  guia 14,6 MB de XML. São ~41 MB lidos em fluxo numa carga completa. Se o custo extra da TV valesse por inteiro, seriam
  ~4 s a mais (ASSUMPTION: extrapolado da rede local).

## Evidência Contra

- **Tudo isso roda em segundo plano, nos Workers** (`sectionWorker`, `importWorker`, `epgWorker`): ninguém espera com a
  tela parada. Abrir uma categoria lê do IndexedDB ou baixa só aquela categoria. O ganho seria terminar a pré-carga ou o
  guia alguns segundos antes, não uma tela mais rápida.
- **A medida foi na rede local** (43,8 Mbit/s, ping 20 ms) e na thread principal da sonda. Se o provedor entrega mais
  devagar que ~27 Mbit/s (20 MB / 5,9 s), os pedaços chegam no ritmo da rede e o custo por pedaço some atrás da espera.
  A velocidade real do provedor até a TV não foi medida. ASSUMPTION.
- **"Ler inteiro" contraria uma decisão registrada**: `m3uParser.ts:210-214` (D-002) lê em fluxo justamente porque uma
  lista M3U de 300 mil entradas passa de 50 MB de texto, e materializar isso custaria mais memória do que a TV tem.
  Valeria só para respostas pequenas e com tamanho conhecido.
- **Juntar pedaços não remove o `await` de cada `reader.read()`**, que é onde a sonda viu o custo. Só reduziria o
  trabalho de decodificar e interpretar por pedaço, que a sonda não mediu.
- **Nenhum relato de lentidão** ligado a isso. O guia ≤ 3 s no app real (SC-007 da 082) ainda está para medir.

## Perguntas em Aberto

- A pessoa percebe a demora da pré-carga ou do guia (contagens "carregando", guia vazio por um tempo)?
- Qual a velocidade real do provedor até a TV? O teste de conexão (feature 062) mede isso no aparelho.
- Dentro de um Worker e com o trabalho real (decodificar + interpretar), o custo por pedaço continua relevante?
