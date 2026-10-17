# Quickstart — 077 Redesenho do portal web

## Pré-requisitos

- `portal-web/`, `api/` (`uv sync --locked`) e `tv-web/` com dependências instaladas; `gcloud` + Java 21+ + `api/.venv` para a pilha local.
- Para os E2E do portal: `cd portal-web; npm run dev` (porta 5174) em outro terminal. Para testes do serviço: emulador Firestore em `127.0.0.1:8085` e `$env:PORTAL_TEST_FIRESTORE='1'`.

## Checagens automatizadas

```powershell
# portal-web
cd portal-web
npx vitest run
npm run lint; npx tsc --noEmit; npm run build
npx playwright test                      # com `npm run dev`; inclui os 2 contratos de UI e layout.spec nas 4 larguras
# serviço (emulador no ar)
cd ..\api; $env:PORTAL_TEST_FIRESTORE='1'; uv run pytest tests/portal -q; uv run ruff check .
# TV
cd ..\tv-web
npx vitest run src/lib/portal/tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts
npm run lint; npx tsc -b; npm run test; npm run build
node e2e/run.mjs                         # com `npm run dev`
# trava
cd ..; powershell -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 077-redesenho-portal-web
```

## Cenário ponta a ponta (`cd tv-web; npm run dev:portal`; portal em `http://127.0.0.1:5174`, abra nas larguras 360 px e 1280 px)

1. **Entrada sem QR**: digite o ID e a chave exibidos na TV (Adicionar lista → Pelo site) e conecte. Saia (Ajustes → Sair) e volte: o **ID vem preenchido**, a chave vazia e o foco na chave. **Usar outra TV** limpa o ID.
2. **Casca**: em 360 px a barra inferior mostra Listas, Licença e Ajustes (Listas atual); em 1280 px é um menu lateral. O resumo mostra o ID da TV, a licença e o último contato. Não existe Revendedores nem Recarregar.
3. **Listas**: Adicionar lista (M3U por URL) → Enviar para a TV. O cartão mostra "Aguardando a TV" e a mensagem diz "na TV, aperte Atualizar". Na TV, Configurações → Portal & licença (ou o botão Atualizar dos perfis): o cartão vira "Na TV". Edite o nome; exclua com **Sim, excluir** (Cancelar não muda nada). Provoque um erro (operação vencida) e confira que só aparece **Reenviar**.
4. **Licença**: o botão diz Comprar (teste) ou Renovar (ativa); a frase ao lado cita o ID da TV; não há caixa para marcar. O retorno do Checkout abre Licença.
5. **Chave TMDB** (depois da US4): Ajustes → Chave TMDB → cole uma chave válida → "Aguardando a TV" → na TV, aperte Atualizar → "Aplicada na TV". Envie uma inválida → "Recusada pelo TMDB". Remover → confirmação → "Não configurada" após o Atualizar. **A chave nunca reaparece** na página, no endereço ou no console.
6. **Backup**: Ajustes → Backup mostra data e contagens (ou "Nenhum backup guardado"); **Excluir backup** pede confirmação e a mensagem diz que nada na TV foi apagado.
7. **Ajustes**: Código de recuperação, Recuperar acesso, Ajuda (FAQ atualizada) e Sair, cada um com uma linha de descrição.
8. **Teclado/PC e acessibilidade**: Tab percorre na ordem lógica com foco visível; Esc fecha confirmações; zoom a 200% sem corte; teclado virtual do celular não cobre o campo em foco.
9. **Idiomas**: troque o idioma do navegador para en e es e confira os textos novos.

## Revisão de segredos (constitution)

- Busque o marcador de teste da chave TMDB em logs do serviço, respostas ao navegador, `localStorage`/`sessionStorage`, URLs e console: **zero** ocorrências.
- `localStorage` só ganhou `ccplay-portal-last-device` (ID, não secreto).

## Fora do gate

Passada em TV física (a TV não ganha tela nova; só aplica a chave no Atualizar).
