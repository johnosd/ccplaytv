# ADR-008: Arquitetura client-first — backend só quando estritamente necessário

## Status

Aceita.

## Data

2026-09-19.

## Contexto

O ADR-001 rejeitou explicitamente "Aplicativo standalone na TV" e fixou uma
arquitetura de backend dedicado (Python/FastAPI) para importação, catálogo
e integrações — decisão tomada sem a motivação de custo entrar em jogo. O
ADR-006 já assumia essa mesma divisão como dada, prevendo só "backend no
computador com evolução desejada para VPS" (E4) como caminho natural de
produção.

O usuário levantou uma restrição de custo real: quer uma opção em que a
pessoa instale o app e **não dependa de nenhum outro serviço de backend**,
rodando em PC ou em VPS — só pagaria por infraestrutura de servidor se isso
realmente mudasse o produto. Uso pessoal continua sendo o caso primário,
mas distribuição comercial pra outras pessoas segue sendo objetivo de médio
prazo (confirmado na discussão) — o que descarta soluções que só funcionam
"porque é só eu usando".

O ponto técnico central da discussão: `ccplayTv` é um **app web** (React/TS/
Vite empacotado como `.wgt` Tizen, rodando em WebView/Chromium), não um app
nativo. Um app nativo (Android/TV) não tem essa restrição — é por isso que
existem tantos players Xtream client-only nesse formato. Um app web,
diferente disso, roda sob a política de CORS do navegador: se o painel do
provedor não declarar `Access-Control-Allow-Origin`, o `fetch()` do app não
consegue ler a resposta, não importa o que mais for feito no cliente. Essa
era a incerteza que bloqueava qualquer decisão — sem resolvê-la, qualquer
arquitetura client-first seria especulação.

**Verificação feita antes de decidir** (2026-09-19, TV física
QN50Q60DAGXZD): um `fetch()` direto do app empacotado contra o painel
Xtream real do usuário (`player_api.php`, sem passar pelo backend) obteve
sucesso — `status=200`, corpo de 498 bytes, sem erro de CORS. O caminho
alternativo (`mode: 'no-cors'`) nem precisou ser usado como evidência,
porque o `fetch()` normal já leu a resposta. Ver `sdd/bugs/` não se aplica
aqui — isso foi um spike de arquitetura, não um bug, e o código temporário
usado para testar (endpoint `GET /sources/{id}/provider-credentials-spike`,
botão "🧪 Testar [TEMP]" na Home, formulário de edição de fonte) fica
registrado no histórico de commits, não neste ADR.

## Decisão

**Client-first por padrão: o app tenta resolver import/reprodução direto do
navegador da TV, sem depender de nenhum backend sempre-ligado — nem no PC
do usuário, nem em VPS. Backend continua existindo só onde há uma barreira
real que o cliente não pode cruzar sozinho, tratado como complemento
opcional, nunca como pré-requisito de uso.**

Por área concreta:

1. **Import de fonte por provedor (Xtream) e por M3U** — passa a rodar no
   cliente: `fetch()` direto para `player_api.php`/`get.php`, parsing e
   classificação em TypeScript (portados de `m3u_parser.py`/
   `classifier.py`), catálogo armazenado em IndexedDB no próprio
   dispositivo. Continua condicionado a: (a) o painel efetivamente permitir
   CORS — nem todo provedor vai permitir, e o app precisa **detectar isso e
   avisar**, nunca falhar em silêncio; (b) parsing de catálogos grandes
   (a fonte real tem 300k+ entradas) rodando em Web Worker, nunca bloqueando
   a UI, com escrita incremental em lote no IndexedDB — não materializar o
   array inteiro na memória do processo de uma vez.
2. **Credencial de provedor** — passa a ser armazenada no próprio
   dispositivo (IndexedDB), não mais só no backend. Isso **reverte**, para
   este caso específico, a leitura estrita da constitution "Segredos Fora
   dos Clientes e dos Logs" — decisão consciente, não descuido: sem
   backend, a credencial *tem* que morar em algum lugar pra o cliente
   reautenticar sozinho. Mitigação: nunca logada, nunca exibida depois de
   digitada, nunca enviada a terceiro (TMDB/OpenAI), sem canal de
   exportação/backup que a exponha.
3. **TMDB** — chamado direto do cliente com a chave do próprio usuário
   (já cogitado antes como "opcional, com chave própria do usuário"). TMDB
   é CORS-friendly por design; não há bloqueio técnico aqui.
4. **OpenAI / voz** — continua exigindo *algum* componente servidor, porque
   a OpenAI não oferece um modelo de chave "publicável" equivalente ao de
   outras APIs para uso direto do browser (a verificar na hora de construir
   essa feature: a Realtime API tem um fluxo de token efêmero que pode
   mudar essa resposta — não confirmado nesta decisão). Continua sendo o
   único componente da visão original que estruturalmente não cabe em
   "zero backend" — mas fica **opcional e adiado**: só se constrói (e só
   se paga por ele) quando essa feature específica for priorizada, podendo
   ser uma função serverless mínima em vez de VPS.
5. **Controle remoto por Android** — restrito a mesma-LAN por padrão (TV
   como servidor local, descoberta tipo mDNS/SSDP), sem relay externo.
   Controle fora da LAN fica como extensão futura condicionada a demanda
   real, não como requisito do MVP.
