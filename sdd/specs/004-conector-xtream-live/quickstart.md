# Quickstart — 004-conector-xtream-live

## Pré-requisitos

- Postgres local: `docker compose up -d postgres` (raiz do repo) **ou** a
  instância nativa na 5432, que é o que esteve em uso em 17-18/09/2026.
- Migração aplicada: `cd api && uv run alembic upgrade head` — esta feature
  **tem** migração, ao contrário da 003.
- Backend: `cd api && uv run python main.py` (porta 3000, `HOST=0.0.0.0` para
  a TV alcançar).
- Frontend em dev: `cd tv-web && npm run dev` (5173, já no CORS).
- **Uma fonte de provedor real** com DNS, usuário e senha válidos. Os valores
  ficam em `docs/m3u/dados.md`, que é gitignored — nunca copiar para
  comando, log, commit ou este arquivo.

**Cuidado ao ler a Home**: o banco de desenvolvimento acumula fontes criadas
pela própria suíte de testes (R-007). Antes de concluir qualquer coisa sobre
"minhas listas", confirme pelo nome qual fonte é a real.

## Checagens automatizadas

```powershell
cd api
uv run alembic upgrade head
uv run ruff check .
uv run pytest

cd ..\tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build
```

## Cenário A — o catálogo vem com a estrutura do provedor (US1)

1. Cadastrar uma fonte de provedor com credenciais válidas e acompanhar a
   importação até concluir.
2. Abrir a lista → **Live TV**.
3. **Esperado**: os grupos são as categorias que o painel declara, com os
   mesmos nomes e na ordem do painel — não categorias derivadas de texto de
   M3U.
4. Reproduzir um canal. **Esperado**: toca. É o SC-006 — a troca de conector
   não pode regredir a reprodução validada na feature 003.
5. Conferir no backend que os canais gravados têm o identificador do
   provedor (consulta direta ao banco, sem imprimir URL nem credencial).

## Cenário B — estados de conta (US2)

Três verificações, cada uma com mensagem distinta (FR-005):

1. **Credencial inválida**: cadastrar com senha errada de propósito.
   **Esperado**: o app explica que as credenciais não foram aceitas.
2. **Assinatura expirada**: se houver conta expirada disponível.
   **Esperado**: mensagem distinta da anterior, dizendo que expirou. Se não
   houver conta nesse estado, registrar como **não observado** — não inferir.
3. **Conta ativa**: o caminho feliz do Cenário A.

Em todos, conferir que nenhuma mensagem, tela ou log contém senha, usuário ou
o endereço completo do servidor (FR-018, SC-007).

## Cenário C — painel incompatível (US3)

1. Apontar uma fonte de provedor para um endereço que não fala o protocolo
   JSON.
2. **Esperado**: a importação acontece pelo caminho M3U existente e conclui;
   a fonte aparece na Home com a **indicação discreta de modo limitado**, e
   não como erro.
3. Abrir Live TV nessa fonte. **Esperado**: os canais aparecem com as
   categorias que o M3U declarava — nunca com categorias inventadas para
   compensar.

**Se o painel do provedor real não falar o protocolo JSON**, este cenário
passa a ser o principal, e o resultado é evidência válida (R-008) — não
fracasso silencioso.

## Cenário D — a substituição do catálogo (FR-013, R-001)

O cenário que prova que o bug de duplicação morreu.

1. Anotar quantos canais a fonte tem.
2. Ressincronizar a mesma fonte pela ação da Home.
3. **Esperado**: ao terminar, a contagem é a **mesma** — não o dobro.
4. Durante a reimportação, navegar o catálogo. **Esperado**: o catálogo
   anterior continua utilizável (ADR-004 §6).
5. Forçar uma falha no meio (derrubar a rede do provedor ou o backend).
   **Esperado**: o catálogo anterior permanece intacto e a marca de última
   sincronização **não** avança.

## Cenário E — frescor (US4, US5)

1. **Migração única**: com uma fonte importada pelo caminho antigo, abrir a
   lista. **Esperado**: a reimportação começa em segundo plano, o catálogo
   anterior continua navegável. Sair e abrir de novo: **nenhuma** nova
   importação.
2. **Fonte fresca**: abrir uma fonte sincronizada há pouco. **Esperado**:
   nenhuma requisição ao provedor (verificável no log do backend).
3. **Fonte velha**: com uma fonte cuja última sincronização passou do prazo,
   abrir a lista. **Esperado**: a atualização dispara sozinha, em segundo
   plano.
4. **Troca embaixo do usuário**: enquanto a atualização do item 3 conclui,
   estar navegando a lista de canais. **Esperado**: a lista não salta e o
   item focado continua focado — reconciliação por identificador, não por
   posição (FR-022, SC-012).
5. **Ação explícita**: usar "Ressincronizar lista" na Home. **Esperado**:
   atualiza na hora, sem esperar prazo (FR-021).

## Checklist cross-cutting (constitution)

- [ ] Nenhuma senha, usuário ou endereço completo de servidor aparece em
      tela, em resposta de API ou em log do backend — num ciclo de sucesso
      **e** num de falha (SC-007).
- [ ] As categorias exibidas são as do provedor, em nome e ordem (SC-001).
- [ ] Nenhuma requisição ao provedor sai fora da política de rede — inspeção
      dos pontos de saída do conector (SC-010).
- [ ] Todo estado novo na Home (modo limitado, atualizando) continua
      navegável por controle remoto, sem prender o foco.
- [ ] Reproduzir um canal na TV física continua funcionando (SC-006).
- [ ] Nenhum dado de `docs/m3u/dados.md` foi copiado para código, teste,
      commit ou documento.
