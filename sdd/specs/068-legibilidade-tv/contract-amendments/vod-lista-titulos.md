# Emenda proposta — Filmes e Séries em lista

**Descartada após esclarecimento do usuário (2026-10-10):** "só iremos mexer na lista de categorias; apenas, o restante ficará como está hoje". Vale somente a aproximação visual da lateral à Live, preservando pôsteres/fileiras, grade, navegação e recolhimento automático. Não emendar contratos nem regravar travas por esta proposta. O texto abaixo registra a interpretação anterior, que não será implementada.

Data: 2026-10-10. Origem: pedido do usuário para aplicar categorias → lista de títulos como na Live, mantendo o recolhimento somente em Filmes/Séries, seguido de instalação na TV.

## Comportamento para revisão

- Filmes e Séries começam na lista de categorias da fonte, com o padrão visual e a legibilidade da Live.
- SELECT numa categoria abre a lista vertical de títulos daquela categoria, com o destaque do título focado à direita. Os títulos deixam de ser carrosséis/grade neste fluxo.
- A lateral de categorias pode recolher ao entrar nos títulos e expande ao retornar a ela; isso é exclusivo de Filmes/Séries. A Live permanece com o comportamento já aprovado.
- SELECT num título abre o detalhe existente (filme ou série), preservando reprodução, temporadas/episódios e suas ações. Focar um título não reproduz nem consulta serviço externo.
- RETURN do detalhe restaura título e rolagem por identidade; RETURN dos títulos restaura a categoria; RETURN das categorias volta ao Início.
- Busca e ordenação continuam acessíveis por controle remoto na lista de títulos. Favoritos, histórico, progresso, categorias bloqueadas/ocultas e estados de carregamento/vazio/erro são preservados.
- Fileiras de descoberta existentes (Continue assistindo, recentes, notas e recomendações quando há dados reais) precisam manter acesso equivalente como entradas de lista; não se apaga silenciosamente uma função para trocar o layout.
- Nomes longos usam o padrão da Live (reticências fora de foco, texto completo no foco, redução de movimento respeitada); listas grandes continuam virtualizadas.

## Contratos conflitantes confirmados

1. `tv-web/src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (trava 053): exige fileiras de cards por categoria e recolhimento ao entrar nas fileiras. Substituir essas asserções por categorias → títulos, recolhimento/expansão, SELECT/RETURN e restauração por id, mantendo ausência de consultas/reprodução ao focar.
2. `tv-web/src/features/vod/VodCategoryScreen.vitrine-filmes-series.contract.test.tsx` (trava 052): exige grade, ausência de sidebar/hero e deslocamento horizontal entre cards. Substituir geometria e teclas pela lista vertical com destaque, mantendo toolbar, abertura do detalhe com estado de volta e favoritos vazios com saída focável.

Outras travas que referenciam essas telas/modelos: 025, 036, 049, 052, 053, 056, 057 e 060. Revisar cada asserção antes de editar; emendar apenas o que contradiz o novo layout, preservando critérios funcionais. Registrar os arquivos efetivamente emendados e os hashes após autorização.

## Estado

Escopo de produto solicitado pelo usuário. Alteração dos testes travados e regravação de suas travas ainda não autorizadas explicitamente. Nenhum contrato foi alterado por esta proposta.

Após autorização: atualizar spec/plano/tasks da 068 com esta ampliação, aplicar emendas mínimas, implementar, executar gates unitários/E2E e build Tizen, instalar com o mesmo certificado sem desinstalar. A falha inicial de `player-dev-mpegts` (R-012) continua aberta e deve ser resolvida antes do gate E2E completo; não afrouxar seu limite de 15 s.
