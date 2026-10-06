# Assessment Explora: G2 — Integridade da carga e do catálogo

- **Slug**: g2-integridade-carga-catalogo
- **Criado**: 2026-10-06
- **Origem**: ideia do backlog (`.planning/backlog.md` → `## Ideias Futuras` → pacote G2, itens 36, 26, 24, 66 e 51)

## Ideia Bruta

Pacote de cinco itens sobre a integridade da carga e do catálogo no aparelho:

- **36** — dedup/single-flight da importação inteira de uma fonte (duas telas ou hooks não disparam o mesmo trabalho).
- **26** — seção "Não classificados": itens sem tipo confiável ficam visíveis e acessíveis, com regra de correção reaplicável.
- **24** — reconciliação pós-resync ("pending restore") de favoritos e progresso por chave estável.
- **66** — busca global por blocos em fluxo, para listas de ~300 mil itens.
- **51** — descarte quando o espaço do aparelho acaba (categoria menos usada, parar e declarar, ou teto configurável).

O próprio backlog já marcava 24, 66 e 51 como "A avaliar — só entram com medição".

## Evidência a Favor

- **36**: a checagem de importação em andamento (`activeRunFor` → `ImportAlreadyRunningError`, `tv-web/src/lib/catalog/importPipeline.ts:257-266`) lê e depois grava em passos separados, não numa transação. Duas chamadas quase simultâneas de `startLocalImport` (há quatro chamadores em `tv-web/src/features/import/importApi.ts`: 317, 396, 467 e 491) poderiam passar juntas. ASSUMPTION: a brecha existe na teoria; nenhuma reprodução.
- **26**: entradas M3U de tipo não reconhecido são descartadas sem tocar o disco (`importPipeline.ts:561-568`); a pessoa só vê o aviso "Entradas de tipo não reconhecido ficaram de fora" e a contagem (`ProfilesScreen.tsx:389`, `SourcesPanel.tsx:127`). O item, de fato, fica inacessível.
- **24**: nenhuma a favor encontrada além do raciocínio do backlog.
- **66**: existe uma busca global (`features/search/SearchScreen.tsx`, `lib/catalog/globalSearch.ts`, feature 026), que em listas muito grandes leria muito dado.
- **51**: o app já detecta e avisa "A lista não coube inteira no aparelho" (`importApi.ts:229`); o que falta é uma política de descarte.

## Evidência Contra

- **36**: a dedup por fonte **já existe** (FR-017 da 005), persistida no banco e com tratamento de execução abandonada. O usuário nunca viu importação duplicada, contagem dobrada nem o erro de importação em andamento (resposta de 2026-10-06).
- **26**: listas Xtream classificam pela seção do painel e não descartam nada; a lista real do usuário é Xtream. O usuário nunca viu o aviso de entradas descartadas.
- **24**: favoritos, progresso e histórico já usam a chave lógica estável (fonte + tipo + id do painel), que sobrevive ao resync. O usuário nunca perdeu favorito, progresso ou histórico depois de atualizar uma lista.
- **66**: a lista real tem cerca de 55 mil itens (43 262 filmes, 9 716 séries e 2 360 canais medidos em 2026-10-06), não 300 mil. Além disso, o usuário **não quer busca global**: "o ideal é o que temos hoje, busca em filmes e busca em series".
- **51**: os 55 mil itens couberam no aparelho em blocos (feature 039); nenhum aviso de espaço foi relatado. Sem a quota real da TV medida, não há como desenhar a política.

## Perguntas em Aberto

- A busca global da 026 (`SearchScreen`) continua no app, mas o usuário diz que o ideal é a busca por Filmes e por Séries. Isso pede uma decisão de produto própria (manter, esconder ou retirar), fora deste pacote.
