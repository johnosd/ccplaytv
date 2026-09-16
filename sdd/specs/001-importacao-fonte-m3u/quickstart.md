# Quickstart: Importação de Fonte M3U por URL e por Provedor

## Pré-requisitos

- Docker (para o PostgreSQL local via `docker-compose.yml`).
- `uv` instalado, Python 3.13 (`api/.python-version`).
- Node.js/npm para `tv-web/` (React/Vite já scaffolded).
- Uma URL M3U sintética/de teste acessível (não usar `docs/m3u/dados.md`
  em nenhum arquivo commitado, script de teste automatizado ou prompt de
  agente — usar essas credenciais reais apenas manualmente, direto no
  navegador/Postman, se for testar o conector de provedor de verdade).

## Checagens automatizadas (rodar antes da verificação manual)

```powershell
cd api
uv run pytest
uv run ruff check .
```

```powershell
cd tv-web
npm run lint
npx vitest run
```

Todas devem passar antes de considerar qualquer task "pronta" (constitution
— Fluxo de Desenvolvimento).

## Subir o ambiente

```powershell
docker compose up -d postgres
cd api
uv run alembic upgrade head
uv run python main.py
```

Em outro terminal:

```powershell
cd tv-web
npm run dev
```

## Cenário ponta a ponta (User Story 1 — URL)

1. Abrir o frontend (`http://localhost:5173`), ir para "Adicionar fonte".
2. Escolher a opção URL, informar um nome de exibição e uma URL M3U de
   teste sintética válida.
3. Confirmar. Verificar que a tela de progresso aparece com
   `status = queued`/`running` e contadores começando a se popular.
4. Aguardar `status = completed` (ou `completed_with_warnings`). Verificar
   contadores finais coerentes (SC-001, SC-003).
5. Consultar `GET /catalog-items?source_id=<id>` e confirmar que os itens
   aparecem classificados em `channel`/`movie`/`series`/`episode`/
   `unclassified`, sem nenhum com `published=false` (SC-004).
6. Fechar a aba/tela de progresso e reabrir — confirmar que o estado
   correto ainda aparece sem reiniciar a importação (SC-006, FR-012).

## Cenário ponta a ponta (User Story 2 — Provedor)

1. Repetir o fluxo acima escolhendo a opção de provedor, com um usuário e
   senha de teste autorizado (usar as amostras do desenvolvedor
   diretamente, sem colar em nenhum arquivo do repositório).
2. Testar também usuário/senha inválidos — confirmar erro específico de
   autenticação, sem a senha aparecer em nenhuma resposta ou log
   (FR-002 cenário 2).

## Cenário de cancelamento (User Story 3)

1. Iniciar uma importação com uma lista grande o suficiente para não
   terminar instantaneamente.
2. Acionar "Cancelar" na tela de progresso.
3. Confirmar que a interface indica "cancelamento solicitado" e só depois
   mostra `status = cancelled`.
4. Consultar `GET /catalog-items?source_id=<id>` e confirmar que nenhum
   item do lote incompleto aparece (`published=false` filtrado).

## Casos de erro a verificar manualmente

- URL retornando HTML de erro → mensagem específica, não "sucesso".
- URL apontando para um manifesto HLS → não vira centenas de canais
  (FR-009).
- Lista M3U vazia → catálogo vazio relatado, não erro genérico.
- Falha de rede simulada (desligar a rede durante a aquisição) → erro
  específico + botão de nova tentativa manual, sem retry automático
  (FR-015).
- Reenvio do mesmo `request_key` (ex.: dar duplo-clique em "Confirmar") →
  não cria uma segunda fonte/job (FR-018).

## Navegação por controle remoto (dev: teclado simulando setas)

Percorrer todo o fluxo acima usando apenas Tab/Setas/Enter/Esc no
navegador, sem mouse, incluindo abrir e fechar a alternância URL/Provedor
e o botão Cancelar (constitution — Toda Ação Essencial Tem Caminho
Completo por Controle Remoto). Teste em hardware real (Q60D) é recomendado
mas não bloqueia esta feature nesta fase do projeto (constitution —
Restrições do Projeto).
