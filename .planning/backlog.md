# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

**Este painel mostra só o que está PENDENTE** (enxugado em 2026-10-22). Feature convergida ou encerrada, bug
`verified`/`invalid` e melhoria ad-hoc já aplicada saem daqui e ficam em `docs/status-features.md`, seção
"Arquivo do backlog". Os scripts continuam donos das colunas de status e progresso.

**Cuidado ao reabrir algo arquivado**: `update-feature-status.ps1 -Slug <arquivada>` **sem** `-Status` reinsere a linha
com status **`Especificada`**, porque é o padrão de quando ele não acha a linha — o status real se perde em silêncio
(aconteceu com a 089 ao verificar isto, e foi desfeito à mão). Ao reabrir uma feature arquivada, passe o `-Status` certo
na mesma chamada.

## Ideias Futuras

Só o que está **pendente**, na ordem sugerida de execução. O que foi entregue está em `docs/status-features.md`.

### Antes de qualquer cobrança real

- [Infra — gate de venda] **Absorvido pela feature 081-venda-producao-mercadopago (2026-10-17)**: backup/restore com conciliação e TV física com compra real entram nela; T043 virou risco aceito para o piloto. 069 encerrada com riscos aceitos em 2026-10-14 (a pedido do usuário); **a venda segue desligada** e estes itens precisam ser executados antes de qualquer cobrança real: T066/T039 (replay `--apply` com evento posterior ao snapshot via `infra/portal/rehearse-replay.ps1`, ensaio da cópia protegida das chaves, restore + reconcile de pagamentos), T043 (compra sandbox para ativações pagas, carga distribuída, custo), T046 (roteiro A–H na TV física), T063 b (registros `generated`/TV `2A:…` — ação "desvincular"), T052 restante e T047. Detalhes: `sdd/specs/069-portal-tv-licenca-anual/plan.md` (R-022 a R-026) e `tasks.md` (Fase 8).
- [Infra — publicação Samsung] Licença/voucher de teste para o revisor do Seller Office na variante comercial (origem: 078, R-004, 2026-10-16): hoje `SAM-KIT-TESTACCESS` fica `Blocked` na variante comercial porque não há como dar ao revisor uma licença válida sem cobrança; a variante base não depende disso.
- [Infra — publicação Samsung] Ampliar a matriz de modelos Tizen 8.0 (origem: 078, R-001, 2026-10-16): só a TV de referência (Tizen 9.0) tem evidência; `release/samsung/target-matrix.json` só aprova o que tiver evidência por modelo/firmware, então outros alvos dependem de aparelho (ou Remote Test Lab) para testar.

### Desempenho na TV — o que as features 086 a 089 deixaram aberto

<!-- Leia primeiro a "Regra da feature 088" e a "Regra da feature 089" no CLAUDE.md: elas listam o que já está
     ELIMINADO como causa, com número do aparelho, e as duas armadilhas de medição que custaram caro. -->

- [Medição] **O alvo de fluidez não foi atingido, e a maior parte do tempo preso segue sem dono** (origem: 089,
  encerrada pelo FR-010 em 2026-10-22). Estado medido: thread presa **26%** (alvo < 15%), pior quadro **350 ms**
  (alvo < 300), **44 fps** (alvo ≥ 45 — a um ponto). A redução entregue valeu 30% → 26% e 40 → 44 fps. O que falta
  nomear: a fonte dos **~280 eventos de cache de consulta por janela** de 5 s (`queriesN`), que correlaciona com o
  tempo preso mas **não** caiu quando a janela de prévias parou de se recriar (R-014). Já eliminados com número:
  virtualizador/`scrollToIndex`, pré-carga, decodificação de capa, manipulador de tecla, re-render até o primeiro
  quadro e o próprio painel de medição. Evidências: `sdd/specs/089-tarefas-longas-fora-navegacao/evidencias/`.
- [Medição] **As medições de fluidez das features 087, 088 e das 3 primeiras rodadas da 089 têm viés de 53%**
  (origem: achado do usuário na TV, 089/R-015, 2026-10-22): o roteiro da sonda caía na lista lateral de categorias e
  dali paginava categorias em vez de andar nos cards. Elas comparam **entre si** (mesmo roteiro), mas **não** medem
  navegação de cards. O roteiro agora usa só `→`/`↓` (verificado no PC: 0% na lista), então **a próxima medição começa
  de uma linha de base nova** — não reaproveite os números antigos como referência de fluidez de cards.
