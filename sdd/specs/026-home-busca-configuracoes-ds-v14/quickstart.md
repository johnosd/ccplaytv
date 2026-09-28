# Quickstart — 026 Home definitiva, Busca global e Configurações

## Pré-requisitos

- `tv-web/`: `npm install`; `npm run dev` rodando (http://localhost:5173).
- Uma lista cadastrada com filmes, séries (com episódios já abertos em ao
  menos uma) e canais; idealmente uma segunda lista em Modo limitado (M3U
  sem protocolo de painel).
- Os E2E usam o caminho do Chromium Linux fixo (ver `CLAUDE.md`); no
  Windows, override temporário em cada script.

## Checagens automatizadas

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx
npx vitest run
npm run build:tizen
npm run test:e2e
cd ..
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 023-shell-navegacao-entrada-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 024-live-tv-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 025-filmes-series-ds-v14
```

## Cenário ponta a ponta (navegador, só teclado)

1. **Home vazia**: lista recém-importada, sem progresso/favoritos → hero de
   boas-vindas com "Abrir TV ao vivo"/"Abrir Filmes" focáveis; só rails mock
   (Curadoria IA, dock). OK nos mocks → "Em breve — …".
2. **Favoritos**: favorite um filme, uma série e dois canais; volte ao Início
   → hero = favorito mais recente ("Assistir"); rails "Minha Lista" (com
   "Filmes (1)"/"Séries (1)") e "Canais favoritos" (com "Ver todos (2)").
   Cada atalho abre a seção certa em ★ Favoritos; RETURN volta ao mesmo item.
3. **Retomada**: assista um filme por ≥ 1 min, saia → Início com hero
   "Continuar" focado; OK retoma na posição; RETURN fecha e o foco volta a
   "Continuar". Repita com um episódio: retoma o episódio certo.
4. **Canal**: OK num card de "Canais favoritos" → Live em ★ Favoritos com o
   canal tocando; RETURN (player) → canal focado; RETURN → Início no card.
5. **Minha Lista no hero**: OK em "Minha Lista" → rótulo muda e a rail se
   atualiza sem sair da tela; desfavorite o último item de uma rail com o
   foco nela → a rail some e o foco vai para a linha acima.
6. **Busca**: da topbar de Filmes, lupa → campo focado, "Busca em X de Y
   categorias". Digite 1 letra (nada), 2+ letras (rails por tipo), um termo
   inexistente (estado vazio + "Editar busca"). OK num filme → detalhe;
   RETURN → busca com o termo e o mesmo resultado focado; RETURN → Filmes
   com a lupa focada. Painel de rede do navegador: nenhuma requisição ao
   digitar.
7. **Configurações pela topbar**: engrenagem → "Fontes IPTV" focada; lista
   ativa marcada; lista em Modo limitado com badge e explicação; **nenhuma**
   URL/usuário/senha em tela. Editar → salvar → volta à mesma lista.
   Ressincronizar → tela de progresso. Excluir lista inativa → modal com
   "Cancelar" focado; OK duplo não apaga; confirmar apaga e o foco vai à
   vizinha. Excluir a ativa → "Quem está assistindo?" como base.
8. **Acessibilidade/Sobre**: "Reduzir movimento" alterna e persiste após
   recarregar a página; Sobre mostra a versão de `CCPlayTv/config.xml`; abas
   mock com "Voltar às abas".
9. **Gerenciar listas**: na tela de perfis, "Gerenciar listas" → Configurações
   sem topbar; RETURN → perfis. As ações por cartão continuam lá.
10. **Início na topbar** a partir da Live aberta pela busca → volta ao Início
    (não à busca).

## Itens cross-cutting da constitution

- Todo estado com elemento focável e SELECT funcional (percorrer carregando,
  vazio, erro em cada tela nova).
- Focar nunca reproduz nem dispara rede (conferir no painel de rede).
- Offline (DevTools → Offline): Início, Busca e Configurações abrem; só
  reproduzir/ressincronizar falham com as mensagens existentes.

## TV física (recomendado, não gate — R-003/R-006/R-008)

- Abrir o Início com várias rails e medir fluidez do foco.
- Retomar pelo hero: vídeo aparece sem a moldura pintando por cima.
- IME da TV na busca: SELECT abre o teclado, RETURN fecha o teclado sem sair
  da tela, Done leva aos resultados.
