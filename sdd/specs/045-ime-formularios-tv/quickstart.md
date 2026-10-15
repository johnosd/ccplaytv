# Quickstart — verificação da feature 045

## Pré-requisitos

- `cd tv-web` · dependências instaladas (`npm install`) · **dev server reiniciado** antes do E2E
  (`npm run dev`; um servidor de ~9 h deixa o E2E instável — nota da 022).
- Nenhum segredo real é necessário: o E2E usa um painel falso local. Para o probe real use as variáveis
  `CCPLAY_PROBE_*` do `.env` da raiz (nunca imprimir valores).

## Automatizado

```powershell
cd tv-web
npx vitest run src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx   # 5/5
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 045-ime-formularios-tv                                                                         # trava íntegra
npx tsc -b
npm run lint
npx vitest run                      # suíte inteira (flakes de paralelismo conhecidos: *.favorites.test.tsx, LiveScreen.test.tsx — repetir isolado)
npm run test:e2e                    # com o dev server de pé; inclui e2e/ime-formularios.mjs
```

## Cenário ponta a ponta (E2E `e2e/ime-formularios.mjs`, painel falso)

1. Cadastro Xtream com **senha errada** → o formulário fica, faixa "Credencial inválida · SRC-401", campos
   preenchidos, foco no botão; `db.sources` vazio. Corrigir **só a senha** e confirmar → progresso abre.
2. Servidor fora do ar → `NET-02` com o botão "Tentar de novo"; `isOnline=false` simulado → `NET-01`.
3. Endereço sem host → `SRC-001`, **zero** requisições ao painel (contar no servidor falso).
4. Painel que responde 404 ao `player_api` mas serve o M3U → **sem erro**, segue ao progresso ("Modo limitado").
5. Lista M3U que serve HTML → `SRC-422`; M3U que serve uma lista grande → a requisição é cancelada depois da
   primeira entrada (o servidor falso conta os bytes enviados).
6. OK repetido durante a espera → 1 lista; RETURN durante a espera cancela e fica; RETURN de novo sai.
7. IME simulado por eventos (`keyCode` 65376): Done na Senha → foco em "Conectar e sincronizar", nada enviado.
8. Em 1920×1080, para cada campo dos 3 formulários: depois do foco, o `.text-field` está na metade superior
   do contêiner (SC-005).
9. "Mostrar senha": revela, nome vira "Ocultar senha", `aria-pressed`; sair e voltar → mascarada.
10. Varredura de segredos: nenhum texto visível/`aria-label` contém a senha, o usuário ou o host de teste (SC-006).

## Passada na TV física (QN50Q60DAGXZD) — **SC-007, a decidir se é gate**

1. Instalar com a sonda: `VITE_CCPLAY_IME_PROBE=1` (skill `tizen-tv`). Registrar em `research.md` R0-1:
   o que chega ao apertar Next, Done, Cancel e RETURN com o teclado **aberto** e **fechado**.
2. Com a tabela `IME_KEYCODES` ajustada: cadastrar uma lista Xtream só com Next/Done e OK final — sem setas
   para trocar de campo (SC-004); ver o campo com o teclado aberto nos 3 formulários (SC-005).
3. Senha: Mostrar/Ocultar; sair e voltar mascarada. Errar a senha de propósito e ver a faixa.
4. "Não testado" nunca vira "aprovado" (constitution; mesmo padrão das 013/027).

## Checklist cross-cutting (constitution)

- [ ] Foco visível e ativável em todo estado (carregando, erro, cancelado) — SC-003.
- [ ] RETURN fecha a camada primeiro (espera → cancela; depois sai).
- [ ] Nenhum segredo em log/banner/`aria-*`/query key (revisão antes do commit).
- [ ] Nenhum arquivo novo emitido pelo build (`tizen_web_project.yaml` inalterado); `npm run build:tizen` só no converge.
