# Quickstart — verificação da feature 057 (Top 10 da semana e Dica, TMDB)

## Pré-requisitos

- `tv-web/` com dependências instaladas; `npm run dev` no ar (E2E e verificação manual no navegador).
- Uma lista ativa **Xtream** com categorias de filmes e séries já obtidas no aparelho (as fileiras só cruzam o que já está no IndexedDB). A lista real do usuário serve; as credenciais ficam no `.env` da raiz (`CCPLAY_PROBE_*`) e nunca em código, log ou commit.
- Uma chave TMDB válida configurada em **Configurações → Integrações** (BYOK da feature 032). Para o cenário sem chave, remova-a nessa mesma tela.
- A expectativa de cobertura: só ≈ 59% dos filmes têm ano na listagem (R-004). O Top 10 pode mostrar menos de 10 cards e a Dica depende de haver ≥ 5 candidatos; "sumiu" com poucos casamentos é o comportamento correto.

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx   # 5/5 verdes
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb                          # trava íntegra
npx tsc -b
npm run lint
npm run test
node e2e/run.mjs --only top10-dica --jobs 1                                                                  # E2E novo (TMDB simulado)
npm run test:e2e                                                                                             # suíte inteira (gate)
npm run build:tizen                                                                                          # confere tizen_web_project.yaml
```

## Cenário ponta a ponta (navegador, `npm run dev`)

1. **Com chave e lista cobrindo parte do ranking** — abrir **Filmes**: a fileira "Em alta esta semana" aparece logo após "Continue assistindo" (ou como primeira), no formato número grande sobre o pôster. Os cards são numerados 1, 2, 3… sem buracos; ao focar um card, o destaque do topo mostra a posição real no TMDB ("Nº 6"). No cabeçalho: "Fonte: TMDB" e, enquanto houver categorias não obtidas, "Com base em X de Y categorias".
2. Focar cards só atualiza o destaque (nenhuma requisição de rede ao focar: abrir as DevTools → Network, mover o foco); **OK** abre o título da lista; voltar restaura o foco no mesmo card.
3. A fileira **"Dica de filme"** aparece depois de "Adicionados recentemente"/"Bem avaliados" e antes de "Porque você assistiu"; fechar e reabrir a tela no mesmo dia mostra os mesmos cards na mesma ordem. Para ver o "outro dia": mudar o relógio do sistema para o dia seguinte e reabrir (ou limpar a linha `pool:movie:pt` em IndexedDB → `discoveryCache`; o sorteio muda pela semente do dia).
4. Repetir em **Séries** ("Em alta esta semana", "Dica de série").
5. **Início**: as quatro linhas aparecem sob "Canais favoritos" e antes de "Curadoria IA"; cada uma some se faltar dado; OK abre o título; voltar ao Início restaura o foco na mesma linha e card.
6. **Sem chave**: remover a chave em Integrações — as quatro fileiras somem das três telas, sem erro, sem "Em breve" do Top 10, e a navegação por controle remoto segue completa. Conferir em IndexedDB que `discoveryCache` ficou vazia.
7. **Sem rede depois de um uso bem-sucedido** (DevTools → Offline): reabrir — as fileiras vêm do cache (Top 10 da semana, Dica do dia). Com a tabela vazia e offline, as fileiras ficam ausentes.
8. **Mais de uma versão**: escolher um título da lista que exista como principal, `[L]` e 4K — o card abre a versão principal; um título que só existe como `[L]`/4K entra com essa versão.

## Pre-acceptance checklist da constitution (cross-cutting)

- [X] Todo estado das fileiras (com dado, ausente, cobertura parcial) tem ao menos um elemento focável na tela; nenhum "carregando" sem foco.
- [X] Voltar restaura foco e posição por id (hero e Início).
- [X] A chave TMDB não aparece em log, mensagem de erro, UI nem em `discoveryCache`; nenhuma chamada ao TMDB ao focar.
- [X] Nenhuma nota/etiqueta cita IMDb; a nota do selo continua a do provedor.
- [X] Fileiras ausentes não deixam slot "Em breve" do Top 10 (o de "Porque você assistiu" continua).
- [~] Medição SC-008: só o cruzamento isolado foi medido (R-003); abertura do Início/Filmes antes × depois no navegador não foi medida.
- [ ] Passada na TV física recomendada: abrir Início com chave configurada e conferir fluidez do controle remoto (dois índices em memória).
