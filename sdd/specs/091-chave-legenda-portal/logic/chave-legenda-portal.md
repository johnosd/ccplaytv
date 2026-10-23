# Lógica — chave de legenda pelo portal (feature 091)

Reaproveita o desenho da chave TMDB (feature 077, ADR-020, `sdd/specs/077-redesenho-portal-web/contracts/portal-api-tmdb.md`
e `logic/tmdb-estado.md`). Aqui só estão as **diferenças** e as regras onde o executor erraria. Constitution 1.17.0 (m).

## §1 Serviço — um documento por TV e por fornecedor

- Caminho: `devices/{device_id}/integrations/subtitles-opensubtitles` e `…/subtitles-subdl` (o TMDB segue em
  `…/integrations/tmdb`, intocado).
- Modelo: o mesmo `TmdbIntegrationDocument` (renomeado por alias `KeyOperationDocument`; **sem** mudar o schema gravado,
  para o TMDB não migrar). Mesma invariante: `envelope` existe só com `action='set'` e `state='pending'`.
- Cifra: `PortalCrypto.encrypt(key, CipherContext(device_id, "subtitle-key:" + provider, operation_id))`. O rótulo inclui
  o fornecedor: um envelope de um fornecedor **não decifra** no outro.
- Formato aceito pelo serviço: `[A-Za-z0-9._-]{8,200}` (o mesmo da TV na 090; o do TMDB é 16–600). A TV é a autoridade final.
- Refatoração permitida (e pedida): extrair `KeyIntegrationService` (kind, rótulo de cifra, regex, extrator do snapshot) em
  `api/app/portal/key_integration.py`, com `TmdbIntegrationService` como especialização **sem mudar o comportamento nem
  os testes** de `test_tmdb_integration.py`. `SubtitleKeyService` (`api/app/portal/subtitle_keys.py`, stub do plano)
  compõe duas instâncias, uma por fornecedor.
- API do `SubtitleKeyService` (assinatura fixada pelo contrato `test_subtitle_keys_contract.py`):
  - `request(principal, provider, operation_id, action, key, now) -> {operationId, provider, action, state:"pending"}` —
    `provider` fora de `PROVIDERS` ⇒ `invalid_input` 422; `set` exige `key`; `remove` não aceita `key`; mesmo
    `operation_id` repetido não duplica (idempotência da 077).
  - `view(principal, now) -> {"opensubtitles": V, "subdl": V}`, com `V = {pending, last, tvReported}` exatamente como o
    TMDB (`pending` com `retryReason`, `last` com `action/result/reason/at`), `tvReported` ∈ `none|configured|rejected|
    rate_limited|null`. **Nunca** a chave.
  - `pull(principal, now) -> {"operations": [{provider, operationId, action, key?}, …]}` — no máximo uma por fornecedor,
    na ordem `opensubtitles`, `subdl`; só as vivas; envelope ilegível encerra a operação (como o TMDB).
  - `ack(principal, provider, operation_id, state, reason, now) -> {operationId, state}` — idempotente: fornecedor errado
    ou operação que não é a corrente ⇒ `200` sem efeito. Motivos: `retry`: `offline|rate_limited`; `rejected`:
    `refused|invalid_format`; `applied`: sem motivo.
- Não há `cancel` exposto nesta feature (fora de escopo na spec); o método existe na classe-base do TMDB e **não** ganha rota.

## §2 Rotas (`contracts/portal-api-legendas.md`)

Navegador (sessão `manage`): `GET /integrations/subtitles`, `PUT /integrations/subtitles/{provider}`,
`POST /integrations/subtitles/{provider}/remove`. TV (bearer): `GET /device/integrations/subtitles`,
`POST /device/integrations/subtitles/ack`. Limites **próprios** (não reaproveitar os do TMDB nem os de `pull`):
navegador 10 mutações/h por TV (`subtitle-key`, os dois fornecedores somados), TV pull 3 por 10 s (`subtitle-pull`),
ack 20 por minuto (`subtitle-ack`), todos por `digest("rate_limit", escopo + "/" + device_id)`, recusa uniforme 429.
Nada de corpo, log ou exceção com a chave; `SecretStr` no `Input`, `repr=False`.

## §3 Snapshot

`IntegrationsSnapshotDocument` ganha `subtitles: SubtitlesSnapshot | None = None` com
`opensubtitles` e `subdl` ∈ `none|configured|rejected|rate_limited`. `tmdb` continua obrigatório (TV antiga que só manda
`tmdb` segue válida; `subtitles` ausente ⇒ o portal mostra "Estado desconhecido" para legendas). A TV publica a partir
de `listSubtitleKeyStatus()`: sem registro ⇒ `none`; `state='valid'` ⇒ `configured`; `rejected`/`rate_limited` iguais;
registro com `chosen=false` conta como `configured` (a chave existe). **Nunca** valor, máscara, formato ou fim.

## §4 TV — aplicar (`tv-web/src/lib/portal/subtitleKeysRemote.ts`)

```ts
applyRemoteSubtitleKeys(ports, signal): Promise<Record<SubtitleProvider, 'none'|'applied'|'rejected'|'retry'>>
```

