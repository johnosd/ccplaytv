# Evidência na TV física — feature 070

Data: 2026-10-13. TV de referência QN50Q60DAGXZD (IP de LAN 192.168.0.2).
Observador: **o usuário**, olhando a tela e com o celular; fotos enviadas na sessão (não versionadas: mostram a chave do dispositivo e MACs reais).

## Pacote

- `build:tizen:commercial` com `VITE_PORTAL_ORIGIN` = staging e a JWK pública `kid=v1` lida de `/portal/v1/license-keys` (sem componente privado).
- Staging republicado antes da instalação com a API da ADR-015 (`ccplaytv-portal-00016-srm`, ver `staging.md`).
- `deploy-tv.ps1 -SkipBuild`: instalado **sem desinstalar** (IndexedDB preservado) e lançado (pid 28592).

## Roteiro (quickstart) — veredito do usuário

| # | Cenário | Resultado |
| --- | --- | --- |
| 1 | Adicionar lista: QR grande emoldurado no topo, ID e chave de 10 dígitos ao lado, tudo dentro da tela | Aprovado |
| 2 | QR lido pelo celular abre o portal desta TV | Aprovado |
| 3 | ID exibido = MAC da TV (T003) | **Reprovado** — ver abaixo |
| 4 | Seletor Xtream/M3U legível; seta + OK troca para Lista M3U | Aprovado |
| 5 | Portal por endereço MAC + chave; lista criada no portal aparece na TV com Recarregar | Aprovado |
| 6 | RETURN em cadeia chega à tela de listas antes de "Sair do CCPlayTV?" | Aprovado |

## T003 — leitura do MAC

- O ID exibido tem o 1º octeto `0x2A`: bit *localmente administrado* ligado, unicast — formato dos IDs criados pelo serviço quando o MAC não chega.
- Ele difere do "Endereço MAC com fio" e do "Endereço MAC sem fio" mostrados em Configurações › Sobre a TV.
- Conclusão: neste pacote o app **não obtém o MAC** (`webapis.network.getMac()` indisponível ou recusado). A causa mais provável é a ausência do privilégio de rede em `CCPlayTv/config.xml`; a confirmação vem da T017.
- Pela ADR-015, o ID já atribuído a esta TV no staging é imutável: declarar o privilégio só muda o ID de **cadastros novos**. Para esta TV passar a exibir o MAC real é preciso apagar o registro dela no staging (operação documentada, permitida antes da abertura comercial) e parear de novo.

## T017 — privilégio de rede (2026-10-13)

- `CCPlayTv/config.xml` ganhou `http://developer.samsung.com/privilege/network.public`; o pacote assinado com o certificado atual **instalou** (o nível do privilégio é aceito por este certificado).
- Sonda da T003 (`VITE_CCPLAY_PLATFORM_PROBE=1` + coletor `infra/portal/dev/platform-probe-server.mjs` em 192.168.0.6, aceitando só a TV): relatório recebido de `file:` com **`mac: passed`** (getMac devolve 12 dígitos úteis), `duid`/`duidStability`/`persistence: passed`. O MAC em si não sai da TV no relatório.
- Ajustes no coletor da 069 para a 070: campo opcional `mac` e POST sem cabeçalho `Origin` (o Tizen 9 instalado em `file://` não envia `Origin`; o filtro por endereço da TV continua).
- Pacote final reinstalado **sem** a sonda (0 ocorrências no bundle), com o privilégio.
- Esta TV mantém o ID `2A:…` (imutável, ADR-015); TVs pareadas a partir deste pacote recebem o MAC real. O reset desta TV fica para quando existir uma ação que limpe só o pareamento local (hoje só desinstalando, o que apaga as listas).