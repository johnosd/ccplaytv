# Quickstart — verificação da feature 049

## Pré-requisitos

- `cd tv-web; npm run dev` (porta 5173). Confirme **quem** escuta: `Get-NetTCPConnection -LocalPort 5173 -State Listen` — um Vite de outro worktree já mascarou o gate na 048.
- Lista M3U com 60+ canais numa categoria e 20+ categorias (o E2E `navegacao-por-pagina.mjs` gera uma fictícia).

## Checagens automatizadas

```powershell
npx tsc -b
npx vitest run src/lib/focus src/features/live src/features/vod
node e2e/run.mjs --only navegacao-por-pagina --jobs 1
npm run test ; npm run test:e2e
```

Travas (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 049-navegacao-por-pagina` e as dos slugs regravados.

## Cenário ponta a ponta (navegador ou TV)

1. Abrir TV ao vivo. Na trilha, → : o foco anda **uma tela** de categorias e a lista de canais **não** muda. ← volta uma tela. Nas pontas, para.
2. OK numa categoria: entra, foco no canal lembrado (ou 1º). → anda uma tela de canais, na **mesma linha** da tela; ← volta. No fim, para no último canal.
3. OK num canal: toca. RETURN fecha o player; RETURN de novo volta à trilha, na categoria de origem; OK reentra e devolve o canal.
4. Segurar OK num canal: favorita (toast). ↑ no 1º canal: lupa; → : ícone de Guia; OK: Guia completo no canal de origem; RETURN volta ao mesmo canal.
5. Busca: abrir o campo, digitar, ←/→ movem o cursor; ↓ aos resultados, → pagina; RETURN em camadas.
6. Zapping (OK com o canal tocando): → pagina, OK toca, RETURN fecha só a lista; sem lupa nem Guia.
7. Filmes e Séries: → pagina a trilha, OK entra, a grade anda cartão a cartão, ← na 1ª coluna volta à trilha.
8. Estados: categoria vazia, carregando, erro — OK/RETURN voltam à trilha, nunca preso.

## Itens cross-cutting (constitution / Tizen QA §34)

- Foco inteiro visível, só um `.tv-focus` por tela; setas + OK + RETURN alcançam toda ação essencial.
- Seta segurada: atravessa páginas, sem rede por página, sem erro de página.
- Só a TV física prova: tamanho real da página, suavidade da rolagem, tecla segurada do controle — **recomendação**, não gate.
