# Quickstart — 066 Gestão de categorias e controle parental

## Pré-requisitos

- `tv-web/`: `npm install`; `npm run dev` no ar (E2E usa `http://localhost:5173`).
- Uma lista Xtream fictícia do E2E (fixture) **e**, para a medição, a lista real do `.env` da raiz
  (`CCPLAY_PROBE_*`, nunca impressa).

## Checagens automatizadas

```bash
cd tv-web
npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts src/lib/parental/pin.categorias-controle-parental.contract.test.ts src/components/PinPrompt.categorias-controle-parental.contract.test.tsx
npx tsc -b
npm run lint          # catraca: nenhum arquivo acima do teto
npm run test
npm run build
npm run test:e2e
```

Na raiz: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 066-categorias-controle-parental`.

## Cenário ponta a ponta (navegador)

1. **Esconder (US1)**: Configurações › Categorias & parental › Filmes › esconder "Terror". Voltar e
   conferir: lista lateral de Filmes, fileiras (recentes, bem avaliados, Top 10/Dica se houver chave),
   "Todos", busca local e global, Início, Favoritos/Histórico/Continuar assistindo — nenhum filme de
   Terror. Mostrar de novo → tudo volta, com favorito e progresso.
2. **Canais**: esconder uma categoria de canais; zapping (canal acima/abaixo) a partir de um canal livre
   pula os escondidos; guia não lista; números dos outros canais não mudam.
3. **Bloquear (US2)**: bloquear "Noite" → criar PIN (2×) → aparece a sugestão adulta (US3) → confirmar.
   Na trilha, "Noite" com cadeado; focar não carrega nada (aba Rede do DevTools sem pedido da categoria).
   SELECT → PIN; errado → "PIN incorreto", campo limpo, foco no teclado; certo → abre. Busca agora acha
   itens de "Noite". Trocar de aba do navegador (segundo plano) e voltar → bloqueada de novo.
4. **Protegidas**: com PIN, abrir a aba Categorias & parental, "Adicionar lista" (perfis), "Editar lista"
   e "Remover lista" (perfis e Configurações) → todos pedem PIN; RETURN no PIN volta sem fazer nada.
5. **Sugestão (US3)**: lista fictícia com "XXX Adultos", "Filmes 18+" e comuns → pré-marcadas só as duas;
   desmarcar uma e confirmar; simular atualização com "Adult Live" nova → chega bloqueada.
6. **Recuperação (US4)**: "Esqueci o PIN" → Xtream com senha errada (mensagem genérica, sem eco) →
   certa → criar PIN novo; bloqueios continuam. Repetir com o endereço de uma lista M3U. DevTools: zero
   requisição.
7. **Desligar**: com o PIN, desligar → nada bloqueado, escondidas continuam escondidas.
8. **Idiomas**: pt/en/es em todas as telas novas; nomes de categoria não traduzidos.
9. **Medição** (lista real): tempo de `getCategoryAccess` e da 1ª fileira de Filmes com e sem
   categorias escondidas/bloqueadas (meta < 10 ms por chamada; sem regressão perceptível).

## Checklist cross-cutting (constitution)

- [ ] Todo estado novo com elemento focável (carregando, vazio, erro, bloqueada, todas escondidas).
- [ ] RETURN fecha primeiro a camada aberta (PIN, sugestão, recuperação).
- [ ] PIN, usuário, senha e endereço nunca em tela, log, erro ou `aria-label`.
- [ ] Nenhuma requisição de rede nova (DevTools).
- [ ] Nomes e ordem das categorias iguais aos da lista.
- [ ] Tokens V14 apenas; fontes locais.

## TV física — recomendada, não gate (constitution: "Validação em hardware real")

- Teclas numéricas do controle chegam ao PIN (R-003).
- Qual caminho de hash rodou (`crypto.subtle` ou JS) na origem `file://` (R-002).
- Segundo plano real (botão Home/Smart Hub) rebloqueia.
