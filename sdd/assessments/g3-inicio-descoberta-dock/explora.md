# Assessment Explora: G3 — Início, descoberta e dock

- **Slug**: g3-inicio-descoberta-dock
- **Criado**: 2026-10-06
- **Origem**: `.planning/backlog.md`, pacote G3; pedido de análise do usuário.

## Ideia Bruta

O pacote reunia descoberta, trailer, classificação/nota, IA e serviços do dock. Os itens 69 e 32 foram absorvidos pela 060; o 72, pela 061. Restam 30 (recomendações/curadoria), 31 (chat de descoberta) e 54 (clima e teste de velocidade).

## Evidência a Favor

- O usuário confirmou: “Só teste de velocidade para ajudar a investigar travamentos”. É demanda por diagnóstico, sem reprodução de bug ou causa de travamento identificada nesta avaliação.
- `tv-web/src/lib/comingSoon.ts`, `features/home/HomeContent.tsx` e `features/settings/integrationsModel.ts` já registram o acesso `dock-speedtest`; o teste continua inexistente.
- V14 §21.5 prevê download, upload, latência e jitter, iniciados pelo usuário. ADR-008 permite integração direta, sem backend obrigatório; ADR-011 mantém a precedência das decisões sobre exemplos do DS.
- A [documentação oficial do motor Cloudflare](https://github.com/cloudflare/speedtest/blob/main/README.md), consultada em 06/10/2026, descreve medições no navegador, endpoints HTTPS, sequência configurável e controle de início/pausa. Isso sustenta viabilidade conceitual; não comprova execução na TV com origem `file://`.
- Existe uma diferença real entre o 30 e a entrega atual: `becauseSeed.ts` escolhe o último título concluído; `becauseApi.ts` usa semelhantes disponíveis localmente. `discoveryRules.ts` seleciona a Dica por critérios gerais, sem combinar favoritos e histórico.

## Evidência Contra

- O usuário respondeu sobre descoberta: “Nada concreto por enquanto; avaliar apenas a sobreposição”. A personalização adicional do 30 e a conversa do 31 não têm necessidade atual confirmada.
- 057/060 já oferecem Dica, Top 10 e “Porque você assistiu”. A diferença técnica do 30 não é evidência de valor incremental suficiente.
- O usuário apontou utilidade apenas para velocidade no 54. Clima acrescentaria integração e configuração independentes do diagnóstico desejado.
- “31 depende de 30” é uma ligação declarada no backlog; não foi encontrada uma necessidade técnica de entregar curadoria automática antes de consultar o catálogo por conversa. `localTitleMatch.ts` já resolve títulos e informa cobertura local. Isto não torna o chat pronto nem garante metadados completos para pedidos por duração/gênero.
- O teste mede a rota até seu endpoint. Inferência: um bom resultado até Cloudflare não confirma a saúde da rota do provedor IPTV nem estabelece a causa de um travamento. A [explicação oficial do teste](https://speed.cloudflare.com/about) descreve sua medição de conexão até a rede Cloudflare.
- O motor documentado inicia automaticamente por padrão, pode transferir bastante dado e informa coleta de resultados pela Cloudflare. Adotá-lo sem revisar configuração, consumo e envio de resultados seria inadequado ao escopo. Não houve instalação de dependência nem execução de teste de rede nesta análise.

## Perguntas em Aberto

- Para especificar o teste: quais métricas entram no primeiro recorte, qual limite de bytes/duração e como encerrar transferências ao cancelar?
- Para planejar: o endpoint e a medição funcionam no `file://` da TV? Há coleta adicional de resultados, e qual configuração/política será adotada?
- Para reabrir IA: qual pedido concreto a descoberta existente não atende? Não há pergunta de produto bloqueante para retirar essas frentes do horizonte atual.
