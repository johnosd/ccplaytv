# Feature Specification: Headers da lista no AVPlay e catch-up de programas passados (Xtream)

**Slug**: `058-headers-avplay-catchup`

**Created**: 2026-10-04

**Status**: Convergida

**Input**: Pacote G1 do backlog — item 25b (repasse dos headers `User-Agent`/`Referer` declarados pela lista M3U ao player da TV; o parser da `044` já os guarda) e item 43 (TV Archive / Catch-up: tocar programa passado a partir do Guia, se o provedor oferecer; duas variantes de URL exigem sondagem; libera Play/Pause no que não é ao vivo, V14 §43.3). Por decisão do usuário, os dois entram completos nesta spec, sem `sdd-assess` separado para o 43.

## Escopo

### Incluído

- Repassar ao player da TV os headers `User-Agent` e `Referer` que a lista M3U declarou para um item, em **todo** item M3U que os tenha (canal, filme, episódio).
- Quando a TV não conseguir aplicar um dos headers: tentar tocar mesmo assim com o que der e, se a reprodução falhar, dizer que a lista exige um header que esta TV não envia — sem mostrar o valor.
- Painel "Info do stream" (feature 029) mostra **os nomes** dos headers aplicados (ex.: "User-Agent, Referer"), nunca os valores.
- Catch-up para fontes **Xtream**: o app passa a guardar, por canal, se o painel mantém arquivo e por quantos dias.
- No **Guia completo** (feature 031): programa passado com arquivo disponível fica marcado; OK nele toca o programa do início.
- Ação **"Do início"** sobre o programa em exibição, no chrome do player ao vivo; o painel de prévia da Live TV ganha só um selo não focável de que o canal tem arquivo *(emendado no `sdd-plan`: desde a 049 a prévia não tem elemento focável)*.
- Reprodução de arquivo com controles reais: Play/Pause, ±10 s, barra de progresso com a duração do programa e ação **"Ao vivo"**; ao fim de um programa, segue para o seguinte do arquivo e, ao alcançar o agora, passa sozinho ao ao vivo do canal.
- Sondagem das duas variantes de URL de arquivo do painel Xtream e reuso da variante que funcionou para a mesma fonte.

### Fora de Escopo

- Catch-up de listas M3U (atributos `catchup`, `catchup-source`, `catchup-days`) — só painel Xtream.
- Pausar o ao vivo (timeshift): Play/Pause num canal ao vivo continua indisponível.
- Ampliar a janela guardada do EPG: continua 12 h para trás; programas mais antigos não aparecem no Guia, mesmo que o arquivo os tenha.
- Registrar programa de arquivo no Histórico ou em "Continuar assistindo" (o canal continua registrado como hoje).
- Lembretes, gravação, programas futuros.
- Headers além de `User-Agent`/`Referer`; header configurado pela pessoa por lista; headers no player de desenvolvimento do PC (o navegador não permite).
- Exibir o número de canal declarado (`tvg-chno`) — retirado do backlog.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Item de lista M3U que exige headers toca na TV (Priority: P1)

A pessoa tem uma lista M3U cujos canais declaram `User-Agent` ou `Referer` (no `|` da URL ou em `#EXTVLCOPT`/`#KODIPROP`). Hoje esses canais falham porque a TV pede o vídeo sem os headers. Com esta feature, o app entrega os headers ao player e o canal toca. Vale também para filmes e episódios da lista.

**Why this priority**: é a única pendência que impede uma lista de tocar de verdade; o dado já está guardado desde a `044`.

**Independent Test**: importar uma lista M3U servida localmente cujo servidor de vídeo só responde com o `User-Agent`/`Referer` declarado; o item toca na TV, e sem headers o mesmo servidor recusa.

**Acceptance Scenarios**:

1. **Given** um canal M3U com `User-Agent` e `Referer` declarados, **When** a pessoa o abre, **Then** o player pede o vídeo com esses dois headers e o canal toca.
2. **Given** um filme ou episódio M3U com header declarado, **When** a pessoa o abre, **Then** os headers são aplicados do mesmo jeito.
3. **Given** um item sem headers (M3U ou Xtream), **When** aberto, **Then** a reprodução é idêntica à de hoje.
4. **Given** um item com header que a TV não consegue aplicar, **When** aberto, **Then** o app tenta tocar com o que conseguiu aplicar; se tocar, nada muda para a pessoa; se falhar, o erro diz que a lista exige um header que esta TV não envia, com as ações de erro de sempre.
5. **Given** um item tocando com headers aplicados, **When** a pessoa abre "Info do stream", **Then** vê os nomes dos headers aplicados, nunca os valores.
6. **Given** zapping (↑/↓) entre canais com e sem headers, **When** troca de canal, **Then** cada canal abre só com os seus headers — nada vaza do anterior.

---

### User Story 2 - Assistir um programa passado pelo Guia (Priority: P2)

A pessoa perdeu um programa de hoje num canal de painel Xtream que guarda arquivo. Abre o Guia completo, volta na timeline até o programa (marcado como disponível), aperta OK e assiste do começo, com pausa, ±10 s e barra de progresso. Ao terminar, o canal segue para o programa seguinte; quando alcança o agora, entra no ao vivo.

**Why this priority**: é o valor principal do catch-up, mas depende de o painel oferecer arquivo — vem depois de fazer as listas tocarem.

**Independent Test**: com um painel Xtream falso servindo um canal com arquivo e EPG das últimas horas, abrir o Guia, selecionar um programa passado e conferir reprodução, controles, transição para o seguinte e para o ao vivo.

**Acceptance Scenarios**:

1. **Given** um canal com arquivo e um programa passado dentro dos dias do arquivo, **When** a pessoa foca o programa no Guia, **Then** ele mostra uma marca de "disponível para assistir" e o foco não inicia nada.
2. **Given** esse programa focado, **When** a pessoa aperta OK, **Then** o player abre em tela cheia no início do programa, identificado como arquivo (não "Ao vivo"), com título e horário do programa.
3. **Given** um programa de arquivo tocando, **When** a pessoa usa Play/Pause, ←/→ (±10 s) ou a barra, **Then** os controles agem dentro do programa; a barra vai do início ao fim do programa segundo o EPG.
4. **Given** um programa de arquivo tocando, **When** a pessoa escolhe "Ao vivo", **Then** o canal passa ao ao vivo, com os controles do ao vivo.
5. **Given** um programa de arquivo que termina, **When** existe o programa seguinte no EPG, **Then** a reprodução segue nele sem a pessoa agir; **When** o seguinte é o programa em exibição e a reprodução alcança o agora, **Then** passa ao ao vivo.
6. **Given** um programa passado de canal sem arquivo, ou anterior aos dias do arquivo, **When** a pessoa aperta OK, **Then** o programa aparece sem a marca e um aviso explica (canal sem arquivo: "Este programa já terminou."; fora dos dias: o programa já saiu do arquivo); o foco fica onde estava.
7. **Given** um programa de arquivo tocando, **When** a pessoa aperta ↑/↓, **Then** troca para o ao vivo do canal vizinho (zapping de sempre).
8. **Given** um programa de arquivo tocando, **When** a pessoa volta (RETURN), **Then** retorna ao Guia com o foco no programa que abriu.

---

### User Story 3 - "Do início" no programa em exibição (Priority: P3)

A pessoa liga num canal com arquivo e o jogo começou há 20 minutos. No chrome do player ao vivo, escolhe "Do início" e o programa atual recomeça do começo, com os mesmos controles da US2; pode voltar ao ao vivo a qualquer momento.

**Why this priority**: atalho de alto uso, mas reaproveita tudo da US2.

**Independent Test**: num canal com arquivo e EPG do agora, acionar "Do início" no chrome do player e conferir o início no começo do programa atual, a barra limitada ao agora e o "Ao vivo".

**Acceptance Scenarios**:

1. **Given** um canal com arquivo e programa atual conhecido, **When** a pessoa revela a linha de controles do player ao vivo, **Then** existe a ação "Do início"; **And** a prévia da Live TV mostra o selo de arquivo do canal, sem nada focável novo.
2. **Given** essa ação acionada, **When** o player abre, **Then** toca o programa atual desde o início, identificado como arquivo.
3. **Given** a reprodução do programa atual pelo arquivo, **When** a pessoa avança, **Then** não passa do agora; ao alcançá-lo, entra no ao vivo.
4. **Given** um canal sem arquivo, **When** a pessoa revela a linha de controles, **Then** a ação não existe e a prévia não mostra o selo.
5. **Given** um canal com arquivo mas sem programa atual no EPG, **When** a pessoa foca a ação, **Then** ela aparece desabilitada (soft disabled) explicando que não há programação para saber onde o programa começa.

---

### Edge Cases

- Lista M3U com só `User-Agent` (ou só `Referer`): aplica o que existe.
- Header com valor que a TV rejeita (longo, caracteres inválidos): trata como não aplicado (cenário 4 da US1).
- Painel responde às duas variantes de URL de arquivo com erro: o programa não toca e o erro diz que o arquivo deste programa não respondeu, com "Ao vivo" e "Voltar" como ações; nada é marcado como indisponível para sempre.
- A variante que funcionou para a fonte deixa de funcionar (painel mudou): sonda de novo antes de declarar falha.
- Programa passado que começou antes do limite do arquivo (ex.: arquivo de 1 dia, programa que começou há 25 h): tratado como sem arquivo.
- EPG com lacuna entre dois programas de arquivo: ao fim do programa, sem seguinte conhecido, passa ao ao vivo.
- Rede cai durante o arquivo: mesma política de reconexão e erros acionáveis da `042`, mantendo a posição dentro do programa.
- Credencial da lista: a URL de arquivo carrega usuário e senha como a URL do canal — mesmas proibições (nunca em log, erro, tela ou terceiro).
- Canal da lista Xtream reaberto depois de um resync em que o painel deixou de declarar arquivo: a marca some; programas passados passam a ser "sem arquivo".
- App vai para segundo plano tocando arquivo: mesmo ciclo de vida do player (`020`); ao voltar, retoma a posição dentro do programa ou passa ao ao vivo se o programa já saiu do arquivo.

## Requirements *(mandatory)*

### Functional Requirements

**Headers (item 25b)**

- **FR-001**: Ao abrir um item que tem `User-Agent` e/ou `Referer` guardados (feature 044), o sistema DEVE pedir o vídeo ao servidor com esses headers, para canais, filmes e episódios.
- **FR-002**: Itens sem headers guardados DEVEM abrir exatamente como hoje.
- **FR-003**: Os headers de um item NUNCA DEVEM ser aplicados a outro item (zapping, próximo episódio, troca de qualidade, reconexão).
- **FR-004**: Quando a TV não aceitar aplicar um header, o sistema DEVE tentar reproduzir assim mesmo com os headers aceitos; se a reprodução falhar, o erro DEVE informar que a lista exige um header que esta TV não envia, sem o valor, com as ações de erro já existentes (`042`).
- **FR-005**: O painel "Info do stream" DEVE listar os nomes dos headers aplicados ao item em reprodução e NUNCA os valores.
- **FR-006**: Valores de header NUNCA DEVEM aparecer em log, mensagem de erro, UI, `aria-*`, diagnóstico, chave de consulta, exportação ou requisição a terceiros (constitution; ADR-010 emendada pela 044).

**Catch-up (item 43)**

