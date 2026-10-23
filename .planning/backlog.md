# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

Só o que está **pendente**, na ordem sugerida de execução. O que foi entregue está em `docs/status-features.md`.

- [Infra — publicação Samsung] Ampliar a matriz de modelos Tizen 8.0 (origem: 078, R-001, 2026-10-16): só a TV de referência (Tizen 9.0) tem evidência; `release/samsung/target-matrix.json` só aprova o que tiver evidência por modelo/firmware, então outros alvos dependem de aparelho (ou Remote Test Lab) para testar.


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
| 090-legendas-externas | Legendas externas (OpenSubtitles e SubDL) | Em Execução | 67/69 tasks | 2026-10-23 |
| 091-chave-legenda-portal | Chave de legenda digitada no portal | Especificada | N/A | 2026-10-23 |

## Bugs


| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| epg-manual-falha-ao-salvar-epg-02 | EPG manual falha com EPG-02 embora o navegador baixe o XML | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-05 |
| foco-some-ao-descer-na-lista | Foco some ao descer na lista de episódios do detalhe da série | Test | verified | Concluído | 2026-10-22 |
| lista-xtream-nao-atualiza-novos-filmes | Lista Xtream não traz filmes/séries/canais novos ao abrir o app | Test | verified | Concluído | 2026-10-22 |
| epg-nao-atualiza-depois-primeira-carga | EPG não atualiza depois da primeira carga | Test | failed | Reabrir fase Assess com evidência nova | 2026-10-10 |
| live-tv-carregando-durante-reproducao | Live TV carregando durante reprodução | Test | verified | Concluído | 2026-10-22 |
| trailer-setas-horizontais-avancam-video-vez | Trailer: setas horizontais navegam botões | Test | verified | Concluído | 2026-10-22 |
| ch-mais-menos-nao-trocam-canal | CH+/CH− não trocam canal no player | Test | verified | Concluído | 2026-10-22 |
| epg-vinculado-recente-mas-guia-vazio | EPG "vinculado, recente" mas guia e "Agora" vazios | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-15 |
| guide-epg-demorando-carregar-na-tela | Guia EPG demorando para carregar na tela de progresso de importacao | Test | verified | Concluído | 2026-10-22 |
| armazenamento-app-cheio-na-tv-impede | Armazenamento do app cheio na TV impede gravar a licença e desvincular | Fix | applied (falta a medição e a confirmação na TV, na fase Test) | Rodar fase Test | 2026-10-17 |
| e2e-campos-da-listagem-nao-acha-fileira-avaliados | fileira de categoria fica em "esqueleto" depois que a pré-carga entrega a categoria | Test | verified | Concluído | 2026-10-23 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| — | — | Arquivadas em `docs/status-features.md` (ver "Arquivo do backlog — 2026-10-22"). |