- [Medição] **Abrir "Todos" soma ~30 quadros acima de 100 ms no app real** (origem: feature 084, T020, 2026-10-20, R-008): com o `PerfOverlay`, abrir Filmes → "Todos" → Ordenar A–Z leva `quadros>100ms` de 3 para 32–33 tanto no código antigo quanto no novo (a 084 fatiou índice, conversão e ordenação, que a sonda mostrou serem o congelamento de 933–1 233 ms). A causa dominante no app real é outra ou adicional (render da grade, capas, trabalho por render). Evidência: `sdd/specs/084-indice-busca-sem-travar/evidencias/app-real-perfoverlay-2026-10-20.md`.
- [Medição] **Velocidade da 082 na TV física — medida em 2026-10-20, com pendências** (origem: R-021; evidência `sdd/specs/082-orcamento-armazenamento-tv/evidencias/medicao-app-real-tv-2026-10-20.md`): SC-002 passa (105–153 ms), com um outlier de 6,8 s sem causa; SC-003 não fecha em zero (28 quadros > 100 ms com o controle parado, não atribuíveis à compressão); SC-004 parcial (cargas de seção sem erro; faltam 3 listas e a licença, que só existe no build comercial); SC-007 sem número (o guia do Xtream só é baixado depois de 12 h; o bug da tela de progresso "Guia: Carregando" foi corrigido em `sdd/bugs/sincronizar-agora-epg-fica-sincronizando-sem`; medir o download com o build de medição, que já tem as fases do guia).
- [Medição] **Carga por seção mais lenta entre rodadas na mesma instalação** (origem: especificação da 085, 2026-10-20,
  FR-015): na sonda `etapasSecao`, a carga da seção de filmes passou de 22 s para 33 s entre a 1ª e a 2ª rodada da mesma
  instalação, e o orçamento subiu junto. Hipótese, não confirmada: o IndexedDB da TV fica mais lento depois de uma carga
  grande apagada, porque `clear()` não devolve o espaço na hora. Evidência:
  `sdd/assessments/gravacao-carga-secao-tv/evidencias/etapas-gravacao-tv-2026-10-19.md`.
- [Medição] **1ª tecla da busca global com termo de 2 letras** (origem: feature 084, T019, 2026-10-20, R-004): na TV,
  `searchGlobal` com "ma" (7 317 filmes casando) leva 195–228 ms em uma tarefa só (ordenação síncrona dos acertos por
  `Intl.Collator`). Passa de 100 ms; fora do escopo da 084. Evidência:
  `sdd/specs/084-indice-busca-sem-travar/evidencias/quadros-tv-2026-10-20.md`.

### Bugs e testes instáveis registrados para depois

