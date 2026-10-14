# Assessment Explora: G4 — Acessibilidade de sistema

- **Slug**: g4-acessibilidade-sistema
- **Criado**: 2026-10-06
- **Origem**: ideia do backlog, pacote G4, item 56; avaliação solicitada pelo usuário.

## Ideia Bruta

Aparência configurável de legendas (tamanho, cor, fundo e contorno), com prévia real e consideração das preferências de caption da TV quando expostas; alto contraste por tokens; anúncios configuráveis sobre a região `aria-live`. O backlog agrupava as três frentes como uma feature de dificuldade alta e estado Pronto.

## Evidência a Favor

- O Design System V14, §§31/38/39, prevê essas opções. O Component Lab, seções `accessibility` e `voice`, apresenta conforto visual e anúncios; o protótipo apresenta controles de acessibilidade. São referências de intenção, não evidência de demanda atual.
- `tv-web/src/components/SubtitleOverlay.tsx` já desenha texto de legendas embutidas. `tv-web/src/styles/player.css` define aparência fixa; há uma base concreta para futura personalização.
- `tv-web/src/components/AnnouncerRegion.tsx` e `tv-web/src/lib/announcer.ts` já oferecem região persistente `aria-live="polite"` e anúncios sem mover o foco.
- `tv-web/src/features/settings/AccessibilityPanel.tsx` e `tabs/AccessibilityTab.tsx` mantêm as três opções como placeholders honestos; reduzir movimento e idioma já são ações reais.
- **ASSUMPTION**: pessoas com necessidades visuais ou de leitura de legendas poderiam se beneficiar dessas opções. Não há relato de um caso afetado nesta avaliação.

## Evidência Contra

- Perguntado sobre dificuldade de ler legendas, enxergar a interface, uso do Voice Guide ou apenas completar o Design System, o usuário respondeu em 06/10/2026: **“Nao vejo necessidade nisso agora”**. É evidência direta de falta de apetite atual para o pacote, não prova de que acessibilidade nunca terá valor.
- Não foi relatada falha de legibilidade, necessidade de narração ou barreira de uso que o G4 resolveria agora. Um controle Em breve não demonstra, sozinho, problema de produto prioritário.
- Sincronização já existe na 029: atraso positivo é aplicado; adiantar legendas embutidas fica indisponível com explicação (`plan.md`, D-006). Não cabe contar sincronização como entrega inteiramente nova nem prometer valores negativos sem capacidade real.
- O pacote une três problemas distintos, ampliando o esforço de implementação e validação sem necessidade atual confirmada.
- A base de `aria-live` no código não comprova narração pelo Voice Guide da TV. Preferências de caption e comportamento assistivo no aparelho não foram verificados nesta avaliação.

## Perguntas em Aberto

- Nenhuma pergunta bloqueia a decisão de retirar o pacote atual: o usuário declarou ausência de necessidade agora.
- Para eventual retomada, identificar uma barreira concreta, a pessoa afetada e a frente necessária; então verificar apenas as capacidades de plataforma exigidas por essa frente.

## Limites da Pesquisa

Leitura do repositório e das referências locais, sem execução de testes ou validação física. As duas tentativas de pesquisa web falharam com HTTP 401 por autenticação invalidada; nenhuma conclusão sobre APIs atuais do Tizen depende dessas tentativas. Não foram modificados código, Design System, ADRs ou constitution.
