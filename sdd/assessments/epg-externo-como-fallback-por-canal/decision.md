# Assessment Decision: EPG externo como fallback por canal

- **Slug**: epg-externo-como-fallback-por-canal
- **Decidido**: 2026-09-29
- **Problem**: ./problem.md
- **Veredito**: kill (2026-09-29, decisão do usuário após a medição; ver "Veredito final" no fim do arquivo)

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | 10 de 954 canais com programação no painel de referência (feature 030, medido). |
| Força da evidência | adequate | **Atualizado em 2026-09-29 após medição real** (ver "Medição"). Cobertura e precisão do casamento foram medidas na lista real; falta medir a confiabilidade do scraping. |
| Valor vs. custo de inação | adequate | Ganho real mas moderado: de ~10 ids com dados no provedor para ~50–100 canais de ~324 não-[24H]. Custo: job + catálogo + ADR. |
| Viabilidade / apetite | unknown | CORS deixou de ser risco (host nosso). Resta: o job do iptv-org/epg conseguir raspar mi.tv/meuguia.tv a partir de runners do GitHub (bloqueio, mudança de HTML, ToS de scraping). Não testado. |
| Fit estratégico | adequate | Reaproveita o pipeline XMLTV da 030 e respeita ADR-008 (client-first) e "nunca por nome"; dado de terceiros exige emenda de ADR (ADR-010 já foi emendada para endereços de EPG). |

`unknown` em viabilidade: falta verificar CORS e cobertura real. Não foi varrido para fechar o veredito.

## Abordagens Candidatas

### 1. XMLTV público de terceiros + tabela curada estática (fallback por canal)

- O app baixa `epg_ripper_BR*.xml.gz` (ou equivalente) pelo pipeline da 030, guarda como segunda geração de EPG e consulta a tabela `canal → id externo` só quando o provedor não tem programa para o canal.
- **Recomendada**: sim, se o spike confirmar CORS e cobertura — é a única que cumpre as três respostas do usuário (cobertura BR, sem backend, tabela curada).

### 2. Espelho estático gerado por um job diário (free tier)

- **Atualização (2026-09-29)**: o usuário aceita um processo que rode 1x/dia em free tier (AWS Lambda, Google Cloud ou similar). Isso reabre esta abordagem e muda a resposta de "Infra" dada antes.
- Um job diário baixa o XMLTV público, aplica a tabela curada canal→id, filtra a janela −12h…+48h e publica um arquivo estático compacto (JSON/XMLTV gz) com CORS sob nosso controle. O app só baixa esse arquivo.
- Hospedagens candidatas, do menor ao maior número de peças:
  - **GitHub Actions (cron) + GitHub Pages**: sem conta de nuvem; Pages e `raw.githubusercontent.com` já enviam CORS aberto; minutos de Actions grátis em repo público. Ressalva: workflows agendados são pausados após 60 dias sem atividade no repositório.
  - **Google Cloud (Cloud Scheduler + Cloud Run job/Function → bucket GCS)**: free tier permanente cobre 1 execução/dia; o bucket precisa de CORS configurado; exige conta de faturamento ativa.
  - **AWS (EventBridge + Lambda → S3/CloudFront)**: Lambda e EventBridge têm free tier permanente; o free tier de S3 dura só 12 meses e depois cobra centavos.
- Ganhos frente à abordagem 1: CORS resolvido, download menor (o mapeamento e a filtragem ficam no job, não na TV), e a tabela curada pode evoluir sem publicar versão do app.
- Custos novos: um serviço no ar para manter (falha silenciosa do cron), e **redistribuir dados de terceiros** — os termos de uso da fonte passam de "consumir" para "republicar", o que é mais sensível.
- **Recomendada**: sim, como forma preferida de hospedar a abordagem 1, com GitHub Actions + Pages como primeira escolha por não ter conta de nuvem nem cartão. Exige nova ADR (dado de terceiros num host nosso, extensão da ADR-008 "backend só quando estritamente necessário").

### 3. Sugestão por nome + confirmação da pessoa

- Tela em Configurações sugere o id externo por nome e a pessoa confirma.
- **Recomendada**: não — o usuário preferiu tabela curada; pode complementar depois se a tabela não cobrir.

### Nota (2026-09-29): o vínculo canal↔EPG é o risco central