- [Bug] Desvincular (Portal & licença → Avançado) falhou duas vezes seguidas na TV física com `AbortError`, sem apagar o pareamento (gravação local atômica cancelada; nenhum cadastro chegou ao serviço), logo depois de trocar o pacote da homologação para a produção; funcionou na 1ª tentativa após reinstalar o app. Causa não identificada (o backup antes dele dava 401, mas esse passo não propaga o erro). Origem: 081-venda-producao-mercadopago, T018, 2026-10-17; evidência em `sdd/specs/081-venda-producao-mercadopago/evidencias/tv.md`. Retomar com `sdd-bugfix`: mostrar nome+mensagem do erro e do `inner` do Dexie (diagnóstico usado na 081 em `usePortalAccess.ts`, revertido) e reproduzir com bearer recusado (401) + estado da sessão anterior.
- [Bug] `teste-conexao-tv`: suíte E2E da 069 esperava `NET-W-QUOTA`, mas recebeu resultado completo sem aviso (linha 176, espera 5 s). Origem: 069-portal-tv-licenca-anual, 2026-10-11. Usuário decidiu registrar para depois e manter gate E2E pendente; causa não investigada e nenhum teste/timeout alterado. Retomar com `sdd-bugfix`.
- [Bug] Player MPEG-TS no navegador de desenvolvimento: início não confirmado no limite de 15 s em `player-dev-mpegts`, reproduzido em série e na suíte completa. Causa indeterminada; dez trocas, encerramento e reconexão passaram. Origem: 068-legibilidade-tv, R-012, 2026-10-10; evidências em `sdd/specs/068-legibilidade-tv/evidencias/fase4-vod-e2e-completo.txt` e `fase4-e2e-reproducao.txt`. A 068 foi encerrada a pedido do usuário após aprovação de todas as telas na TV; T032/E2E não aprovado. Retomar com `sdd-bugfix`, sem afrouxar timeout.
- [Flake] **`src/lib/player/progressRecorder.falhas.test.ts` falha ~1 em 2 na suíte completa** e passa isolado
  (origem: observado nas features 088 e 089, 2026-10-22; o arquivo não foi tocado por nenhuma das duas, então é
  pré-existente). Dois testes diferentes já falharam ("não vira rejeição solta" e "conclusão que falha é avisada"), o
  que sugere tempo/ordem e não uma asserção específica. Retomar com `sdd-bugfix`, sem afrouxar timeout.
- [Flake] **E2E `orcamento-armazenamento-migracao` falha ~1 em 4 em paralelo** e passa em série (`--jobs 1`, 26 s
  contra 135 s). Conhecido desde a feature 082 e citado nos planos; nunca foi registrado aqui. Observado também na
  089 com a máquina saturada (suíte unitária rodando junto). Retomar com `sdd-bugfix`.
- [Teste] E2E de tela da feature 066 nas superfícies que ficaram só com teste unitário: fileiras do Início, ↺ Histórico/Continuar assistindo e o guia de programação com uma categoria escondida/bloqueada (resíduo aceito do SC-001 na convergência de 2026-10-10).

### Ideias que pedem spec própria

- [Ideia] Login com Google para levar os dados de uso a outra TV/celular (origem: especificação da 072, 2026-10-14). Fora da 072, que guarda o backup preso à identidade da TV; muda ADR-004 (sem conta obrigatória) e pede `sdd-specify` próprio.

<!-- Achados das sondas na TV física (feature 082, 2026-10-18). Números em
     sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda2-capacidades-tv-2026-10-18.md.
     A sonda (sonda-tv/) pode medir de novo antes e depois de cada uma, sempre com autorização. -->
- [Ideia] Filmes e Séries em coluna única (origem: entrevista da 068, 2026-10-10): a lista lateral de categorias da vitrine viraria uma coluna só — categorias; OK troca pela lista/grade da categoria; RETURN volta às categorias com o foco onde estava —, no mesmo modelo que a 068 adota para a TV ao vivo. Fora da 068 por decisão do usuário; depende da 068 (escala de letra) e pede `sdd-specify` próprio, porque muda a navegação de vitrine + grade.

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 002-splash-home-perfis | Splash, ícone do app e Home de perfis/listas | Implementada | 22/22 tasks | 2026-09-16 |
| 017-busca-local-catalogo | Busca Local em Live TV, Filmes e Séries | Implementada | 41/42 tasks | 2026-10-06 |
| 028-limpeza-qa-ds-v14 | Limpeza e QA do Design System V14 (Onda 7) | Implementada | 78/78 tasks | 2026-09-28 |
| 043-gostei-filmes-series | "Gostei" em filmes e séries | Especificada | N/A | 2026-10-01 |
| 050-filmes-series-paridade-v14 | Paridade visual de Filmes e Séries com o Design System V14 | Convergência Pendente | 32/34 tasks | 2026-10-09 |
| 062-teste-conexao-tv | Teste de conexão da TV em Configurações | Em Execução | 30/34 tasks | 2026-10-09 |
| 067-configuracoes-lista-global | Separar configurações da lista das configurações globais do app | Convergência Pendente | 52/53 tasks | 2026-10-10 |
| 072-desvincular-backup | Desvincular a TV do portal e backup dos dados de uso | Em Execução | 44/46 tasks | 2026-10-14 |
| 073-compra-licenca-pix | Compra de licença por Pix na TV e renovação pelo portal | Implementada | 51/51 tasks | 2026-10-16 |
| 074-radio-global | Rádio global por país | Convergência Pendente | 49/53 tasks | 2026-10-15 |
| 075-redesenho-portal-licenca | Redesenho da tela Portal & licença e item Backup | Implementada | 41/41 tasks | 2026-10-16 |
| 078-prontidao-publicacao-samsung | Prontidão para publicação do app Samsung TV | Em Execução | 63/67 tasks | 2026-10-17 |
| 079-home-carregamento-progressivo | Home, Filmes e Séries já montadas ao entrar | Em Execução | 35/41 tasks | 2026-10-17 |
| 081-venda-producao-mercadopago | Venda em produção com Mercado Pago | Em Execução | 34/56 tasks | 2026-10-17 |
| 082-orcamento-armazenamento-tv | Orçamento de armazenamento do app na TV | Implementada | 89/89 tasks | 2026-10-22 |