- **FR-007**: Para fontes Xtream, o sistema DEVE guardar por canal se o painel mantém arquivo e por quantos dias, conforme o painel declara; um canal sem essa declaração é "sem arquivo".
- **FR-008**: Um programa é "disponível no arquivo" somente se o canal tem arquivo, o programa já começou e o início do programa está dentro dos dias declarados.
- **FR-009**: O Guia completo DEVE marcar visualmente os programas disponíveis no arquivo; focar um programa NUNCA DEVE iniciar reprodução nem consulta à rede.
- **FR-010**: OK num programa disponível DEVE abrir o player em tela cheia no início do programa; OK num programa passado não disponível DEVE mostrar um aviso, sem mover o foco: canal **sem** arquivo mantém o aviso de hoje ("Este programa já terminou.", contrato travado da 031); canal **com** arquivo e programa fora dos dias diz que o programa já saiu do arquivo do canal. *(Refinado no `sdd-plan`, 2026-10-04, R-006.)*
- **FR-011**: Durante a reprodução de arquivo, o chrome DEVE identificar que não é ao vivo e mostrar título e horário do programa.
- **FR-012**: Durante a reprodução de arquivo, o sistema DEVE oferecer Play/Pause, ±10 s e barra de progresso com início e fim do programa (EPG), e a ação "Ao vivo".
- **FR-013**: Ao fim de um programa de arquivo, o sistema DEVE seguir para o programa seguinte do mesmo canal se ele estiver no EPG e no arquivo; ao alcançar o agora, ou sem programa seguinte conhecido, DEVE passar ao ao vivo do canal.
- **FR-014**: A busca dentro do programa em exibição NUNCA DEVE passar do agora.
- **FR-015**: Para um canal com arquivo e programa atual conhecido, o chrome do player ao vivo DEVE oferecer "Do início", que toca o programa atual desde o início pelo arquivo. O painel de prévia da Live TV DEVE mostrar um selo não focável indicando que o canal tem arquivo (e de quantos dias). *(Emendado no `sdd-plan`, 2026-10-04.)*
- **FR-016**: Em canal sem arquivo, "Do início" NÃO DEVE existir; em canal com arquivo sem programa atual no EPG, DEVE aparecer desabilitada (soft disabled) com a explicação.
- **FR-017**: O sistema DEVE sondar as duas variantes de URL de arquivo do painel Xtream, reutilizar para a mesma fonte a que funcionou e sondar de novo quando ela falhar; se nenhuma responder, DEVE mostrar erro acionável ("Ao vivo", "Voltar") sem marcar o programa como indisponível de forma permanente.
- **FR-018**: Durante a reprodução de arquivo, CH± (sempre) e ↑/↓ com o chrome oculto DEVEM trocar para o ao vivo do canal vizinho; com a linha de controles visível, ↑/↓ seguem o chrome de VOD (↑ foca a barra). RETURN DEVE voltar à origem: arquivo aberto pelo Guia volta ao Guia com o foco no programa; "Do início" aberto do player volta ao ao vivo do mesmo canal. *(Refinado no `sdd-plan`, 2026-10-04: ↑ já é o gesto de focar a barra no VOD.)*
- **FR-019**: Reprodução de arquivo NÃO DEVE criar nem atualizar entradas de Histórico ou "Continuar assistindo".
- **FR-020**: A URL de arquivo DEVE seguir as mesmas regras de segredo da URL de reprodução (ADR-010): nunca em log, erro, UI ou terceiro.
- **FR-021**: Novos textos visíveis DEVEM entrar no catálogo de idiomas (pt, en, es).

### Key Entities *(include if feature involves data)*

- **Headers de reprodução do item** (já existente, `044`): `User-Agent` e `Referer` opcionais por item M3U.
- **Arquivo do canal**: por canal de fonte Xtream, se há arquivo e quantos dias ele cobre, como o painel declara.
- **Programa de arquivo**: um programa do EPG guardado, de um canal com arquivo, com início e fim, que pode ser tocado do início.
- **Variante de arquivo da fonte**: qual das duas formas de URL de arquivo o painel da fonte aceitou por último.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em um servidor de teste que recusa pedidos sem o header declarado, 100% dos itens M3U com headers (canal, filme, episódio) tocam na TV física.
- **SC-002**: 0 diferença na reprodução de itens sem headers em relação a antes da feature (suíte e E2E existentes verdes).
- **SC-003**: 0 ocorrência de valor de header ou credencial em logs, erros, tela e diagnósticos durante os roteiros de teste.
- **SC-004**: Num painel com arquivo, a pessoa chega de "Guia aberto" a "programa passado tocando do início" em no máximo 3 ações além da navegação até o programa.
- **SC-005**: Ao fim de um programa de arquivo, a transição para o seguinte ou para o ao vivo acontece sem ação da pessoa em 100% dos casos do roteiro.
- **SC-006**: O catch-up é validado na TV física com uma lista real que tenha arquivo; sem lista assim, a validação física fica registrada como "não testado", nunca como aprovada.

