# Quickstart — 037 Entrada fiel ao protótipo

Verificação manual e automatizada da tela de listas e do cadastro de lista.

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci` se preciso).
- Dev server: `cd tv-web; npm run dev` (porta 5173).
- Protótipo servido para comparar lado a lado (o `file://` é bloqueado no
  Playwright MCP): `cd docs/design/design-system; python -m http.server 8765` →
  `http://localhost:8765/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html`
  (a tela de listas é a primeira; o cartão "Adicionar lista" abre
  `sourceSetup()`).
- Viewport 1920×1080.

## Checagens automatizadas

```powershell
cd tv-web
npx vitest run src/features/profiles/listAvatar.entrada-listas.contract.test.ts src/features/profiles/ProfilesScreen.entrada-listas.contract.test.tsx src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx
npx vitest run src/features/profiles src/features/import src/navigation src/App.test.tsx
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 037-entrada-listas-prototipo
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 023-shell-navegacao-entrada-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14
cd tv-web; npx tsc -b; npm run lint; npm run build:tizen
npm run test:e2e        # com o dev server rodando — todos os scripts usam o cadastro
```

## Cenário A — lista existente (US1)

1. Com ≥ 2 listas (uma Xtream, uma M3U), abrir `http://localhost:5173/`.
2. Após o Splash: marca, "BEM-VINDO DE VOLTA", "Selecione ou Adicione / sua
   lista", subtítulo, fileira centralizada de cartões, "Adicionar lista" por
   último, nota de rodapé, "⚙ Configurações" no canto inferior direito.
3. Cada cartão: selo XTREAM/M3U no topo, avatar com iniciais em gradiente,
   nome; nenhuma data de sincronização; nenhum endereço.
4. Recarregar a página: cada lista mantém o mesmo par de cores.
5. ←/→ move o anel de foco V14 (laranja, escala) entre cartões; OK numa lista
   abre o Início dela.
6. ↓ numa lista abre Ressincronizar/Editar/Excluir sob ela; RETURN fecha.
7. Foco em "Adicionar lista" → ↓ → "⚙ Configurações" em foco → OK abre
   Configurações › Fontes IPTV sem topbar.
8. Comparar com o protótipo em captura lado a lado (SC-001).

## Cenário B — cadastro (US2)

1. OK em "Adicionar lista": abre "Conecte sua lista IPTV" com "Como funciona",
   "Adicionar serviço", "Conectar com celular" (Em breve) e "Configuração
   manual", Xtream Codes selecionado e em foco.
2. Campos: Nome da lista, Servidor, Usuário, Senha — rótulos permanentes,
   nenhum placeholder, teclado da TV certo por campo.
3. Digitar um nome, escolher Lista M3U: o nome continua; campos viram Nome da
   lista + URL M3U.
4. Descer por todos os focáveis com ↓: o elemento em foco fica sempre inteiro
   na tela (a área rola se precisar); "Conectar e sincronizar" é alcançável.
5. OK em "Conectar com celular": só anuncia "Em breve"; nada muda.
6. "Voltar" (ou RETURN): volta à tela de listas com o foco em "Adicionar
   lista".
7. Com o nome vazio, "Conectar e sincronizar" mostra "Informe um nome para a
   lista." e não sai da tela.
8. SC-002: contar os OK — "Adicionar lista" (1) e "Conectar e sincronizar"
   (2); preencher os campos não conta. Deve dar ≤ 3.
9. Preencher uma M3U válida e "Conectar e sincronizar": abre a tela de
   progresso; "Abrir lista" leva ao Início; RETURN/trocar lista mostra o novo
   cartão.

## Cenário C — primeiro uso (US3)

1. Apagar o IndexedDB do origin (DevTools › Application › Storage) e recarregar.
2. Tela de listas só com "Adicionar lista", em foco, com kicker/subtítulo de
   primeiro uso. RETURN abre "Sair do CCPlayTV?".

## Cenário D — edição (US4)

1. Numa lista Xtream: ↓ → Editar. Mesma tela nova, título de edição, sem
   "Conectar com celular", sem "Como funciona", sem escolha de tipo; Servidor preenchido, Usuário e
   Senha em branco com a dica "Deixe em branco para manter…".
2. Trocar o nome, "Salvar alterações": volta e o cartão mostra o nome novo.

## Itens da constitution (pré-aceite)

- Foco visível em todo estado, inclusive carregando/erro/vazio (Foco Visível e
  Sem Becos Sem Saída).
- Voltar do cadastro devolve o foco a "Adicionar lista" (Voltar Restaura Foco
  e Posição); voltar de Configurações segue como hoje.
- Nenhuma credencial, URL de lista ou de servidor em cartão, anúncio ou erro
  (Segredos Fora dos Clientes e dos Logs).
- Mock do celular sem dado inventado (IA e Classificação Nunca Inventam Dados /
  política de mocks da ADR-011).

## TV física (recomendado, não gate)

`tizen-tv` → conferir o anel de foco e a rolagem do cadastro no controle
real, o teclado (IME) de cada campo e a legibilidade das iniciais sobre os seis
gradientes a 3 m.
