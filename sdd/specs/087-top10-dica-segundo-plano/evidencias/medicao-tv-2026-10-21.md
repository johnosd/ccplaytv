# Medição na TV — feature 087, 2026-10-21

## Aparelho e o que foi instalado

- **QN50Q60DAGXZD**, Tizen 9 / Chromium 120, origem `file://`. IP na sessão: `192.168.0.2`.
- Instalado **três vezes**, sempre com `deploy-tv.ps1 -SkipBuild` (preserva os dados: lista, favoritos, histórico, chave do
  TMDB):
  1. build de medição (`VITE_CCPLAY_PERF=1` + canal de métricas para `http://192.168.0.14:8770/app-metrics`);
  2. build de medição **com a sonda automática** (`VITE_CCPLAY_AUTOPILOT=1`) — ver "Incidente";
  3. **pacote normal**, reinstalado ao final. Nada ficou na TV além dele.
- Nenhuma sonda separada foi usada (não é modo A/B da `tizen-sonda`, é o **modo C**: app real com o canal de métricas).
- Origem dos números: `evidencias/app-metricas-tv-2026-10-21.jsonl` (170 linhas). Conferido antes de gravar: os únicos
  valores de texto são `receivedAt` e rótulos fixos (`source`, `kind`, `screen`, `reason`, `phase`, `mode`, `outcome`).
  Nenhum nome de item, URL ou credencial.

## Roteiro

**Rodada 1 — manual, duração NÃO fixa.** A pessoa entrou na lista, abriu Filmes e Séries e navegou entre cards e
fileiras. É a limitação desta evidência: sem duração fixa, ela serve para **detectar** piora, não para comparar com
precisão — a mesma lição do SC-009 da feature 086.

**Rodada 2 — sonda automática.** Não produziu nenhuma medida (ver "Incidente").

## Resultado

| Critério | O que foi olhado | Linha de base (086) | Medido | Veredito |
| --- | --- | --- | --- | --- |
| **SC-008** | `assembly` → `revealMs` | 313–380 ms | `home` 374, `movies` 348, `series` 358 ms | **Aprovado** |
| registro | `showcase` → `docMs` | ~1 ms | 0–2 ms (8 leituras) | Mantido |
| **SC-007** | `frames` → `fps`, `over50`, `worstMs` | mediana 38 fps | **mediana 32 fps**, mínimo 1; 4 janelas abaixo de 20 fps; 136 quadros > 50 ms em 19 janelas; **pior quadro 1750 ms** | **Reprovado** |
| registro | `entry` → `readMs` (entrar numa categoria) | ~200 ms | **3763** e 2133 ms; depois 506, 236, 928 | **Piora** |
| registro | `section-load` → `totalMs` | séries 3,5 s | `channel` 1,65 s · `movie` 7,36 s · `series` 3,36 s | Séries mantido |

**Classificação**: **gate** para SC-007 (reprovado) e SC-008 (aprovado). O resto é **registro**.

## Leitura honesta

A abertura das telas continua rápida — o documento de tela da 086 segue entregando (0–2 ms) e a revelação ficou na
faixa medida antes. **O que piorou é a thread**, e isso a pessoa percebeu antes de qualquer número: "piora na fluidez ao
descer entre os cards, e as imagens demoram a carregar". Um quadro de 1750 ms travado também trava a decodificação de
capa, então os dois sintomas têm a mesma origem.

**A causa foi medida sem a TV**, com o índice instrumentado: a produção em segundo plano montava o índice do tipo
inteiro **uma vez por categoria que chega** — 10 categorias chegando, 10 montagens, sobre 43 549 filmes nesta lista. A
barreira do T047 cobria só a carga **por seção**; o agendador chama o `housekeeping` depois de **cada categoria** da
pré-carga, e a cobertura na validade (T036) mandava refazer.

**Correção (T050)**: o produtor só roda com a fila vazia (`housekeeping` recebe `idle`) e monta o índice **uma vez por
tipo**, reusado pelas duas fileiras. Medido depois: **0** montagens durante a carga e **1** por rodada.

**O que esta evidência NÃO prova**: que a correção resolveu. Ela não foi medida na TV — a rodada seguinte ficou para
depois, por decisão do usuário. Enquanto isso, o SC-007 segue **reprovado** com os números acima, e não há número novo
que o contradiga.

## Incidente: a sonda automática tocou uma série

Na primeira versão, a sonda despachava as 14 teclas de navegação **no mesmo tick**. O foco deste app é estado do React
(ADR-009), não `document.activeElement`: o React agrupou as teclas e o foco andou **um** passo em vez de seis. Nunca
chegou à topbar, e o `Enter` que deveria abrir Filmes caiu num card de "Continue assistindo" — a TV começou a tocar uma
série sozinha, e as quatro janelas de medição foram puladas (só o marcador de fim chegou).

