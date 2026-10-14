# Lógica — confirmação de conexão do formulário de lista

Feature 045, US1. Quem implementa: T004 (`lib/catalog/sourceConnectionCheck.ts`), T007–T010 (tela).
Os dois contratos de `sourceConnectionCheck.ime-formularios.contract.test.ts` já provam esta árvore
(foi validada contra uma implementação provisória antes de travar; o stub atual lança `not implemented`).

## 1. Princípio

A confirmação **reusa** o que a importação já faz — nunca uma segunda implementação do protocolo:
`normalizeServerAddress`, `resolveAccountStatus`, `legacyM3uUrl`, `parsePanelUrl`, `parseM3uLines` +
`linesFromResponse`, `isAbortError`. Ela é **leve**: no Xtream, só a consulta de conta (a mesma que a
importação faz primeiro); no M3U, lê **até a primeira entrada** e cancela o download. Nunca baixa a lista.

Nada é gravado: a confirmação roda **antes** de `createSource`, então uma falha não deixa fonte órfã.

## 2. Assinatura (já no stub)

```ts
checkSourceConnection(input: ConnectionCheckInput, options?: { signal?, timeoutMs?, isOnline? })
  : Promise<{status:'confirmed', route:'xtream'|'limited'|'m3u'} | {status:'failed', code} | {status:'cancelled'}>
```

`code` ∈ `SRC-001 | SRC-401 | SRC-402 | SRC-422 | NET-01 | NET-02 | API-429` (todos já na tabela da 042;
nenhum código novo). O resultado **nunca** carrega URL, usuário, senha nem a mensagem do erro cru.

## 3. Árvore de decisão

```
Xtream (provider_credentials):
  normalizeServerAddress(dns) lança ProviderIncompatibleError  → SRC-001   (sem rede)
  offline                                                       → NET-01   (sem rede)
  viaPanel(dns, user, pass, fallback = legacyM3uUrl(...))

M3U (m3u_url):
  new URL(url) falha | protocolo ≠ http(s) | host vazio | usuário/senha embutidos → SRC-001 (sem rede)
     (um fetch com credencial embutida na URL já lança TypeError no navegador — melhor dizer "endereço inválido")
  offline → NET-01
  parsePanelUrl(url) reconhece painel → viaPanel(panel.dns, panel.username, panel.password, fallback = url)
  senão                              → probeM3u(url, route 'm3u')

viaPanel:
  resolveAccountStatus(..., {signal})
    expirada                         → SRC-402
    !authorized                      → SRC-401
    ok                               → confirmed 'xtream'
  ProviderError invalid_credentials  → SRC-401
  ProviderError subscription_expired → SRC-402
  ProviderError rate_limited         → API-429
  ProviderError network_failure | direct_connection_refused → NET-02 (NET-01 se offline agora)
  ProviderIncompatibleError          → probeM3u(fallback, route 'limited')     ← FR-004: NÃO é erro
  AbortError                         → propaga (vira 'cancelled' ou timeout lá fora)

probeM3u(url, route):
  fetch(url, {signal}) rejeita (≠ abort)        → NET-02 (NET-01 se offline)
  status 401/403                                → SRC-401
  status 429                                    → API-429
  !ok | sem body                                → SRC-422
  for await (entrada of parseM3uLines(linesFromResponse(body))) → confirmed(route)   ← para na PRIMEIRA
     (o `return` dentro do `for await` fecha o gerador e `linesFromResponse` faz `reader.cancel()`)
  HlsManifestDetectedError | InvalidPlaylistError | EmptyPlaylistError | nenhuma entrada → SRC-422
```

## 4. Tempo e cancelamento (FR-008, FR-009; precedente: `accountCheck.ts`, D-005 da 034)

- Um `AbortController` interno, ligado ao `options.signal` de quem chamou.
- `Promise.race([verify(), guard])` é **obrigatório**: um `fetch` pode ignorar o sinal.
  `guard` rejeita com `CheckTimeout` após `timeoutMs ?? 15_000` (rejeita **antes** de abortar, para o
  timeout vencer a corrida contra o `AbortError`) e com `CheckCancelled` quando `options.signal` aborta.
- `CheckTimeout` → `failed NET-02`. `CheckCancelled` (ou `AbortError` com `options.signal.aborted`) → `cancelled`.
- A promessa que perdeu a corrida recebe `.catch(() => {})` (sem "unhandled rejection").
- Qualquer outro erro **sobe** (D-009): defeito nosso não vira "falha de rede".
- Limpar timer e listener num `finally`.

## 5. Edição de lista (FR-011)

`features/import/connectionInput.ts` (T009) decide **se** e **com quê** checar:

| Situação em edição | Resultado |
| --- | --- |
| Xtream, `dns` igual ao atual e usuário/senha em branco | `null` — não consulta a rede (salvou só o nome) |
| Xtream, `dns` mudou e/ou usuário/senha preenchidos | `provider_credentials` com os campos em branco **completados** por `readCredential(sourceId)` |
| M3U com a URL em branco | `null` |
| M3U com URL preenchida | `m3u_url` |

`readCredential` só é lido dentro desse helper; o valor nunca vai a estado de tela, query key, log ou banner.
Se `readCredential` não achar a credencial guardada e um campo ficou em branco, o helper devolve `null`
(deixa o `updateSource` seguir como hoje) — nunca inventa.

## 6. Tela (T010)

Estado de fase da tela: `idle | checking | saving`. O botão fica `loading` em `checking` **e** `saving`.
Trava **síncrona** por `useRef` (precedente: `submitting` de `TmdbKeyScreen`) — `isPending` só vira `true`
no render seguinte e dois OK seguidos passariam.

```
submit():
  se lockRef → ignora
  validação local de campos vazios (como hoje, FR-012) → banner de validação (mensagem atual), foco no botão
  input = cadastro ? montar(mode,campos) : connectionInput(existing, draft)       (edição pode dar null)
  se input != null:
     lockRef = true; fase = checking; abortRef = new AbortController
     r = await checkSourceConnection(input, {signal})
     'cancelled' → fase idle, lockRef=false, foco no botão, SEM banner
     'failed'    → fase idle, lockRef=false, banner(code), foco no botão
     'confirmed' → segue
  fase = saving; create/update.mutate(...)   (como hoje: onSuccess → onSourceCreated / onSourceUpdated)
     onError → fase idle, lockRef=false (mensagem genérica atual para erro inesperado; STO-01 se quota)
```

- RETURN (`useRemoteNav({ onBack })` da tela): se `abortRef` ativo → `abort()` e **não** sai; senão `onBack()`.
- Banner: **um** `role="alert"` por vez, conteúdo = `describeError(code)` (título, descrição) + código
  discreto; **sem** URL/usuário/senha/mensagem crua. Permanece até a próxima tentativa (não some ao digitar).
- O botão de ação vira **"Tentar de novo"** quando `describeError(code).retryable` (NET-01, NET-02, API-429,
  STO-01); para SRC-001/401/402/422 mantém o rótulo ("Conectar e sincronizar"/"Salvar alterações") — a
  descrição da tabela já diz o que corrigir. Volta ao rótulo normal ao próximo `change` de campo? **Não**:
  só ao próximo submit (o motivo não pode sumir no meio da digitação — edge case da spec).
- Foco: sempre `buttonRef.current?.focus()` do botão de ação depois de falha ou cancelamento.
- `STO-01` (disco cheio) vem de `createSource`/`updateSource`: reconhecer pelo mesmo critério de
  `catalogRepository.ts` (`QuotaExceededError`/`NS_ERROR_DOM_QUOTA_REACHED`) — reusar o helper, não copiar.
