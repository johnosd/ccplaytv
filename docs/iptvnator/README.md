# Relatórios de Reuso — IPTVnator → CCPlay TV

Leitura do repositório de referência
[`iptvnator`](../../../iptvnator) (player IPTV Angular + Nx + Electron, muito
maduro) com o objetivo de identificar **o que dá para reaproveitar no CCPlay
TV** — aplicativo Samsung Tizen em React + TypeScript + Vite (frontend) e
Python + FastAPI + PostgreSQL (backend).

> ⚠️ **Sobre "reaproveitar".** Os dois projetos têm stacks diferentes
> (Angular/Nx/Electron/TypeScript vs. React/Vite/TypeScript + FastAPI/Python).
> Nada aqui é código copiável literal. Cada item documenta **padrões,
> contratos, algoritmos e decisões** reaproveitáveis, aponta onde ele vive no
> IPTVnator e explica **como adaptar/melhorar** para o CCPlay.

## Como ler estes relatórios

Cada relatório começa com um parágrafo de escopo e uma tabela-resumo. Cada item
reaproveitável segue o mesmo formato:

1. **O que é** — resumo em 2–3 linhas.
2. **Onde está no IPTVnator** — arquivo/símbolo exato (caminhos relativos à
   raiz do repositório IPTVnator).
3. **Por que reutilizar** — valor para o CCPlay.
4. **Como adaptar/melhorar** — tradução para React + FastAPI.
5. **Prioridade** — `P0` (agora), `P1` (pós-MVP) ou `P2` (futuro), com
   justificativa curta.

## Índice

| Arquivo | Frente de análise |
| --- | --- |
| [`01-ui-ux.md`](./01-ui-ux.md) | Navegação por foco remoto, grids, seleção/estados, layout, dashboards |
| [`02-arquitetura.md`](./02-arquitetura.md) | Separação TV/backend, abstração de player, offline-first, jobs pesados |
| [`03-apis.md`](./03-apis.md) | Parsing M3U, Xtream, Stalker, TMDB, SSRF/redação |
| [`04-skills.md`](./04-skills.md) | Padrão de skills de repositório e processos de validação |
| [`05-documentos.md`](./05-documentos.md) | Estrutura e convenções da documentação de arquitetura |
| [`06-carga-listas-url-xtream.md`](./06-carga-listas-url-xtream.md) | Processo de carga de listas URL e Xtream (deep-dive) |
| [`07-tela-canais.md`](./07-tela-canais.md) | Tela de canais: categorias, seleção, preview e player |
| [`08-tela-filmes.md`](./08-tela-filmes.md) | Tela de filmes: grid, card, detalhes e player |
| [`09-dashboard-home.md`](./09-dashboard-home.md) | Dashboard/Home: hero + rails de conteúdo |
| [`00-resumo.md`](./00-resumo.md) | Consolidação: top itens por área + plano de adoção por fase |

## Áreas priorizadas

Os relatórios priorizam as áreas escolhidas na entrevista:

- EPG / XMLTV / guia de programação
- Xtream Codes (provedor por credenciais)
- TMDB / enriquecimento de metadados
- Player e reprodução (AVPlay vs players do IPTVnator)
- Remote control + voz
- UI/UX e navegação por foco remoto
- Skills e processos (SDD)

## Convenções

- Caminhos do IPTVnator são relativos a `c:\Users\johns\Documents\Projetos\iptvnator\`.
- Caminhos do CCPlay são relativos a `c:\Users\johns\Documents\Projetos\ccplayTv\`.
- Os relatórios não reproduzem credenciais reais de provedores.
