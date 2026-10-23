# Assessment Explora: tarefa longa ao navegar nas telas de catálogo na TV

- **Slug**: tarefa-longa-na-leitura-categoria-gorda
- **Criado**: 2026-10-21
- **Origem**: convergência da feature 087 — o que sobrou depois de a regressão daquela feature ser medida e removida

## Ideia Bruta

Navegar em Filmes e Séries na TV de referência ainda produz **quadros congelados de 583–900 ms** e entradas em
categoria com mediana de 627 ms. A hipótese registrada no `Resultado Final` da 087 foi: *"uma categoria gorda é
descomprimida e projetada numa **tarefa única** (`readHeaderChunks`), e `iterateKindRecordBatches` cede a vez entre
categorias, não dentro"* — logo, bastaria ceder a vez dentro da leitura do bloco, ou movê-la para o Worker.

**Esta exploração existe porque essa hipótese foi conferida no código e está ERRADA.** Ver "Evidência Contra".

## Evidência a Favor

O sintoma é real e medido, em duas features independentes:

- **Feature 087, rodada 3** (sonda automática, janelas de 60 s de duração fixa,
  `087/evidencias/medicao-tv-2026-10-21.md`): fps mediana 38, **pior quadro 583–900 ms**, 102–133 quadros > 50 ms por
  janela de 60 s de navegação contínua. Entrada em categoria: mediana **627 ms**, máximo 899 ms.
- **Feature 086, validação final** (`086/evidencias/validacao-final.jsonl`, 332 janelas): fps mediana 38, mínimo 2,
  **pior quadro 917 ms**, 1 836 quadros > 50 ms. Entrada em categoria: mediana 229 ms, **máximo 5 945 ms**.
- Ou seja: o pior quadro de ~900 ms **atravessou as duas features** e sobreviveu a todas as otimizações da 086 e da 087.
  Não é regressão de nenhuma das duas — é o estado da arte do app.
- O usuário percebeu e relatou sem ver número nenhum: *"piora na fluidez em que eu desço entre os cards, na velocidade
  em que os cards carregam as imagens"* (2026-10-21). Um quadro de 900 ms também trava a decodificação de capa, o que
  explica os dois sintomas com uma causa.
- Precedente dentro do projeto de que **o gargalo é a thread, não a fila**: a feature 086 mediu p95 de 0,8 ms para ler o
  documento de tela no `localStorage` contra ~20 ms num `get` do IndexedDB **sob carga** — a diferença não estava no
  armazenamento, estava em quem segurava a thread.

## Evidência Contra

**1. A hipótese da "tarefa única" é falsa — o código já fatia.** Conferido em `tv-web/src/lib/catalog/`:

- `blockCodec.ts:17` → `BLOCK_CHUNK_ITEMS = 500`: o bloco de uma categoria é gravado em pedaços de **500 itens**, não
  num pedaço só.
- `blockChunks.ts:81-104` (`decodeRange`) → `await decodeBlockChunk(row, ...)` **por pedaço**, dentro do laço.
- `blockCodec.ts:117-120` (`decodeBlockChunk`) → `JSON.parse(await gunzipText(bytes))`, e a descompressão é assíncrona
  de verdade (não é um `await` sobre trabalho síncrono).

Então existe uma fronteira assíncrona real a cada 500 itens. O trabalho síncrono por fatia (`JSON.parse` + `expand` +
`asRecord` de 500 itens) não explica 583 ms. **A frase que ficou no `Resultado Final` da 087 precisa ser corrigida.**

**2. Pode não ser tarefa longa, e sim pausa de GC.** Montar o índice de nomes acumula **43 549** registros compactados
(`compactSearchRecord`, ~20 campos cada) num array, num aparelho com ~310 MB livres. Uma pausa de coleta de centenas de
ms é tão plausível quanto uma tarefa longa, e as duas se parecem numa medição por `requestAnimationFrame`. `ASSUMPTION`
— não medido.

**3. Também pode ser o cache de pedaços.** `blockChunks.ts:14` → `CHUNK_CACHE_MAX_ITEMS = 30_000`, abaixo dos 43 549
itens do tipo: percorrer o tipo inteiro **passa do teto e força descarte**, possivelmente em laço. `ASSUMPTION` — não
medido.

