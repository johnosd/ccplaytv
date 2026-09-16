# Quickstart — 002-splash-home-perfis

## Pré-requisitos

- Backend rodando: `cd api && uv run python main.py` (porta 3000).
- Postgres local via `docker compose up -d postgres` (raiz do repo).
- Frontend em dev: `cd tv-web && npm run dev`.

## Checagens automatizadas

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build
```

Sem mudanças de backend nesta feature — não é necessário rodar `pytest`
além da suíte já verde existente, a menos que algo quebre por acidente.

## Cenário ponta a ponta — sem lista cadastrada (US1)

1. Garanta que não existe nenhuma `Source` no banco (`DELETE FROM sources`
   no Postgres local, ou usar um banco limpo).
2. Abra o app (navegador ou TV). **Esperado**: Splash animada (~2,6s) →
   Home já mostrando o formulário "Adicionar lista" diretamente, sem tela
   de estado vazio intermediária.
3. Pressione Backspace/Escape (Voltar do controle) sem preencher nada.
   **Esperado**: diálogo de confirmação de saída aparece, navegável por
   controle (setas + OK). Pressione Voltar de novo enquanto o diálogo está
   aberto — **esperado**: o diálogo fecha (RETURN fecha a camada aberta
   primeiro, constitution "Toda Ação Essencial..."), o app não fecha.
4. Reabra o diálogo (Voltar de novo) e confirme "Sair" — em navegador de
   desenvolvimento isso só fecha o diálogo (sem `window.tizen`); na TV
   física, o app deve encerrar de fato.
5. Preencha e envie o formulário (URL M3U ou provedor). **Esperado**: vai
   pra tela de Progresso; ao voltar, a Home agora mostra o card da lista
   criada — nunca mais o formulário automaticamente.

## Cenário ponta a ponta — com listas já cadastradas (US2)

1. Com 1+ `Source` já no banco, abra o app. **Esperado**: Splash → Home
   mostrando os cards das listas + card "Adicionar lista", navegável por
   controle (setas movem foco entre cards, depois entre ações
   ressincronizar/excluir).
1b. Selecione (OK) o card de uma lista existente. **Esperado**: entra na
   tela já existente daquela lista (tiles Live TV/Filmes/Séries) — FR-007.
2. Recarregue a página/app rapidamente e observe o instante entre a Splash
   terminar e os cards aparecerem — **esperado**: um indicador de
   carregamento visível, nunca um flash do formulário antes dos cards.
3. Derrube o backend momentaneamente e reabra a Home — **esperado**: algum
   indicativo de erro (não um carregamento infinito, não os cards vazios
   como se fosse "nenhuma lista").

## Ícone do app (US3) — só verificável na TV física

1. `cd tv-web && $env:VITE_API_URL = "http://<IP-LAN>:3000"; npm run build:tizen`.
2. Repacotar (`tz pack`, profile sem certificado Samsung — ver
   `sdd/specs/001-importacao-fonte-m3u/plan.md`, seção "Cuidados para
   Retomada") e reinstalar via Apps2Samsung.
3. Na tela de Apps da TV, confirmar visualmente que o ícone do CCPlayTv usa
   o gradiente de marca + triângulo de play, não o ícone genérico anterior.

## Checklist cross-cutting (constitution)

- [ ] Nenhuma credencial de fonte aparece nos cards da Home (só
      `display_name`/status — já garantido pelo backend, `SourceOut` nunca
      inclui senha).
- [ ] Toda ação desta feature (navegar cards, abrir formulário, confirmar
      saída, cancelar diálogo) alcançável só por controle remoto (setas +
      OK + Voltar), sem depender de mouse/touch.
- [ ] RETURN fecha primeiro o diálogo de confirmação aberto, antes de
      qualquer ação de sair da tela/app.