O erro de método foi pular o **ensaio no PC**, que a skill `tizen-sonda` manda fazer antes de instalar.

Corrigido com duas mudanças e as duas provadas:

1. navegação em **laço fechado** — uma tecla por vez, conferindo o foco depois de cada uma;
2. **`Enter` só com o foco no item da topbar**, reconhecido pelo texto do rótulo. Se não chegar lá, a sonda desiste e
   conta em `falhas`. Um card nunca se chama "Filmes", então play acidental ficou impossível.

`src/lib/perf/autopilot.test.ts` fixa a trava (foco num card → desiste sem `Enter`; item errado da topbar → desiste;
destino → aciona), e o ensaio no navegador contra o app real passou nas duas condições, inclusive com o foco fundo numa
fileira da Início. O ensaio **não** reproduz o caso do card de "Continue assistindo" (a lista fictícia não tem essa
fileira); esse caso está coberto pelo teste unitário, não pelo ensaio.

---

# Rodada 3 — sonda automática (mesma noite, depois do T050)

Instalado o build de medição com `VITE_CCPLAY_AUTOPILOT=1` (`deploy-tv.ps1 -SkipBuild`), a sonda rodou sozinha e o
**pacote normal foi reinstalado ao final**. Roteiro **de duração fixa**: janelas de 60 s, uma tecla a cada 300 ms,
navegação contínua entre cards e fileiras. **Esta rodada é a nova linha de base comparável** — as anteriores foram
feitas à mão, em rajadas com pausas, e não são comparáveis em contagem de quadros.

| Janela | Tela | fps | Pior quadro | Quadros > 50 ms | Teclas |
| --- | --- | --- | --- | --- | --- |
| 1 | Filmes | 31 | **900 ms** | 133 | 150 |
| 1 | Séries | 38 | 817 ms | 116 | 163 |
| 2 | Séries | 40 | 583 ms | 102 | 169 |
| 2 | Filmes | — | — | — | **desistiu** (`falhas = 1`) |

A janela abandonada é a trava funcionando: a navegação não chegou ao item da topbar e a sonda **não acionou nada**.
Perder uma medida é o preço aceito para nunca mais abrir conteúdo por acidente.

| Critério | Rodada 1 (manual) | Rodada 3 (sonda) | Linha de base 086 |
| --- | --- | --- | --- |
| Pior quadro | **1750 ms** | **583–900 ms** | — |
| fps (mediana das janelas) | 32 (mínimo 1) | **38** | 38 |
| Entrar em categoria (`entry readMs`) | **3763**, 2133, 506, 236, 928 | **899**, 436, 627, 630, 372 | ~200 ms |
| Abertura (`assembly revealMs`) | 374 / 348 / 358 | 386 / 349 / **331** | 313–380 ms |
| Documento (`showcase docMs`) | 0–2 | 1 (um 6) | ~1 ms |
| Carga por seção | `movie` 7,36 s | `movie` **9,69 s** (encode 2,65 s) | séries 3,5 s |

## Veredito

**SC-008: aprovado** (331–386 ms, na faixa). **SC-007: ainda NÃO cumprido.** O ganho é real e medido — pior quadro
caiu de 1750 para 583–900 ms, e entrar numa categoria ficou ~4× mais rápido — mas **900 ms de quadro congelado
continua sendo engasgo visível**, e são 102–133 quadros longos por minuto de navegação contínua.

## De onde vem o que sobrou (com evidência, não palpite)

1. **A janela 1 de Filmes (pior 900 ms) pegou a carga da lista em cima**: `section-load movie` deu **9,69 s** nessa
   mesma janela, com 2,65 s só de `encode`. Durante a carga o produtor da 087 está **calado** (`idle: false`, T050),
   então esse quadro **não é desta feature** — é o caminho de carga das features 082/086.
2. **A janela 2 de Séries (pior 583 ms) rodou depois das cargas**, e aí o produtor pode rodar: uma montagem do
   índice por tipo. `iterateKindRecordBatches` cede a vez **entre categorias**, não dentro: uma categoria gorda é
   descomprimida e projetada numa tarefa única. Esse quadro provavelmente **é** desta feature.

Saídas para o que sobrou, nenhuma decidida: ceder a vez **dentro** da leitura do bloco (código da 082), ou montar o
índice no Worker que a carga por seção já usa. As duas atravessam outra feature — não alargo aqui sem decisão.
