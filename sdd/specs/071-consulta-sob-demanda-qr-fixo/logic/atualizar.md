# Lógica — Atualizar, fila e teste local (071)

## 1. Escopos e pausa

```ts
type Scope = 'lists' | 'license'
// PortalAgent.refresh(scope): Promise<{ ok: true } | { ok: false; code: string }>
// 1. !active || !visible || !online  → { ok:false, code:'offline' }
// 2. now < lastRefresh[scope] + 10_000 → { ok:false, code:'wait' }   // sem requisição, sem dormir
// 3. lists:   flushDeletions → flushUploads? → pull → publishSnapshot
//    license: refreshLicense
// 4. sucesso → lastRefresh[scope] = now; falha → lastRefresh[scope] = now (a pausa vale em falha também)
```

- O relógio é o injetado (`now`), nunca `Date.now` direto.
- Execução serial: se já houver uma execução, `refresh` aguarda a atual (como `syncNow`) e depois aplica a regra da pausa.
- Falha mapeia para `code` não secreto (`PortalRequestError.code` ou `sync_error`).

## 2. Cadastro preguiçoso

- `usePortalIntegration` **não** chama `connection.ready()` no mount.
- Telas que precisam de ID/chave chamam `connection.ready()` + `ensurePairing()` ao abrir (ação da pessoa). Sem internet: estado "sem conexão" com Atualizar/Voltar focáveis; sem inventar ID/chave/QR.
- O **primeiro** cadastro envia `trialStartedAt` (início local).

## 3. Teste local

```ts
trustedNow = max(now, highWatermark)
allowed    = trustedNow < startedAt + LOCAL_TRIAL_MS
// licença assinada válida (JWS) também libera; JWS `revoked` bloqueia
access = jwsAllowed || localAllowed        // revoked vence
```

- 1ª abertura do build comercial cria `localTrial.startedAt = now` (sem rede).
- Âncora: no enroll/recuperação, `startedAt = reconcileTrialStart(local, serverTrialStartedAt)`.
- O relógio já tem checkpoint a cada ≥ 30 s e ao ocultar; reutilizar `TrustedClock`.
- Entrada negada (próxima entrada na lista) abre a tela de bloqueio **sem rede**.

## 4. Fila de envio

```ts
// planSourceUploads: para cada lista suportada e completa:
//   incluir se uploaded[id] === undefined || uploaded[id] < revision
// Completa: m3u_url exige m3uUrl; provider_credentials exige providerDns + providerUsername + providerPassword.
```

- Gatilhos: (a) criar/editar lista na TV → uma tentativa no ato; (b) Atualizar de listas → esvazia a fila, em lotes de 10, parando no primeiro erro.
- Falha deixa `uploadedRevision` como estava; nada é perdido ao reiniciar.
- Resposta `gone` (tombstone) → registrar como enviada para não insistir; `conflict` → exibir como pendência (069).
- A 1ª execução depois da atualização do app sobe **todas** (a tabela `sourceUploads` está vazia).

## 5. Tela de bloqueio

- Mostra: mensagem do fim do teste, orientação de compra, QR fixo, endereço, ID e chave, **Atualizar** (escopo `license`) e **Voltar**.
- Atualizar com licença liberada: fecha o bloqueio e chama a entrada negada de novo (`sourceId` guardado); se não liberou, mostra o estado ("sem compra", "pagamento pendente") sem fechar.

## 6. O que NÃO muda

`evaluatePlaybackAccess`, protocolo de operações portal → TV (7 dias, CAS), exclusão bidirecional, recuperação pelo site, "Gerar nova chave", `values` do portal.