1. `ports.fetchInstructions` → lista (≤ 1 por fornecedor). Vazia ⇒ `{opensubtitles:'none', subdl:'none'}`, nada tocado.
2. Para cada instrução, **em ordem**: `remove` ⇒ `removeKey(provider)` + ack `applied`; `set` ⇒ `saveKey(provider, key)`
   (que já valida o formato, testa **no fornecedor** e só então grava com `chosen=true`):
   `ok` ⇒ ack `applied`; `reason ∈ {refused, invalid_format}` ⇒ ack `rejected` com o motivo; `reason ∈ {offline,
   rate_limited}` ⇒ ack `retry` com o motivo; `set` sem chave ⇒ ack `rejected/invalid_format` **sem** tocar na guardada.
3. Falha inesperada num fornecedor (exceção do `saveKey`/`removeKey`): **não** confirma `applied` para ele, **continua**
   com o outro e, no fim, lança `Error('subtitle_apply_failed')` — mensagem fixa, sem a chave nem a causa original.
4. O ack é `{provider, operationId, state, reason?}`; nada mais.
5. `createSubtitleKeysRemoteStep(database, connection)` (porta de produção): mesmo padrão de `createTmdbRemoteStep` —
   `connection.ready()`, confere antes de cada efeito que a identidade da TV não mudou (`deviceId/authEpoch/
   recoveryEpoch`), `GET/POST` com o bearer, valida a resposta item a item (id de operação, fornecedor, ação, forma da
   chave `^[A-Za-z0-9._-]{8,200}$`) e descarta o que não confere. `saveKey = saveSubtitleKey(provider, key, { database,
   signal })`, `removeKey = removeSubtitleKey(provider, { database })`.

## §5 TV — agente e Integrações

- `RefreshScope` ganha `'subtitles'`: passos `['integrations', 'snapshot']` com `applyIntegrations(signal, 'subtitles')`.
  Os escopos `'tmdb'` e `'lists'` chamam `applyIntegrations(signal)` (sem `only`) e aplicam **os dois**.
- `usePortalIntegration.tsx` monta `applyIntegrations = async (signal, only) => { run tmdb (se !only) e subtitles; cada
  um independente; se algum lançou, lança depois do outro }` — um não impede o outro.
- `refreshFingerprint('subtitles')`: junta, por fornecedor, `state:chosen:lastTestedAt` de `subtitleCredentials` (nunca a
  chave). Mensagens `portal.refresh.subtitlesDone|subtitlesNothing`.
- Seção **Legendas** (`SubtitleKeysSection`): ganha uma linha final "Atualizar" (`useRefreshAction('subtitles')`,
  `RefreshStatusLine`), foco por estado como os demais botões; `SUBTITLE_ROW_COUNT` passa a contar essa linha
  (`integrationsModel`). O Atualizar do card TMDB, ao terminar, também chama `subtitleKeys.refresh()` (relê as linhas).
- Quem não tem portal (build base) não vê o botão: sem `connection`, a linha "Atualizar" some e o foco/contagem
  acompanham (`hasPortal`).

## §6 Portal web

- `SETTINGS_ITEMS` ganha `{ id: 'subtitles', view: 'subtitles', title, description }` logo **depois** de `tmdb`.
- `SubtitleKeysPage` (nova): duas seções (OpenSubtitles, SubDL), cada uma com badge de estado, dica, ações **Remover** (com
  `DeleteDialog`) e formulário "Adicionar/Substituir" (campo oculto com olho, limpa após envio, `maxLength`,
  `autoComplete="off"`, o mesmo cuidado do TMDB). `checkSubtitleKey` valida antes de enviar. Link de onde criar a chave:
  OpenSubtitles `https://www.opensubtitles.com/consumers`; SubDL `https://subdl.com/panel/api`.
- Estado por fornecedor = `resolveSubtitleKeyView` (reaproveita `resolveTmdbView`; só acrescenta `rejected`/`rate_limited`
  vindos da TV e `unknown`). Sem botão "cancelar envio".
- `api.subtitleKeys = { status(), set(session, provider, key, operationId), remove(session, provider, operationId) }`.
  O `operationId` é reaproveitado após falha de rede enquanto a chave digitada não muda (igual ao TMDB).
- Textos nas três línguas em `lib/i18n/areas/novoPortal.ts` (e o FAQ se mencionar a chave TMDB).

## §6.1 Rótulos de estado (portal)

| `view` | Texto (pt) |
| --- | --- |
| `none` | Não configurada |
| `configured_on_tv` | Configurada na TV |
| `pending` | Aguardando a TV (aperte Atualizar) / Aguardando a TV — tentando de novo |
| `applied` | Aplicada na TV |
| `rejected` (`refused`) | Recusada pelo fornecedor |
| `rejected` (`invalid_format`) | Formato de chave inválido |
| `limited` | No limite — tentar depois |
| `unknown` | Estado desconhecido (TV sem suporte) |

## §7 Desempenho (FR-014)

Nada novo em player, catálogo ou navegação. Na TV, o único código novo roda no clique de **Atualizar** (rede) e ao
abrir Integrações (a leitura de `subtitleCredentials` que a 090 já faz). O `snapshot` do Atualizar ganha uma leitura
da tabela `subtitleCredentials` (≤ 2 registros). O portal não ganha timers: a página relê junto da leitura
compartilhada da TV (como a TMDB).