O usuário aceita job serverless/GitHub Actions; o que decide o `go` é **como vincular** canais da lista (ids próprios do provedor) ao EPG externo. Estratégia candidata, em cascata, sempre com vínculo auditável e "sem vínculo" como saída válida:

1. **id exato do provedor** (`epg_channel_id`/`tvg-id`) contra o XMLTV do provedor (já existe, feature 030).
2. **`tvg-id` da lista igual a um id do EPG externo** (id exato, sem custo).
3. **Alias canônico exato**: o job publica um catálogo de canais canônicos (id externo + nomes/aliases, ex.: `channels.csv` do iptv-org/database, CC0). O app normaliza o nome do canal de forma **determinística** (remove prefixos de país `BR|`, tags de qualidade FHD/HD/4K/H265, colchetes) e procura **igualdade exata** no catálogo. Ambíguo (ex.: Globo SP vs RJ) = não vincula.
4. (Depois, se preciso) confirmação manual pela pessoa.

**Decisão do usuário (2026-09-29)**: a regra da 030 pode ser flexibilizada — primeiro id, depois aproximação. O passo 3 passa a admitir casamento aproximado, com estas salvaguardas propostas (a validar no `sdd-specify`/ADR): (a) id sempre vence; (b) tokens de região/variante (SP, RJ, +1, Sports 2) têm de coincidir, e prefixo de país/qualidade é ignorado; (c) limiar de similaridade calibrado por medição na lista real, não escolhido no escuro; (d) ambiguidade (segundo melhor candidato próximo do primeiro) = não vincula; (e) vínculo gravado por canal com a regra usada (`id`/`alias`/`aproximado`) e desfazível; (f) na UI, o EPG vindo de vínculo aproximado é distinguível do vínculo por id. Programa do canal errado é conteúdo inventado na prática, então a precisão medida é critério de aceite, não detalhe.

O passo 3 é casamento por nome, o que a feature 030 proibiu ("nunca por nome"). A regra foi pensada contra fuzzy; igualdade exata sobre alias curado é diferente, mas exige **emenda explícita** (ADR) e medição de precisão antes de ser aceita. O job não pode fazer o vínculo, pois não vê a lista do usuário (credenciais); o vínculo roda no app, e o resultado é gravado por canal.

## Medição (2026-09-29, lista real do `.env` × fontes públicas)

Scripts descartáveis no scratchpad da sessão; nada de credencial saiu do processo. Lista: 2266 entradas = **800 canais únicos** (SD/HD/FHD/4K/[H265] colapsados), dos quais **476 são "[24H]"** (canais de loop de desenho/série, que nunca terão EPG) e 97 são afiliadas regionais da Globo. Sobram **~324 canais que poderiam ter EPG**.

| Fonte / regra | Resultado |
| --- | --- |
| Provedor: `epg_channel_id` preenchido | 954 de 2266 entradas, só **170 ids distintos**; medido na 030: dados para ~10 |
| epgshare01 BR1+BR2: canais no arquivo | 363 (só **189 com programação**; 174 existem sem nenhum programa) |
| epgshare01 — id exato | 12 canais únicos |
| epgshare01 — alias exato (nome normalizado) | +86 únicos casam; só **39 com programação** |
| epgshare01 — aproximado, limiar 0,8 | +1 único (`Sabor & Arte` → `Sabor.&.Arte`, correto) |
| epgshare01 — aproximado, limiar 0,6 | +9 únicos, **quase todos errados** (`Max 2`/`SportyNet 2`/`Canal Goat 2` → `Canal.2`; `Live TV` → `MTV Live`) |
| **Total útil só com epgshare01** | **≈ 52 canais únicos com programação** |
| iptv-org: canais BR ativos com guia em algum site | 201 de 796 (mi.tv 190, meuguia.tv 59) |
| iptv-org — alias exato lista×catálogo BR com guia | **65 canais únicos** (1 ambíguo) |