## Assumptions

- Espera-se que a TV (Tizen 9, AVPlay) aceite um `User-Agent` personalizado, como a documentação da Samsung sugere; o suporte a `Referer` é desconhecido. Nenhum dos dois foi provado neste aparelho: o `sdd-plan` precisa confirmar na TV física antes de desenhar o FR-004.
- O "spike de header do AVPlay" citado no backlog (item 58) não deixou evidência escrita; não se assume resultado dele.
- O painel Xtream declara arquivo por canal na listagem de canais ao vivo (`tv_archive`, `tv_archive_duration`); o formato das duas variantes de URL vem de `docs/iptvnator/03-apis.md` #8. **Sondagem do `sdd-plan` (2026-10-04)**: a lista do `.env` declara arquivo de 7 dias em 75 de 2 360 canais (70 com EPG), mas o painel responde 404 nas duas variantes, para programas de 1,5 h a 5 dias atrás, com início no fuso do painel e em UTC — o ao vivo do mesmo canal toca. O aceite do catch-up usa painel falso; a lista real fica como "não testado" e exercita o erro acionável.
- A janela de EPG guardada (12 h para trás, `030`) cobre o caso principal; programas mais antigos ficam fora do Guia.
- Fontes M3U, mesmo que apontem para um painel Xtream reconhecido (feature 014), ganham catch-up só se seguirem o caminho de provedor; avulsas não.

## Clarifications

### Sessão 2026-10-04

- Q: O que entra nesta spec — só o 25b, ou também o 43? → A: 25b + 43 completos (sem `sdd-assess` separado para o 43).
- Q: Se a TV não aplicar um header, o que o app faz? → A: tenta tocar com o que der; se falhar, o erro explica que a lista exige um header que esta TV não envia, sem o valor.
- Q: Quais itens recebem os headers? → A: todo item M3U com header — canais, filmes e episódios.
- Q: A pessoa vê que headers foram aplicados? → A: só no "Info do stream", com os nomes, nunca os valores.
- Q: De que fontes vem o catch-up? → A: só painel Xtream.
- Q: Onde a pessoa abre um programa passado? → A: Guia completo e "Assistir do início" (prévia da Live TV e chrome do player). Pausar o ao vivo (timeshift) fica fora.
- Q: Quanto do passado o Guia mostra? → A: manter as 12 h guardadas hoje.
- Q: Quais controles no arquivo? → A: como VOD (Play/Pause, ±10 s, barra) + "Ao vivo"; ↑/↓ trocam para o ao vivo do vizinho.
- Q: O que acontece quando um programa de arquivo termina? → A: segue para o seguinte; ao alcançar o agora, passa ao ao vivo.
- Q: OK em programa passado sem arquivo? → A: sem marca de disponível; OK mostra aviso e o foco fica.
- Q: Catch-up entra no Histórico? → A: não.
- Q: A lista de teste tem arquivo? → A: não se sabe; o `sdd-plan` sonda a lista do `.env` e, se não houver, o aceite usa painel falso e a TV fica "não testado".

### Sessão 2026-10-04 (sdd-plan)

- Q: A lista real declara arquivo em 75 canais, mas o painel responde 404 nas duas variantes. Como seguir com o 43? → A: manter; aceite automático por painel falso que serve arquivo, a TV com a lista real fica "não testado" (e o 404 vira o caso de erro acionável).
- Q: Onde fica "Assistir do início" fora do player, já que a prévia não tem nada focável desde a 049? → A: só no chrome do player ao vivo; a prévia ganha um selo não focável de arquivo. FR-015, FR-016 e US3 emendados.
- Q (decidido no plano, sem pergunta): ↑/↓ no arquivo conflitam com o ↑ que foca a barra no VOD → CH± sempre troca de canal; ↑/↓ trocam só com o chrome oculto. FR-018 refinado.
- Q (decidido no plano, sem pergunta): o contrato travado da 031 exige "Este programa já terminou." no OK de programa passado → mantido para canal sem arquivo; canal com arquivo fora dos dias ganha aviso próprio. FR-010 e US2-AC6 refinados.
