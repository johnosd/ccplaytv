# Assessment Explora: EPG externo como fallback por canal

- **Slug**: epg-externo-como-fallback-por-canal
- **Criado**: 2026-09-29
- **Origem**: texto colado (dúvida do usuário sobre depender só do EPG da lista IPTV)

## Ideia Bruta

Hoje o EPG vem só do que a lista/provedor entrega (feature 030: `xmltv.php`, `url-tvg` do M3U ou endereço digitado). Ideia: usar um EPG público de terceiros como **fallback por canal**, para cobrir canais BR sem programação no provedor, com mapeamento canal → id externo por tabela curada estática e sem casamento fuzzy automático.

## Evidência a Favor

- Feature 030: o painel de referência só trouxe programação para **10 ids de canal** na janela, embora 954/954 ids casassem (`sdd/specs/030-epg-dados-agora/plan.md`).
- Já existe endereço XMLTV manual com prioridade sobre o do provedor (feature 030), então o pipeline (Worker, gzip, janela −12h…+48h, tabela `epgPrograms`) já lê XMLTV arbitrário.
- epgshare01 publica arquivos BR pequenos e atualizados no dia da consulta (2026-09-29): `epg_ripper_BR1.xml.gz` ~654 KB e `epg_ripper_BR2.xml.gz` ~118 KB (fonte: índice do diretório `epgshare01.online/epgshare01/`). Tamanho é compatível com a TV.
- iptv-org/epg é CC0, gera XMLTV diariamente e é self-hostável (fonte: README do repositório).

## Evidência Contra

- **ASSUMPTION**: cobertura real dos canais BR da lista do usuário nesses arquivos — não medida (não sei quantos canais/ids há em BR1/BR2 nem quantos casam com a lista).
- **ASSUMPTION**: o servidor de epgshare01 envia CORS que permita o `fetch` a partir do WebView da TV — não verificado. Sem CORS, cai em backend/proxy (contra ADR-008).
- Termos de uso do epgshare01 não lidos (há um `0_READ_ME_FIRST…html` no diretório); sem SLA, serviço de terceiros que pode sumir.
- O iptv-org/epg não documenta URL pública centralizada de guias: exigiria hospedar o próprio job (infra que o usuário disse não querer).
- Ids externos não coincidem com `tvg-id` da lista; sem mapeamento não casa nada, e a tabela curada tem custo de manutenção contínuo.

## Perguntas em Aberto

- Quantos dos canais BR da lista real casariam via tabela curada, e com quais ids externos?
- O host escolhido responde com `Access-Control-Allow-Origin` adequado?
- Quais os termos de uso e a estabilidade histórica da fonte?
