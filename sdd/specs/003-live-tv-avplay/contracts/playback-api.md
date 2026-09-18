# Contrato: informação de reprodução de um item de catálogo

**Slug**: `003-live-tv-avplay` | **Fase 1** | **Data**: 2026-09-16

Superfície de API nova desta feature. Complementa `contracts/import-api.md`
da feature 001, que documenta `/sources` e `/import-jobs`.

---

## Por que existe um endpoint separado

A ADR-004 §7 impõe as duas metades ao mesmo tempo:

> "Tratar URLs, senhas do provedor e arquivos brutos como potencialmente
> secretos. [...] não devolvê-los em respostas comuns do catálogo. [...]
> Direct Play poderá exigir fornecer à TV informações de reprodução sensíveis
> em tempo de execução, sem incorporá-las ao pacote do app."

Logo: `GET /catalog-items` continua **sem** URL de reprodução, e existe um
endpoint dedicado que a TV só chama quando o usuário pressiona Enter. Ver
`research.md` R0-4 para as alternativas rejeitadas.

---

## `GET /catalog-items/{item_id}/playback`

Devolve a informação necessária para iniciar a reprodução de **um** item.

### Request

| Parâmetro | Local | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- | --- |
| `item_id` | path | UUID | sim | `CatalogItem.id` |

Sem corpo. Sem parâmetros de query nesta versão.

### Response `200 OK`

```json
{
  "item_id": "b3f1c2e4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  "kind": "channel",
  "url": "http://exemplo.invalid/live/usuario/senha/12345.ts",
  "container_hint": "ts"
}
```

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `item_id` | UUID | eco do item solicitado |
| `kind` | enum | `channel` nesta feature; o endpoint é genérico por desenho, mas só canais são exercitados aqui |
| `url` | string | URL de reprodução direta, como veio da fonte. **Pode conter credenciais no caminho ou na query** (Xtream) |
| `container_hint` | string \| null | pista de contêiner derivada da URL (`ts`, `m3u8`, …) quando identificável, para o adaptador de player escolher configuração. `null` quando indeterminado — nunca um palpite apresentado como certeza |

### Response `404 Not Found`

Item inexistente, não publicado, ou pertencente a uma fonte removida.

```json
{ "detail": "Item de catálogo não encontrado." }
```

### Response `409 Conflict`

Item existe e está publicado, mas **não tem URL de reprodução** — o caso do
FR-012. É deliberadamente distinto de `404`: o canal existe e aparece na
lista, apenas não é reproduzível.

```json
{ "detail": "Item sem URL de reprodução disponível." }
```

O cliente usa essa distinção para explicar a indisponibilidade em vez de
tratar como erro genérico. Na prática o cliente nem chega a chamar, porque a
listagem já sinaliza o item como indisponível (ver abaixo) — o `409` é a
defesa para a corrida entre listar e reproduzir.

---

## Alteração em `GET /catalog-items`

O contrato existente ganha **um campo booleano**, e nenhum campo sensível.

### Response `200 OK` (campo novo em destaque)

```json
{
  "items": [
    {
      "id": "b3f1c2e4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      "kind": "channel",
      "name": "Canal Manhã",
      "original_group": "Notícias",
      "published": true,
      "playable": true
    }
  ],
  "next_cursor": null
}
```

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `playable` | bool | **Novo.** `true` quando o item tem URL de reprodução registrada. Derivado de `playback_url IS NOT NULL` — **não** expõe a URL em si |

`playable` é o que permite a lista marcar um canal como indisponível (FR-012)
sem que a listagem carregue segredo. É um booleano, não uma URL: mesmo
cacheado no futuro, não vaza credencial.

`next_cursor` permanece sempre `null` nesta feature — paginação real é
decisão do item 7 do backlog (ver `research.md` R0-6).

---

## Regras transversais

1. **Nenhum log registra a `url`.** Nem em caminho de sucesso, nem em erro,
   nem em exceção propagada. Vale a regra do repositório de não interpolar
   `str(exc)` de cliente HTTP, que embute URL (constitution, Segredos Fora dos
   Clientes e dos Logs).
2. **Sem cache HTTP.** A resposta do endpoint de reprodução não deve ser
   armazenada por intermediários nem pelo cliente. No cliente, o valor vive na
   memória da sessão de reprodução e é descartado ao encerrá-la
   (ADR-002 §5, "retenção mínima").
3. **Uma chamada por tentativa de reprodução.** Mover o foco não chama este
   endpoint (FR-003). "Tentar de novo" após falha chama de novo, pelo
   `item_id` — nunca reutiliza uma URL guardada, para não contornar expiração
   ou revogação (ADR-002 §5).
4. **A identidade é o `item_id`.** Retentativa, sessão e qualquer estado
   futuro de retomada se referem ao item de catálogo, nunca à URL
   (constitution, Identidade de Reprodução Não Depende da URL).

---

## Fora deste contrato

- Autorização por instalação — o backend continua sem autenticação nesta
  fase, como desde a feature 001. A ADR-004 §7 registra que "sem login de
  pessoa não significa API sem autorização"; fechar isso é trabalho da
  migração para VPS (item 38 do backlog), não desta feature.
- Renovação/expiração de URL, catch-up e formatos por `allowed_output_formats`
  — dependem do conector Xtream (item 1 do backlog).
- Qualquer endpoint de progresso, favorito ou histórico — itens 13 e 14.
