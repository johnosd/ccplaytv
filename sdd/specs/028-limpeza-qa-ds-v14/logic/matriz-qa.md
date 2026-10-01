# Lógica: matriz de QA Tizen (§34) — execução e classificação (feature 028)

Fonte da verdade para a US3 (FR-010–FR-014). A entrega é
`sdd/specs/028-limpeza-qa-ds-v14/matriz-qa.md`, criado pelo executor.

## 1. Telas (linhas)

Splash · Perfis · Adicionar lista · Importação (progresso/concluída/falha)
· Início (+ modal sair) · Busca · Configurações (Fontes, Acessibilidade,
Sobre, abas "Em breve") · Live TV (trilha, lista, ★ Favoritos, Todos,
zapping) · Filmes · Séries · detalhe de filme · detalhe de série (+ modal de
temporada, contagem do autoplay) · player (VOD, Live faixa/linha, erro) ·
modais (excluir lista, sair).

## 2. Critérios (colunas) e como cada um é verificado

| Dim. | Critério (§34) | Como verificar |
| --- | --- | --- |
| Remote | todos os itens acessíveis por setas | testes de tela existentes + navegação no E2E |
| Remote | Select executa ação esperada | testes da US2 + testes de tela |
| Remote | Return fecha nível atual | testes de tela / `appNav` |
| Remote | sem loop acidental em início/fim | testes de tela (clamp) |
| Remote | foco nunca desaparece | teste de tela: sempre um `.tv-focus` em cada estado |
| Remote | foco retorna ao item anterior após modal/detalhe | testes de tela / E2E |
| Visual | um único foco por vez | teste de tela: exatamente um `.tv-focus` |
| Visual | foco visível sem depender de cor | inspeção: `.tv-focus` = contorno + escala (ADR-007) em todo focável |
| Visual | indicador de overflow quando necessário | E2E/captura (§4 abaixo) |
| Visual | sem sobreposição durante repetição rápida | **só-na-TV** |
| Visual | textos legíveis a distância | inspeção: nenhum texto abaixo do menor token de fonte |
| Visual | sem layout shift ao carregar | captura/E2E: skeleton × card com a mesma caixa |
| Perf. | assets locais no shell | grep: nenhuma URL externa de fonte/ícone/CSS |
| Perf. | sem GIF animado para UI | grep em `assets`/`src` |
| Perf. | sem backdrop blur pesado | grep `backdrop-filter`/`filter: blur` |
| Perf. | listas extensas virtualizadas | inspeção: Live/Filmes/Séries/episódios/Rail |
| Perf. | imagens no tamanho de uso | inspeção de `PosterArt`/capas |
| Perf. | trailers cancelados ao perder foco | **não se aplica** (sem trailer/preview no foco, ADR-011) |
| Perf. | teste em hardware real | **só-na-TV** (passada obrigatória, SC-008) |

## 3. Resultado de cada célula

`aprovado` · `reprovado-corrigido (Tnnn)` ·
`reprovado-registrado (backlog: <título>)` · `só-na-TV` (preenchido na
passada física) · `n/a (motivo)`. Toda célula tem evidência curta:
arquivo:linha, nome do teste, captura ou comando.

## 4. Pequeno × grande (FR-012/FR-013)

**Pequeno — corrige aqui**: CSS e tokens; `aria-*`/nome acessível; classe
de foco faltando ou duplicada; indicador de overflow **já existente** não
aplicado; layout shift resolvido por dimensão fixa; barra de rolagem nativa
(FR-006); `onSelect` da tela que não roteia para o botão já desenhado.

**Grande — vai pro backlog**: mudar para onde uma tecla leva; criar
componente, tela, estado ou indicador novo; mudar dado ou consulta;
qualquer coisa que exija decisão de design. **Na dúvida, é grande.**

Indicador de overflow vertical (trilhas e grades): o sinal do DS é a
próxima linha/item parcialmente visível (a grade e a trilha já cortam o
próximo item). Não existe componente de indicador vertical. Se uma tela
esconder por completo o que vem depois, é **grande** (criar indicador) — vai
pro backlog.

## 5. Formato do documento

Uma tabela por dimensão (tela × critério), seguida de:

- **Correções feitas**: ID da task, tela, critério, arquivo.
- **Registradas no backlog**: título exato da entrada criada.
- **Diferenças visuais intencionais**: a mesma lista de `INTENTIONAL` do
  script de paridade.
