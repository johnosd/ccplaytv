# Quickstart no navegador — 068

Data: 2026-10-10. Chromium/Playwright, palco 1920×1080, dados fictícios. Verificação combinada: roteiros automatizados e inspeção das capturas pelo agente. Não constitui aprovação de leitura de longe na TV.

| Item do quickstart | Evidência | Resultado |
| --- | --- | --- |
| 1 — telas, recorte e foco | `node e2e/legibilidade-tv.mjs --capturas ../sdd/specs/068-legibilidade-tv/evidencias/depois`: 69 telas em pt/en/es, 0 achados; 23 capturas. Inspeção visual de perfis, cadastro, Início, categorias/canais, vitrine/grade, detalhes e abas de Configurações/lista. Guia e chrome em reprodução conferidos nas capturas de `tv-web/test-results/headers-catchup/`. | Conferido dentro dos estados exercitados. As vitrines da auditoria incluem o estado de carregamento; os roteiros próprios cobrem o conteúdo carregado. |
| 2 — nome longo / movimento reduzido | `node e2e/legibilidade-tv.mjs --quickstart`: animação real `ccp-marquee`, atraso 1 s, transformação em movimento, nenhuma animação em linha sem foco; `prefers-reduced-motion` e classe interna `reduce-motion` desligam a animação; nome completo no destaque. | Aprovado em pt/en/es. |
| 3 — Live sem topo, OK/RETURN | O mesmo `--quickstart` verifica cabeçalho ausente, coluna inativa invisível, contagem e retorno à categoria por identidade; reentrar restaura o canal lembrado; dois RETURN voltam ao Início. Contrato 068 e E2E da Live também verdes. | Aprovado. SC-004: a saída de canais ao Início é canais → categoria → Início, dois RETURN, dentro do limite de uma tecla adicional. |
| 4 — todas escondidas | `configuracoes-lista-global` passou na primeira execução da suíte; contrato 068 e teste do App verificam o foco e o SELECT em Gerenciar categorias. O roteiro reforçado executa SELECT em vez de clique; revalidado em série (54,9 s), em `fase4-e2e-reproducao.txt`. | Aprovado. |
| 5 — paginação e pontas | `navegacao-por-pagina` e `memoria-foco-key-repeat` verdes na Fase 3 e na primeira execução da suíte da Fase 4; contrato 049 emendado verde na suíte unitária completa. | Aprovado. |
| 6 — en/es | Auditoria e `--quickstart` percorrem os três idiomas; o ciclo da Live e as regras de nome/movimento passaram nos três. | Aprovado. |

Limites: o teclado nativo do sistema Tizen não é desenhado pelo Chromium de desktop. `ime-formularios` passou, incluindo foco/rolagem de campos e Done simulado por keyCode; aparência do teclado nativo fica na TV. O player da auditoria está no estado de erro; o chrome com mídia fictícia em reprodução é coberto por `headers-catchup` e pelos roteiros próprios de player. AVPlay, codecs e leitura de longe não são comprovados por estes resultados.

Gate geral aberto: a primeira suíte E2E terminou 44/46, com falhas em `player-dev-mpegts` (início não confirmado no limite de 15 s) e `performance-navegacao` (contexto en-US com seletores pt). Locale corrigido com autorização; revalidação em série 2/3, navegação e gestão verdes, falha do player repetida. Não equivale a aprovação do gate completo.


## Ajuste posterior — categorias de Filmes/Séries

T035, solicitado pelo usuário e esclarecido em 2026-10-10: apenas a lateral passa a usar a largura expandida de 576 px e as linhas/iniciais da Live; o recolhimento automático de 96 px permanece exclusivo de Filmes/Séries. Pôsteres/fileiras, grade, busca, ordenação e navegação preservados.

Validação atual: 185 testes em 43 arquivos, lint e build:tizen verdes; travas 052/053 íntegras; auditoria renovada de 69 telas pt/en/es sem achados. O E2E de carrosséis passou com verificações de largura, tiles e recolhimento; capturas `tv-web/test-results/carrosseis-filmes-series/04-lista-recolhida.png`, `04b-lista-expandida.png` e `05b-categorias-series.png` inspecionadas pelo agente. A vitrine precisou ler `.side-category-nav-label` em vez do botão inteiro na asserção de remoção do prefixo (o tile é decorativo); revalidada com sucesso, mantendo o critério original. Evidências em `fase4-vod-*.txt`.

A falha inicial do roteiro MPEG-TS no navegador continua aberta (R-012), sem alterar o player. A instalação solicitada é validação visual do ajuste, sem declarar a Fase 4 concluída nem SC-005 aprovado.

Instalação física em 2026-10-10: `deploy-tv.ps1 -TvIp 192.168.0.2 -SkipBuild` aprovado; mesmo certificado Samsung, atualização sem desinstalar, CLI confirmou instalação e lançamento (pid 9415), seguido de applist. Evidência: `fase4-vod-deploy-tv.txt`. Observador técnico: agente, pela saída do CLI; usuário ainda não confirmou a leitura/UX na tela. Suíte completa desta rodada: 44/46 em 1075 s; vitrine corrigida e revalidada depois, falha inicial MPEG-TS segue aberta.

Aprovação física específica recebida em 2026-10-10: observador **usuário**, na TV, de longe; resposta **"Categorias e recolhimento aprovados"**. Leitura das categorias de Filmes/Séries e comportamento de recolher nas fileiras/expandir ao retornar à lateral aprovados. Aprovação restrita a T035; os demais cenários do SC-005 e o gate E2E geral não são inferidos desta confirmação.
