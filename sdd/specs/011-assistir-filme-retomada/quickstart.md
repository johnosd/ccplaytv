# Quickstart — 011 Assistir Filme, com Retomada

Verificação manual da feature. Os Cenários A–E rodam no navegador; os
Cenários F–J **exigem a TV física** e são gate de conclusão desta feature
(decisão do usuário, 23/09/2026 — ver `## Clarifications` da spec).

---

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm install`).
- Uma fonte de provedor Xtream já sincronizada no aparelho/navegador, com
  **pelo menos uma categoria de Filmes com itens**.
- Para os cenários de TV: a TV na mesma rede, `sdb` disponível, perfil de
  assinatura Samsung configurado. Ver o skill `tizen-tv`.

**Nenhum backend é necessário.** Se algo nesta feature parecer exigir a `api/`,
é defeito — a arquitetura é client-first (ADR-008).

---

## Checagens automatizadas

Rodar de `tv-web/`, na ordem. Todas devem passar antes de qualquer verificação
manual:

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run
```

Narrow primeiro, enquanto desenvolve:

```powershell
npx vitest run src/lib/player/PlayerService.test.ts
npx vitest run src/lib/player/resumePolicy.test.ts
npx vitest run src/components/PlayerLayer.test.tsx
npx vitest run src/features/movies/MovieDetailScreen.test.tsx
```

---

## Cenário A — Assistir um filme do começo (US1, navegador)

1. `npm run dev`, abrir a fonte → **Filmes** → entrar numa categoria.
2. Focar um filme, SELECT → abre o detalhe.
3. Confirmar: a ação primária é **"Assistir"**, e está focada.
4. SELECT.

**Esperado**: a camada de reprodução abre em tela cheia. Os controles
aparecem. O `<video>` toca (no navegador, um filme MP4/MKV do provedor pode
não decodificar — ver a nota abaixo).

> **Nota honesta sobre o navegador**: o Chrome não reproduz MPEG-TS bruto nem
> vários contêineres de fonte IPTV (`htmlVideoAdapter.ts:5`). Um filme que não
> toca **no navegador** não é reprovação do Cenário A — o que se verifica aqui
> é a máquina de estados, os controles e o caminho de erro. A prova de
> reprodução é o Cenário F, na TV.

**Verificar**:

- [ ] A barra mostra tempo decorrido e total.
- [ ] Após ~5 s sem tecla, os controles somem.
- [ ] CIMA ou SELECT traz os controles de volta, com o foco em play/pause.
- [ ] Com os controles **ocultos**, DIREITA avança 10 s **e** mostra a barra.
- [ ] Com os controles **visíveis**, DIREITA move o foco entre as ações, sem
      saltar.
- [ ] SELECT em play/pause pausa; o rótulo muda; a posição para de avançar.
- [ ] Pausado, os controles **não** somem sozinhos.
- [ ] RETURN encerra e devolve ao detalhe, com o foco na ação primária.
- [ ] Nenhum áudio continua após RETURN.

## Cenário B — Retomada (US2, navegador)

1. Assistir mais de 30 s de um filme. Sair com RETURN.
2. Confirmar no detalhe: a ação primária virou **"Retomar (a partir de …)"**,
   com **"Reiniciar"** ao lado.
3. SELECT em "Retomar".

**Verificar**:

- [ ] A reprodução começa na posição salva, não no início.
- [ ] Voltar e acionar "Reiniciar" começa do zero.
- [ ] Recarregar a página (F5) e reabrir o detalhe: a posição continua lá.
- [ ] Assistir **menos** de 30 s de outro filme e sair: a ação continua
      **"Assistir"**, sem retomada.

## Cenário C — Limiar final (US2, navegador)

1. Num filme com duração conhecida, buscar até depois de 95 % (com as setas,
   ou várias vezes ⏩).
2. Sair com RETURN.

**Verificar**:

- [ ] O detalhe volta a oferecer **"Assistir"**, sem "Retomar".

## Cenário D — Conclusão (US3, navegador)

1. Buscar até os últimos segundos e deixar o filme terminar sozinho.

**Verificar**:

- [ ] **Nenhuma** mensagem de erro aparece.
- [ ] A camada fecha e o detalhe recupera o foco.
- [ ] A ação primária é **"Assistir"**.

## Cenário E — Não-regressão da Live TV (FR-022, navegador)

