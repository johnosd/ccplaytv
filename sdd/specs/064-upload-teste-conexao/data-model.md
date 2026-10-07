# Modelo de dados — Upload no teste de conexão

Sem mudança de esquema: `networkDiagnostics` continua `id` (Dexie v17), com o registro único `id: 'last'`. O tipo é `SpeedTestResult` (`lib/network/speedTest.ts`), que ganha quatro campos **opcionais**.

## Campos novos

| Campo | Tipo | Significado |
| --- | --- | --- |
| `uploadMbps` | `number \| null \| undefined` | `undefined`: **não medido** (resultado de antes da feature). `null`: o upload foi **tentado** e não teve amostra válida. Número `> 0`: velocidade válida. |
| `uploadSamples` | inteiro `>= 0` | POSTs concluídos com sucesso e duração positiva. |
| `uploadRequestedBytes` | inteiro `0..75 000 000` | Corpo reservado antes de cada POST (não se devolve em falha ou aborto). |
| `uploadSentBytes` | inteiro `0..uploadRequestedBytes` | Soma dos POSTs que o destino confirmou. |

Todo resultado **novo** traz os quatro campos. Só um resultado antigo não tem nenhum.

## Campos existentes que mudam de significado

- `requestedBytes` / `receivedBytes` continuam sendo **só a etapa de latência + download**. Com upload, `requestedBytes <= 75 000 000`. Sem upload (antigo), vale o limite antigo de 100 000 000.
- `status`: `complete` quando `downloadMbps`, `latencyMs` e `jitterMs` são válidos **e**, se `uploadMbps !== undefined`, `uploadMbps !== null`. Resultado antigo mantém a regra de três métricas.
- `reason`: o motivo da **primeira** etapa que não terminou normalmente (download, depois upload); `completed` só se as duas terminaram normalmente.
- `durationMs`: tempo total do teste (as duas etapas), do relógio monotônico.

## Validade (`valid`)

Um registro é válido quando cumpre tudo o que a 062 já exigia mais:

1. se `uploadMbps !== undefined`: `uploadMbps` é `null` ou número finito `> 0`; `uploadSamples`, `uploadRequestedBytes` e `uploadSentBytes` são inteiros `>= 0`; `uploadSentBytes <= uploadRequestedBytes <= 75 000 000`; `requestedBytes <= 75 000 000`; `requestedBytes + uploadRequestedBytes <= 150 000 000`; número em `uploadMbps` exige `uploadSamples >= 1`;
2. "ao menos uma métrica válida" passa a contar o upload: um registro só com `uploadMbps` válido é aceito;
3. `status` coerente com a regra acima.

## Normalização na leitura (FR-014)

Antes de validar, a leitura aplica:

- `uploadMbps === undefined` → resultado antigo: descarta qualquer outro campo `upload*` solto e segue;
- `uploadMbps` definido mas com algum campo de upload inválido (negativo, zero, `NaN`, texto, inteiro inválido) → o upload vira indisponível: `uploadMbps: null`, `uploadSamples: 0`, `uploadRequestedBytes: 0`, `uploadSentBytes: 0`, e `status` é recalculado (vira `partial`). O resto do resultado continua legível.

A gravação **não** normaliza: um resultado inválido é ignorado (`'ignored'`), como na 062.

## Projeção (`clean`)

Grava só os campos conhecidos. Os quatro campos de upload entram **somente** quando `uploadMbps !== undefined`, para que um resultado antigo continue idêntico ao que estava gravado.

## Exibição

| Estado do registro | Upload na interface |
| --- | --- |
| `uploadMbps` número | `<n> Mbps` |
| `uploadMbps === null` | "Amostra insuficiente" (chave `settings.speed.unavailable`, já existente) |
| `uploadMbps === undefined` | "Não medido neste teste" (chave nova `settings.speed.uploadNotMeasured`) |