**4. O produtor da 087 pode já não estar envolvido.** O portão de atividade cala a fila por 2 s após cada tecla
(`IDLE_AFTER_KEY_MS`), e a sonda aperta uma tecla a cada 300 ms — ou seja, **durante a janela de medição o produtor não
roda**. Se o quadro longo aparece mesmo assim, ele não é do caminho da 087 nem do índice.

**5. O custo de inação pode ser baixo.** A 086 **foi entregue e aceita** com pior quadro de 917 ms, e a mediana de 38
fps está estável em três medições independentes. Ninguém reclamou da fluidez até a regressão da 087 — o relato do
usuário foi sobre a **piora**, que já foi removida.

**6. A comparação que mais assusta não é comparável.** Quadros > 50 ms por segundo: 1,1/s na 086 contra 2,0/s na 087.
Mas a 086 foi roteiro humano com pausas e a 087 foi navegação contínua (uma tecla a cada 300 ms por 60 s). Carga
diferente, número não comparável.

## Perguntas em Aberto

- **Onde está o quadro longo?** Nenhuma das três suspeitas (GC, descarte de cache, outra coisa) foi medida. Sem isso,
  qualquer construção é palpite.
- O quadro longo aparece com a fila de segundo plano **desligada**? É o A/B que separa "é do catálogo" de "é da 087", e
  a sonda automática já consegue rodá-lo.
- A mediana de entrada de 627 ms é piora real ou efeito da navegação contínua da sonda? Mesma sonda, com e sem carga,
  responde.
- Quanto de 900 ms a pessoa de fato percebe hoje, **sem** a regressão da 087 no meio?

---

## Rodada de medição com o discriminador (2026-10-22)

Instrumentação decidida neste assessment e entregue como ad-hoc (`PerformanceObserver` de `longtask` agregado por
janela + tempo por etapa do produtor), medida pela sonda automática: **4 janelas de 60 s, `falhas = 0`**. Dados
crus em `app-metricas-tv-2026-10-22.jsonl`.

| Janela | Tela | fps | Pior quadro | Quadros > 50 ms |
| --- | --- | --- | --- | --- |
| 1 | Filmes | 33 | 717 ms | 149 |
| 1 | Séries | 39 | 750 ms | 109 |
| 2 | Filmes | 37 | 783 ms | 110 |
| 2 | Séries | 41 | 733 ms | 115 |

Repetível: a rodada anterior deu 583–900 ms com a mesma sonda. O roteiro de duração fixa cumpriu o que prometia.

### O discriminador respondeu

**48 de 49** quadros de 200 ms ou mais vêm acompanhados de uma **tarefa longa de JavaScript de tamanho
equivalente** (`longTaskMaxMs` ≈ `worstMs`). Apenas 1 não.

- **É código nosso segurando a thread.** A suspeita 2 do levantamento original (pausa de coleta de memória) está
  **refutada**: se fosse GC, o quadro longo apareceria sem tarefa longa correspondente.
- **475 tarefas longas, 87,6 s no total**, em 55 das 73 janelas. A thread fica presa em **33% da janela** (mediana;
  mínimo 2%, máximo 67%). Não é uma tarefa patológica isolada — é trabalho longo **contínuo** durante a navegação.

### E mandou a investigação para outro lugar

O produtor do Top 10/Dica (que inclui a leitura dos blocos do catálogo, o caminho que este assessment nasceu
suspeitando) custou:

| Tipo | Índice | Itens | Por item | Casamento |
| --- | --- | --- | --- | --- |
| Filmes | **5 226 ms** | 31 915 | **164 µs** | 1 646 ms |
| Séries | 332 ms | 9 769 | **34 µs** | 264 ms |

- **Trabalho total do produtor: 7,5 s de 87,6 s = 8,6%.** Os **91% restantes são do próprio caminho de
  navegação** (tecla → foco → render → pintura), não do catálogo nem desta feature.
- **Filmes é 4,8× mais lento por item que Séries.** Isso dá apoio forte à suspeita 3: `CHUNK_CACHE_MAX_ITEMS =
  30 000` é **menor** que os 31 915 itens de filmes, e 9 769 de séries cabem. Percorrer o tipo inteiro passa do teto
  e força descarte. Continua `ASSUMPTION` quanto ao mecanismo exato, mas agora com número do aparelho a favor.

### O que isso mata

As duas abordagens que a feature 087 havia registrado — ceder a vez **dentro** da leitura do bloco e montar o índice
no Worker — atacariam **8,6%** do problema, e a primeira já era refutada pelo código (os pedaços têm 500 itens). O
alvo real é o caminho de navegação.