1. Abrir **Live TV**, entrar numa categoria, SELECT num canal.

**Verificar**:

- [ ] **Nenhuma** barra de progresso aparece.
- [ ] **Nenhum** controle de pausa ou salto aparece.
- [ ] ESQUERDA/DIREITA durante a reprodução **não** fazem nada.
- [ ] RETURN encerra, como sempre.
- [ ] A mensagem de erro de canal indisponível continua a de hoje.

---

## Cenários de TV física (gate obrigatório)

Empacotar e instalar pelo skill `tizen-tv`:

```powershell
cd tv-web
npm run build:tizen
```

> **Por que estes são gate**: no navegador roda o adaptador `<video>`, que
> suporta pausa, busca, posição e duração **sempre**. Ele é estruturalmente
> incapaz de revelar uma capacidade ausente no AVPlay. Nada do que está
> abaixo foi verificado em hardware antes desta feature — o adaptador só usava
> `open`/`play`/`stop`/`close`.

## Cenário F — Filme reproduz na TV (US1)

**Verificar**:

- [ ] Um filme da fonte real abre e toca, com imagem **e** áudio.
- [ ] A área do vídeo não fica preta (regressão do plano de hardware — ver
      `sdd/bugs/live-tv-toca-audio-sem-imagem`).

## Cenário G — Posição e duração reais (FR-004, FR-007)

**Verificar**:

- [ ] `getDuration()` devolve a duração real: a barra mostra o total correto.
- [ ] A posição avança sozinha (`oncurrentplaytime` chega).
- [ ] Se a duração **não** vier, a barra não é exibida e só o tempo decorrido
      aparece — **sem percentual inventado**. Registrar qual dos dois ocorreu.

## Cenário H — Pausa e busca no AVPlay (FR-006)

**Verificar**:

- [ ] `pause()` pausa de verdade; retomar volta do mesmo ponto.
- [ ] ⏩/⏪ saltam 10 s.
- [ ] **Segurar** a seta por ~3 s: o filme avança de forma acumulada (30 s+),
      **sem** travar e **sem** o app congelar. É a porta single-flight de
      `logic/reproducao-vod.md` §3 — o risco mais concreto desta feature.
- [ ] Buscar para além do fim não trava a sessão.

## Cenário I — Retomada ponta a ponta na TV (US2)

**Verificar**:

- [ ] Assistir 1 min, **fechar o app pelo controle**, reabrir, entrar no
      filme: "Retomar" aparece com a posição certa (tolerância: 5 s).
- [ ] Retomar posiciona corretamente (`seekTo` antes do `play`, sem piscar o
      início).

## Cenário J — Live TV não regrediu, na TV (FR-022, SC-005)

Repetir os cenários de reprodução da feature 003
(`sdd/specs/003-live-tv-avplay/quickstart.md`, Cenário C).

**Verificar**:

- [ ] Canal ao vivo toca com imagem e áudio.
- [ ] Sem barra, sem pausa, sem salto.
- [ ] Troca rápida de canal não acumula áudio nem sessões.

---

## Checklist cross-cutting (constitution)

- [ ] **Foco sem beco sem saída**: todo estado da camada tem saída. Com os
      controles ocultos não há elemento focável — **desvio consciente**,
      registrado no Constitution Check do `plan.md`; RETURN é a saída
      garantida e foi testada em cada estado.
- [ ] **Segredos**: nenhuma mensagem, rótulo ou log da camada contém URL,
      endereço de provedor, usuário ou senha. Conferir também o log do
      aparelho: `sdb dlog | Select-String CCPlay`.
- [ ] **Progresso real**: nenhum percentual exibido sem duração conhecida.
- [ ] **Capacidades reais**: nenhum controle oferecido que o motor não
      execute.
- [ ] **Identidade não depende da URL**: a retomada sobrevive a uma
      ressincronização da fonte (refazer o Cenário B depois de ressincronizar).
- [ ] **Design system**: nenhuma cor, raio ou tamanho de fonte literal nos
      componentes novos — só tokens da ADR-007.

## Registro de evidência

O guia `docs/guia-praticas-app-tv/06` §"Evidências de reprodução" pede
registrar por execução: modelo, firmware, versão do app, origem do stream
(**sem URL**) e a sequência de comandos. Anexar ao `plan.md` → `## Execution
Notes` ao fechar a fase de TV.
