# Quickstart — 070

## Pré-requisitos

- Constitution 1.10.0 e ADR-014 aprovados (Fase 1).
- `tv-web`, `portal-web` e `api/.venv` instalados; Java 21 para o emulador (`JAVA_HOME` do Android Studio serve).

## Checagens automatizadas

1. Contratos: comando da seção "Testes de Contrato" do `plan.md` → 5/5 verdes; travas 070, 037 (emendada), 045, 023, 069 íntegras.
2. TV: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`.
3. API: `pytest tests/portal` com emulador + `ruff check app/portal tests/portal`.
4. Portal: `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`.
5. E2E: `node e2e/portal-dev-server.mjs`, `node e2e/entrada-listas-gerenciador.mjs`, `npm run test:e2e` (com `npm run dev`), `e2e/legibilidade-tv.mjs` incluindo a tela Adicionar em pt/en/es.

## Cenário ponta a ponta (PC, `npm run dev:portal`)

1. Abrir `http://localhost:5173` → "Adicionar lista": ID `XX:XX:XX:XX:XX:XX`, chave de 10 dígitos, endereço e QR visíveis sem ação; foco em elemento visível.
2. No portal, entrar por ID + chave digitados; chave errada 5× → bloqueio com mensagem uniforme.
3. Criar lista Xtream no portal; "Recarregar" na TV aplica em ≤10 s.
4. Editar a lista no portal: URL/usuário/senha salvos visíveis, olho oculta; salvar → TV aplica.
5. Editar a lista na TV: valores salvos visíveis; olho oculta os três.
6. "Gerar nova chave" na TV → sessão do portal cai; chave antiga recusada.
7. Do player/detalhe: RETURN em cadeia → Início → tela de listas → "Sair do CCPlayTV?".

## TV física (antes de qualquer distribuição)

- `build:tizen:commercial` (staging) + `deploy-tv.ps1 -SkipBuild`, **sem desinstalar**: listas preservadas; upgrade D-004 gera ID/chave novos; MAC exibido ou ID gerado (anotar qual) — sonda T003.
- Repetir passos 1–7 com o controle; registrar em `evidencias/tv.md` quem viu cada item.

## Segurança (revisão obrigatória)

Marcadores fictícios em URL/usuário/senha: ausentes de logs da API, URLs, QR, mensagens de erro e cache; presentes só nos campos e na resposta `values` da sessão da própria TV.