Leituras:
- **O gargalo é a cobertura da fonte, não o algoritmo de vínculo.** O casamento por alias exato já pega quase tudo o que existe; a aproximação a 0,8 acrescenta 1 canal e a 0,6 só acrescenta erro. Recomendação baseada nos dados: no MVP, **id exato + alias exato**; aproximado só com limiar ≥ 0,8 e região/número coincidindo, ou fora do MVP.
- Os ids do provedor no formato `Ae.br`/`Amc.br` são do estilo iptv-org, e os do epgshare BR1 carregam cidade (`São.Paulo/SP..GloboNews.br`, com encoding quebrado no arquivo); ids do provedor e da fonte só coincidem em 12 canais.
- Casar um canal com um alvo que **não tem programas** (o caso de 174 dos 363) não entrega nada; a métrica útil é "casou com alvo COM programação".
- As afiliadas regionais da Globo (97 entradas: RPC Curitiba, EPTV Campinas…) não existem no epgshare (só 4 alvos Globo); o iptv-org tem poucas (`TVGloboBrasilia`, `TVGloboNordeste`). Exigiriam uma fonte por praça.
- Termos: o README do epgshare01 **não traz licença nem regra de redistribuição** (só pede doação); republicar seus arquivos num espelho nosso não tem respaldo explícito. O iptv-org/epg é CC0.

**Efeito na recomendação:** preferir rodar o **iptv-org/epg no GitHub Actions** (CC0, mi.tv cobre 190 canais BR) a espelhar o epgshare01. O risco passa a ser a confiabilidade do scraping, não o vínculo.

## Veredito

`needs-clarification`. O problema é válido e a direção está definida, mas a barra do `go` exige evidência `adequate`+ nos critérios centrais, e a evidência da fonte externa é `weak` e a viabilidade `unknown`. Ambos se resolvem com uma checagem barata (spike), não com mais definição.

### Se needs-clarification — Perguntas Bloqueantes

- ~~CORS do epgshare01~~: deixa de ser bloqueante, pois o job diário publica num host com CORS sob nosso controle (abordagem 2). Continua útil só se optarmos por baixar direto da fonte.
- Qual hospedagem do job: GitHub Actions + Pages (recomendada) ou nuvem (GCP/AWS)? Decisão do usuário, com impacto em conta/cartão e manutenção.
- ~~Quantos canais casam~~: **respondido** na seção "Medição" (≈52 com epgshare01; 65 casáveis pelo catálogo iptv-org; teto realista ~100 de ~324).
- ~~Termos do epgshare01~~: **respondido**: sem licença/redistribuição declarada, portanto não usar como espelho nosso; iptv-org/epg é CC0.
- **Bloqueante restante**: o grabber do iptv-org/epg, rodado num runner do GitHub, consegue raspar mi.tv/meuguia.tv de forma estável (sem bloqueio, dentro do tempo de um cron diário, com os ~65+ canais BR)? E o scraping desses sites é aceitável do ponto de vista dos termos deles? Um spike de uma execução resolve.
- O ganho (~10 → ~50–100 canais em ~324) justifica um job + ADR para o usuário? (decisão de produto)

**Fase a revisitar**: (superado pelo veredito final abaixo)

## Veredito final (2026-09-29): kill

Depois da medição, o usuário decidiu que **não vale** construir um job externo (Actions/serverless) e uma ADR para ganhar ~50–100 dos ~324 canais que poderiam ter EPG. Motivos registrados:

- O ganho é moderado e limitado pela **cobertura das fontes públicas**, não pelo vínculo; a aproximação de nomes quase não acrescenta canais e, em limiar baixo, só acrescenta erro.
- O caminho de maior cobertura (iptv-org/epg raspando mi.tv/meuguia.tv) depende de scraping cuja estabilidade e aceitabilidade nunca foram testadas.
- Custo permanente (serviço para vigiar, tabela/catálogo para manter, ADR de dado de terceiros num host nosso) desproporcional ao ganho.
- O usuário já tem um processo próprio de scraping (Selenium) que roda na máquina dele; o único obstáculo é precisar de uma máquina ligada para isso.

Nenhuma feature nasce daqui. O registro fica como referência: se a ideia voltar, os números da seção "Medição" e as conclusões (cobertura é o gargalo; alias exato basta; epgshare01 não pode ser espelhado) valem como ponto de partida, sem repetir o levantamento.

**Alternativa sem mudança no app**: o processo de scraping do usuário pode gerar um XMLTV cujos `channel id` coincidam com o `epg_channel_id` que o provedor já dá aos canais, e esse arquivo pode ser apontado pelo campo de EPG manual (Configurações › Fontes IPTV › EPG, feature 030), que tem prioridade sobre o do provedor. Isso reaproveita todo o pipeline existente.
