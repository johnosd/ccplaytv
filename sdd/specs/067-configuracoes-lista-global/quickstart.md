# Quickstart — verificação da feature 067

## Pré-requisitos

- Feature 066 convergida (a 067 começa depois dela).
- `tv-web/`: `npm install` feito; `npm run dev` rodando para o E2E e a verificação manual.
- Pelo menos duas listas cadastradas (fictícias servem; para os roteiros `-real`, as `CCPLAY_PROBE_*` do `.env` da raiz — nunca copiar os valores para lugar nenhum).

## Checagens automatizadas (em `tv-web/`)

```bash
npx vitest run src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx
npx vitest run src/lib/parental src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts src/features/settings src/features/profiles src/navigation
npx tsc -b
npm run lint
npm run test
npm run build
npm run test:e2e
```

Travas (raiz, PowerShell): `check-contract-tests.ps1 -Slug 067-configuracoes-lista-global`, `-Slug 066-categorias-controle-parental`, `-Slug 026-home-busca-configuracoes-ds-v14` → todas íntegras.

## Cenário ponta a ponta (navegador 1920×1080, só teclado)

1. **Entrada pela tela de perfis**: foco no cartão da lista B (A ativa ou nenhuma) → ↓ → as ações são Ressincronizar · Editar · Excluir · Configurar → Configurar → título "Configurações da lista" com o nome de B e "só para esta lista"; aba Conta & lista focada. Anote quantas teclas levou (R-008).
2. **Abas**: Conta & lista · EPG · Categorias & controle parental · Histórico. Em cada aba, estado vazio/carregando tem algo focado.
3. **Conta & lista**: Editar abre o formulário de B; RETURN volta à aba Conta com Editar focado. Ressincronizar offline explica sem tentar.
4. **EPG**: estado do EPG de B + "Configurar EPG" → tela de EPG de B → RETURN volta com "Configurar EPG" focado.
5. **Categorias**: esconder uma categoria de B → entrar em B: a categoria sumiu; A não mudou.
6. **Histórico**: limpar Filmes de B → o histórico de A continua.
7. **RETURN** na base → tela de perfis com o foco no cartão de B.
8. **Configurações globais** (pela topbar com A ativa): abas Integrações & BYOK, Fontes IPTV, Player & reprodução, Acessibilidade & sistema, Sobre & créditos; aviso "valem para todas as listas"; cada linha de lista tem só "Configurar"; Configurar → tela da lista → RETURN volta à mesma linha.
9. **PIN por lista**: ligar o controle em A (PIN 1111, sugestão mostra só categorias de A) → Editar/Excluir/Categorias de A pedem 1111; os de B não pedem nada; ligar em B com 2222 → 1111 não vale em B; "Esqueci o PIN" de A só aceita os dados de A; "Adicionar lista" nunca pede PIN; desligar em A não mexe em B.
10. **Excluir pela tela da lista**: excluir B (aberta pelos perfis) → volta aos perfis com o foco na vizinha (ou "Adicionar lista"); excluir a lista ativa → perfis como tela base (fluxo atual).
11. **"Gerenciar" do vazio "todas escondidas"** (Live/Filmes/Séries com todas as categorias escondidas) → abre a tela da lista ativa na aba Categorias; RETURN volta à tela de onde veio.
12. **Migração**: num perfil do navegador com a 066 instalada e PIN ligado (categoria bloqueada em A, nenhuma em B) → atualizar para a 067 → A pede o mesmo PIN; B sem PIN; nada que estava bloqueado aparece livre.

## Itens cross-cutting (constitution)

- Revisão de segredos: nada de PIN, hash, DNS, usuário, senha ou URL de lista em log, toast, tela ou mensagem de erro (inclusive em `localStorage`, que guarda só ids).
- Foco: todo estado com elemento focável; voltar sempre restaura o foco por id.
- TV física (recomendada, não é gate): navegação das abas novas por D-pad, teclas numéricas no PIN por lista, migração com o PIN da 066 já instalado na TV.