## Bugs

Triagem de 2026-10-22 (os 11 que restavam). **A coluna "Próximo Passo" é derivada do campo `Result:` do `test.md`**,
então ela não sabe distinguir "ressalva aberta" de "fechado por decisão com ressalva" — e o veredito **não** é inflado
para limpar o painel. O estado real:

- **Fechados por decisão, veredito mantido de propósito** — não há o que fazer neles:
  `epg-manual-falha-ao-salvar-epg-02` (2026-10-05: escopo reduzido a melhorar a mensagem; a causa é do servidor do EPG
  e o app não a elimina) · `epg-nao-atualiza-depois-primeira-carga` (**superado**: foi reaberto como
  `epg-vinculado-recente-mas-guia-vazio`) · `epg-vinculado-recente-mas-guia-vazio` (2026-10-15: a TV voltou a mostrar
  o guia e o "Agora").
- **Esperam só confirmação na TV**, com a correção aplicada e testes verdes — roteiro único em
  `sdd/bugs/ROTEIRO-TV-2026-10-22.md`, uma instalação fecha os seis: `foco-some-ao-descer-na-lista` ·
  `ch-mais-menos-nao-trocam-canal` · `live-tv-carregando-durante-reproducao` ·
  `trailer-setas-horizontais-avancam-video-vez` · `lista-xtream-nao-atualiza-novos-filmes` ·
  `guide-epg-demorando-carregar-na-tela`.
- **Falta trabalho de verdade**: `armazenamento-app-cheio-na-tv-impede` — a fase Test inteira (medição com a sonda e
  confirmação na TV), e o cenário só reproduz com o armazenamento do app cheio.

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| epg-manual-falha-ao-salvar-epg-02 | EPG manual falha com EPG-02 embora o navegador baixe o XML | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-05 |
| foco-some-ao-descer-na-lista | Foco some ao descer na lista de episódios do detalhe da série | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-05 |
| lista-xtream-nao-atualiza-novos-filmes | Lista Xtream não traz filmes/séries/canais novos ao abrir o app | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-09 |
| epg-nao-atualiza-depois-primeira-carga | EPG não atualiza depois da primeira carga | Test | failed | Reabrir fase Assess com evidência nova | 2026-10-10 |
| live-tv-carregando-durante-reproducao | Live TV carregando durante reprodução | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-11 |
| trailer-setas-horizontais-avancam-video-vez | Trailer: setas horizontais navegam botões | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-11 |
| ch-mais-menos-nao-trocam-canal | CH+/CH− não trocam canal no player | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-11 |
| epg-vinculado-recente-mas-guia-vazio | EPG "vinculado, recente" mas guia e "Agora" vazios | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-15 |
| guide-epg-demorando-carregar-na-tela | Guia EPG demorando para carregar na tela de progresso de importacao | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-16 |
| armazenamento-app-cheio-na-tv-impede | Armazenamento do app cheio na TV impede gravar a licença e desvincular | Fix | applied (falta a medição e a confirmação na TV, na fase Test) | Rodar fase Test | 2026-10-17 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| — | — | Arquivadas em `docs/status-features.md` (ver "Arquivo do backlog — 2026-10-22"). |
