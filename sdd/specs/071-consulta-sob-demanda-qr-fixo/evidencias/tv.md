# TV física — feature 071 (T033)

Data: 2026-10-14. Aparelho: Samsung QN50Q60DAGXZD (192.168.0.2). Observador: o usuário (eu só instalei e conferi logs).

## Instalação

- Pacote comercial (`build:tizen:commercial`, origem do staging + JWKS público), instalado e lançado com
  `deploy-tv.ps1 -SkipBuild`, **sem desinstalar** (IndexedDB preservado). A API já estava publicada
  (`evidencias/staging.md`). Foram quatro instalações no dia: a 1ª para o quickstart; as seguintes com os ajustes de UX
  da Fase 7 (A006/A007) e da A008.

## Observado pelo usuário

| Cenário / item | Resultado | Fonte |
| --- | --- | --- |
| 2 — Adicionar lista: cadastro, ID/chave/QR | funcionou | relato do usuário |
| 3 — QR aberto no navegador: painel autenticado | funcionou (acessou o site) | relato do usuário |
| 4 — Lista criada no site → Recarregar: aparece na TV e volta à tela de listas | funcionou | relato do usuário |
| A006 — "Adicionar lista" como abas Pelo site / Xtream Codes / Lista M3U, abrindo em Pelo site; só Recarregar e Voltar na aba do site; RETURN cai na tela de listas | "sim" nos 4 itens da revisão | relato do usuário |
| A007 — excluir uma lista na TV some do site sem apertar Atualizar | "sim" | relato do usuário |
| A008 — 1ª entrada na lista vinda do site mostra o progresso (categorias carregando) | "tudo certo agora" | relato do usuário |

Veredito geral do usuário: o fluxo está funcional; os ajustes pedidos (organização das telas, exclusão no ato e
progresso na 1ª entrada) foram revistos na TV e aprovados.

## Fora do teste na TV, por decisão do usuário (2026-10-14)

Não serão testados na TV física; ficam cobertos só pelo E2E local (`consulta-sob-demanda.mjs`, pilha local), que
não prova relógio nem rede reais do aparelho:

| Cenário | Cobertura que fica |
| --- | --- |
| 5 (parte offline) — adicionar na TV com o serviço fora do ar e subir no próximo Atualizar | E2E local (portal bloqueado → fila → Atualizar) e unitários da fila `sourceUploads` |
| 7 — 7 dias passados: bloqueio com QR, ID e chave | E2E local (teste vencido por marca de 8 dias, bloqueio sem rede) e unitários do teste local |
| 9 — TV parada: nenhuma requisição | E2E local (5 s parado, 0 requisições; sem timers no agente) e contratos da 071 |
| 10 — nova chave por Configurações → Portal & licença → "Revogar acessos ao portal" (QR e chave antigos deixam de valer) | E2E local (QR antigo recusado, QR da tela muda) e unitários da rotação |

## Sem observação ainda

Cenário 6 sem observação dedicada (ocorreu no uso), cenário 8 (compra; a venda segue desligada), medição de tempo do
Atualizar e AVPlay.

Cenários não observados não contam como aprovados na TV: ficam só com a cobertura acima (decisão do usuário em
2026-10-14). Com isso a T033 foi encerrada pelo usuário.