6. **Fallback para provedor sem CORS** — quando o `fetch()` direto falhar
   por CORS (não por rede), o app **declara a limitação** ("este provedor
   não permite conexão direta") em vez de tentar mascarar ou assumir modo
   degradado silenciosamente. Um backend local opcional (auto-hospedado
   pela própria pessoa, formato Plex/Jellyfin — rodar num PC/NAS que ela já
   tem) fica como caminho de contorno para esses casos, não como
   dependência do caminho principal.

## Alternativas Consideradas

### B — Backend centralizado, hospedado e pago pelo desenvolvedor

- Um servidor único (VPS ou equivalente) atende todas as instalações.
- **Rejeitada:** é exatamente o custo recorrente que o usuário quer evitar,
  e cresce com o número de usuários — o oposto do que "só pagar se mudar o
  app" pede.

### C — Backend auto-hospedado por instalação (modelo Plex/Jellyfin)

- Mesmo backend Python/FastAPI de hoje, mas cada usuário roda sua própria
  cópia (PC, NAS, Raspberry Pi) — zero custo de hospedagem pro
  desenvolvedor, em qualquer escala.
- **Rejeitada como padrão** (mas mantida como *fallback* explícito, item 6
  da Decisão): exige que a pessoa instale e mantenha um segundo processo
  rodando só pra usar o app, o que o usuário rejeitou explicitamente depois
  de confirmar o teste de CORS — se dá pra evitar esse processo por
  completo, não faz sentido impor essa fricção de instalação a todo mundo
  por causa dos provedores que já funcionam sem ele.

### A' — Client-only absoluto, sem exceção nenhuma (incluindo voz/OpenAI)

- Eliminar completamente qualquer componente servidor, inclusive para
  voz/IA.
- **Rejeitada:** a OpenAI não expõe hoje um jeito seguro de embutir a
  chave direto no cliente sem um intermediário que a proteja — manter essa
  chave fora do cliente é regra vigente da constitution que esta ADR não
  revisita. Como voz é feature futura e opcional, isso não bloqueia nada
  do que existe hoje; só significa que "zero backend" nunca vai ser 100%
  literal se essa feature for construída.

## Consequências

### Positivas

- Custo de infraestrutura do desenvolvedor cai a zero pro caso de uso
  principal (import, catálogo, reprodução, TMDB), pra qualquer número de
  usuários — resolve exatamente a preocupação que motivou a decisão.
- Instalação vira "baixar e abrir o app", sem exigir que a pessoa opere um
  segundo processo — reduz fricção de adoção comercial de verdade.
- Elimina de vez os riscos de escala do backend compartilhado (R-004 do
  plano da 004: `BackgroundTasks` disputando o mesmo processo que serve a
  TV) — cada instalação processa só o próprio catálogo.

### Negativas

- **Reversão consciente de um princípio de segurança**: credencial de
  provedor passa a viver no dispositivo. Aceito explicitamente pelo
  usuário; precisa de mitigação de engenharia (nunca logada/exibida/
  exportada) documentada e cobrada em toda feature que tocar nisso.
- **Retrabalho real**: `m3u_parser.py`, `classifier.py`,
  `provider_connector.py` e a orquestração de `ImportJob`/publicação em
  duas fases (`importer.py`) — todo o núcleo das features 001 e 004 — precisa
  ser reescrito em TypeScript rodando no cliente. Isso não é ajuste
  incremental, é portar a peça mais testada do projeto (100 testes de
  backend) para uma plataforma nova (Web Worker + IndexedDB), com
  disciplina de teste equivalente a reconstruir.
- **CORS não é garantido por provedor**: a verificação confirmou UM
  provedor real. Provedores mais restritivos podem bloquear o `fetch()`
  direto — o app precisa lidar bem com essa possibilidade (item 6 da
  Decisão), e o quanto isso vai acontecer na prática, com uma base maior de
  usuários, é desconhecido até haver mais dados.
- **Parsing de catálogo grande no dispositivo é uma incógnita de
  desempenho real**: nunca foi medido em hardware de TV. A fonte de teste
  tem 300k+ entradas — o comportamento de memória/tempo num Tizen real
  precisa ser validado cedo, não assumido.
- Ecossistema de features futuras que hoje presumem backend (worker
  durável, item 21 do backlog; dedup de leitura, item 36) muda de sentido —
  viram "por instalação", não "compartilhado".

### Caminho de Migração / Evolução Futura

Esta decisão **não é retroativa de uma vez** — features 001/003/004 (backend
atual) continuam funcionando e não precisam ser descartadas no dia desta
ADR. A migração é item de trabalho novo, a especificar via `sdd-specify`
quando priorizado, cobrindo pelo menos:

1. Prova de conceito de parsing client-side em Web Worker contra a fonte
   real (300k+ entradas), medindo tempo e memória na TV física antes de
   comprometer a reescrita inteira.
2. Migração do conector Xtream JSON (feature 004) para TypeScript,
   reaproveitando o protocolo já mapeado em
   `sdd/specs/004-conector-xtream-live/contracts/provider-protocol.md`.
3. Decisão de armazenamento local (IndexedDB, formato do cache) — cruza
   com o item 4 do backlog (cache local do catálogo), que já cogitava isso
   por outro motivo (offline-first).
4. Detecção e mensagem clara para painel sem CORS (item 6 da Decisão),
   testada contra pelo menos um provedor real que bloqueie, não só o que já
   foi validado.
5. Revisitar esta ADR se: (a) uma base maior de usuários mostrar que CORS
   bloqueia com frequência relevante — nesse caso o fallback auto-hospedado
   (Alternativa C) deixa de ser exceção e vira caminho recomendado para
   esses casos; ou (b) a medição de desempenho do parsing client-side em TV
   real mostrar que é inviável nesse hardware — nesse caso o processamento
   pesado volta a precisar de um backend, ainda que auto-hospedado.
