# Research — 071

## 1. Gerador de QR na TV

- **Decisão**: `qrcode-generator` (MIT, sem dependências, ES5, saída em tabela de módulos). Renderizar como SVG inline ou `<canvas>` próprio; nenhuma imagem vem do serviço. Fixar a versão estável mais recente com pelo menos duas semanas e conferir a licença na T016.
- **Justificativa**: roda no Chromium 120 e no alvo `chrome108`; ~20 KB; sem Worker nem rede. O conteúdo (`https://<site>/#id=…&key=…`, ~70 caracteres) cabe na versão 4–5 com correção `M`.
- **Alternativas**: `qrcode` (npm) — dependências e saída Node; `uqr` — moderno demais para o piso `chrome108`; manter o PNG do serviço (`api/app/portal/qr.py`) — exige requisição, contra FR-001/FR-013.
- **Consequência**: arquivo novo emitido pelo Vite entra no `CCPlayTv/tizen_web_project.yaml` (a guarda `findUnlistedFiles` do `sync-tizen` para o build se faltar). `api/app/portal/qr.py` e a rota de convite continuam para a recuperação pelo site (069).

## 2. Âncora do teste no cadastro

- **Decisão**: `POST /portal/v1/devices/enroll` aceita `trialStartedAt` (ms, inteiro, ≤ agora+60 s e ≥ agora−30 dias). O serviço grava `trial_started_at = min(created_at, trialStartedAt)` e `trial_expires_at = início + 7 dias` **no cadastro** (hoje é gravado lazily no 1º `entitlement`), devolve `trialStartedAt` e continua imutável (`immutable_trial`).
- **Justificativa**: reutiliza o enroll idempotente por identidade (reinstalação recebe o início existente) e não cria rota nova nem chamada extra.
- **Alternativas**: rota `POST /device/trial/anchor` — uma chamada a mais; confiar no cliente sem `min` — permitiria empurrar o início para frente.
- **Limite**: sem contato manual prévio, reinstalar reinicia o teste (R-003, aceito).

## 3. Lote de envio TV → site

- **Decisão**: `POST /portal/v1/device/sources` com até 10 itens `{ sourceId, revision, input }`; resposta por item (`stored | unchanged | conflict | gone | invalid`). Digest do conteúdo garante idempotência.
- **Justificativa**: a primeira atualização pode subir dezenas de listas; lotes pequenos respeitam limites de payload e tempo; reutiliza `ConfigurationService` (cifragem, versão, CAS).
- **Alternativas**: uma rota por lista — N requisições; reutilizar `/device/operations` — modelo é portal → TV, com expiração de 7 dias e contador de 5 pendentes.

## 4. Agente sem timers

- **Decisão**: remover agendamento do `PortalAgent`; manter `run()` interno e acrescentar `refresh(scope)`. Exclusões continuam enviadas no ato por evento (criação da pendência), mas **não** por `liveQuery` na abertura do app.
- **Justificativa**: contratos C2/C3 e SC-001 (0 requisições em 24 h).
- **Alternativas**: apenas aumentar o intervalo — não atende "nada automático"; janela automática limitada — descartada pelo usuário.

## 5. Sessão a partir do QR

- **Decisão**: o `portal-web` lê `#id=&key=`, chama `POST /sessions/manual` (070) e executa `history.replaceState` antes de qualquer renderização com o valor; erros viram a recusa uniforme existente.
- **Justificativa**: nenhuma rota nova no serviço, limites e recusa uniforme já existem; o fragmento nunca é enviado em `Referer` nem a logs do servidor.