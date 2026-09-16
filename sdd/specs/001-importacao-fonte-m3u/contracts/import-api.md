# Contract: API de Importação de Fonte

Base: backend Python/FastAPI local (`api/main.py`). Sem autenticação de
pessoa (constitution: Sem Conta Obrigatória) — identidade técnica da
instalação fica para uma feature futura (ADR-004 §1); por ora, escopo
único de instalação local.

## `POST /sources`

Cria uma `Source` e dispara a criação do `ImportJob` correspondente
(FR-004).

**Request body** (`type = m3u_url`):

```json
{
  "type": "m3u_url",
  "display_name": "Minha lista",
  "m3u_url": "https://exemplo.test/lista.m3u",
  "request_key": "chave-idempotente-do-cliente"
}
```

**Request body** (`type = provider_credentials`):

```json
{
  "type": "provider_credentials",
  "display_name": "Provedor X",
  "provider": {
    "dns": "http://exemplo-provedor.test:80",
    "username": "usuario",
    "password": "senha"
  },
  "request_key": "chave-idempotente-do-cliente"
}
```

`request_key` é gerada pelo cliente (TV) uma vez por submissão e reenviada
em caso de retry de rede — usada para não duplicar fonte/job (FR-018).

**Responses**:

- `201 Created` → `{ "source_id": "uuid", "import_job_id": "uuid" }`
- `200 OK` (mesma `request_key` já processada) → mesmo corpo do `201`
  original, sem criar novo job (idempotência).
- `400 Bad Request` → erro de validação (`display_name` vazio, URL
  malformada, bloqueada por política SSRF, campos de provedor incompletos).
  Nunca inclui a senha enviada no corpo do erro.
- Corpo de erro nunca inclui `provider_password` nem a URL completa quando
  ela contiver credenciais embutidas (FR-014).

## `GET /import-jobs/{id}`

Consulta o estado do job (FR-012).

**Response `200 OK`**:

```json
{
  "id": "uuid",
  "source_id": "uuid",
  "status": "running",
  "current_step": "classifying",
  "counts": {
    "entries_read": 1200,
    "channels": 300,
    "movies": 400,
    "series": 50,
    "episodes": 420,
    "unclassified": 25,
    "invalid": 5
  },
  "warnings": ["3 entradas com URL de reprodução ausente"],
  "created_at": "2026-09-14T12:00:00Z",
  "updated_at": "2026-09-14T12:00:05Z",
  "finished_at": null
}
```

`counts` reflete apenas contadores cujo total parcial já é conhecido; a
ausência de um denominador confiável para a etapa atual é sinalizada por
`current_step` sem exigir que o cliente invente percentual (FR-007).

- `404 Not Found` → job inexistente.

## `POST /import-jobs/{id}/cancel`

Solicita cancelamento de um job em andamento (FR-010).

**Response `202 Accepted`**:

```json
{ "id": "uuid", "status": "running", "cancel_requested_at": "2026-09-14T12:00:10Z" }
```

O `status` só muda para `"cancelled"` numa consulta posterior a
`GET /import-jobs/{id}`, quando o processo reconhecer o pedido — o
`202` confirma apenas que o pedido foi registrado, não que o job já parou.

- `409 Conflict` → job já está em estado terminal (`completed`,
  `completed_with_warnings`, `failed`, `cancelled`); não é possível
  cancelar.

## `POST /import-jobs/{id}/retry`

Solicita nova tentativa manual de um job que falhou por erro de rede
(FR-015). Não há retry automático nesta versão — este endpoint só existe
para ser acionado explicitamente pela pessoa.

**Response `202 Accepted`**:

```json
{ "id": "novo-uuid", "source_id": "uuid", "status": "queued" }
```

Cria um novo `ImportJob` para a mesma `Source`, reaproveitando a
configuração já salva (URL ou credenciais de provedor) — a pessoa não
precisa reinformar nada.

- `409 Conflict` → o job referenciado não está em `status = failed`
  (só é possível pedir retry de um job que de fato falhou).

## `GET /catalog-items`

Consulta o catálogo básico publicado por esta feature — suficiente para
verificar SC-003/SC-004 e para uma futura tela de navegação consumir
(fora do escopo desta feature construir essa tela).

**Query params**: `source_id` (obrigatório), `kind` (opcional),
`parent_id` (opcional, para listar episódios de uma série).

**Response `200 OK`**:

```json
{
  "items": [
    {
      "id": "uuid",
      "kind": "movie",
      "name": "Exemplo",
      "original_group": "Filmes Ação",
      "published": true
    }
  ],
  "next_cursor": null
}
```

Itens com `published = false` (lote incompleto ou job cancelado antes de
publicar) NUNCA aparecem nesta listagem (FR-011).
