# Contrato: protocolo do painel do provedor (canais ao vivo)

Superfície externa que o `ProviderConnector` consome. **Não é um padrão
publicado**: a ADR-004 §3 trata a compatibilidade Xtream como *proposta
sujeita à confirmação do protocolo real*, e a referência disponível é a
implementação de terceiros descrita em `docs/iptvnator/03-apis.md` e
`06-carga-listas-url-xtream.md`. Tudo aqui é **o que vamos tentar**, não o
que está garantido — o painel do usuário confirma ou refuta.

## Regras invioláveis deste contrato

1. **Nada do que trafega aqui entra em log, erro ou resposta de catálogo.** A
   URL carrega usuário e senha no caminho ou na query. Nunca interpolar
   `str(exc)` de httpx, que embute a URL. (ADR-004 §7; FR-018)
2. **Toda chamada passa pelo guardião de rede existente** — validação por
   hop, limites de bytes/tempo/redirecionamento e User-Agent de player. O
   conector não abre cliente HTTP próprio. (D-003; FR-015)
3. **Sem varredura.** Uma tentativa contra a base normalizada decide
   compatibilidade. Não se testam portas nem caminhos alternativos para
   contornar acesso. (ADR-004 §3; D-005)
4. **A resposta estruturada não vira M3U.** Ela é mapeada direto para a saída
   normalizada do importador. (ADR-006 §4.3; FR-002)

## 1. Base do servidor

Entrada do usuário → base normalizada. Formas que devem ser aceitas:

| O que o usuário cola | Base resultante |
| --- | --- |
| `http://painel.exemplo:8080` | `http://painel.exemplo:8080` |
| `painel.exemplo:8080` (sem esquema) | `http://painel.exemplo:8080` |
| `http://painel.exemplo:8080/` | `http://painel.exemplo:8080` |
| `http://painel.exemplo:8080/get.php?...` | `http://painel.exemplo:8080` |
| `http://painel.exemplo:8080/player_api.php` | `http://painel.exemplo:8080` |
| `http://painel.exemplo:8080/panel_api.php` | `http://painel.exemplo:8080` |
| `http://painel.exemplo:8080/iptv/player_api.php` | `http://painel.exemplo:8080/iptv` |

Regras adicionais:

- **Subpath preservado** — painel hospedado em subdiretório continua
  funcionando.
- **Credencial embutida recusada** — `http://user:senha@painel...` não vira
  URL armazenada; as credenciais vivem nos campos próprios da fonte
  (FR-003).
- **Esquema não forçado** — se o painel só serve HTTP, a limitação é
  apresentada, não contornada (ADR-004 §8).

## 2. Estado da conta

Consulta contra `{base}/player_api.php` com as credenciais. Nem todo painel
responde à primeira forma, então a ordem de tentativa é:

1. com `action=get_account_info`
2. sem `action`
3. com `action=get_profile`

A primeira resposta utilizável encerra a sequência (FR-004). Do resultado
interessam:

| Informação | Uso |
| --- | --- |
| Indicador de autorização | distingue credencial aceita de recusada |
| Data de expiração | distingue conta ativa de assinatura expirada |
| Formatos de saída permitidos | alimenta a escolha de formato (FR-008) |

Mapeamento para o estado do usuário (FR-005):

| Resultado | Estado registrado na fonte | O que o usuário lê |
| --- | --- | --- |
| Autorizada e dentro da validade | sincronizada | nada de especial |
| Autorizada, validade vencida | erro | assinatura expirada |
| Não autorizada | erro | credenciais não aceitas |
| Nenhuma das três tentativas responde de forma utilizável | — | painel incompatível → caminho de modo limitado (FR-010) |

**Interpretação defensiva**: o indicador de autorização aparece com tipos
diferentes conforme o painel (número, texto ou booleano). O conector aceita
as variantes conhecidas e trata desconhecido como não autorizado, em vez de
assumir acesso.

## 3. Categorias e canais ao vivo

Duas consultas, ambas contra a mesma base e com as mesmas credenciais:

| Consulta | O que devolve | O que preservamos |
| --- | --- | --- |
| categorias de canais | lista de categorias com id e nome | **nome e ordem de declaração** (FR-007) |
| canais ao vivo | lista de canais com id, nome e categoria | **identificador do provedor** por canal (FR-006) e o vínculo com a categoria |

Casos que o mapeamento precisa tolerar sem inventar dado:

- categoria com nome vazio → preservada como a fonte declarou, nunca
  substituída por rótulo externo;
- canal cuja categoria não existe na lista de categorias → permanece
  acessível, sem forjar vínculo;
- canal sem identificador → permanece acessível, sem identidade forjada;
- lista de canais vazia → importação conclui com sucesso e a tela mostra
  estado vazio; **não** é falha de credencial.

## 4. URL de reprodução

Construída **no backend**, no endpoint que a feature 003 criou
(`GET /catalog-items/{id}/playback`), nunca na TV (D-006).

Forma: caminho de live com usuário, senha, identificador do canal e extensão
de formato. O formato vem dos **permitidos pela conta**, com TS preferido
(FR-008, FR-009). Se a conta não declarar formato algum, a ausência é
registrada e nenhum formato é assumido — o item fica sem reprodução
disponível, que já é um estado tratado pela 003 (`playable: false` e o `409`
do contrato de reprodução).

## 5. O que este contrato deliberadamente não cobre

- **VOD e séries** (`get_vod_streams`, `get_series`, informações de série) —
  fatia seguinte, D-007.
- **EPG e catch-up** — dependem de consultas que não consumimos aqui.
- **Fallback de formato durante a reprodução** — se o formato escolhido
  falhar no player, diagnosticar e tentar outro é o item 20 do backlog.
- **Qualquer consulta que exija varrer caminhos** para descobrir capacidade.
