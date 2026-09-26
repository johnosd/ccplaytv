# Quickstart: verificação da 014-m3u-sob-demanda

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm install`).
- `npm run dev` rodando (http://localhost:5173).
- Para as medições com dados reais: a URL M3U real do usuário, digitada
  **só no formulário do app**. Nunca copiada para spec, plano, log,
  commit ou prompt (`docs/m3u/dados.md` é gitignored e continua fora de
  tudo isso).

## Checagens automatizadas

```powershell
cd tv-web
npm run test
npm run lint
npm run build
npm run test:e2e      # com npm run dev já rodando
```

## Medição (SC-001, SC-002, SC-003)

Registrar cada número com o ambiente (navegador do PC ou TV física).

1. **Antes de qualquer mudança (T001)**: já feito pelo usuário — **60 s**
   no navegador, com a lista real (registrado em `plan.md`). Não repetir.
2. **Depois da US1**: repetir com a mesma URL. Se for URL de painel,
   o caminho é o Xtream: meta ≤ 15 s (SC-001).
3. **Depois da US3**: forçar o conteúdo guardado com uma lista avulsa
   grande (ou com um painel que não responde ao protocolo) e anotar o tempo
   (SC-002, comparar com o passo 1). Entrar na maior categoria e anotar o
   tempo até os itens aparecerem (SC-003, meta ≤ 3 s); na aba de rede do
   DevTools, confirmar zero requisições nessa entrada.

## Cenário ponta a ponta (navegador)

1. **Painel confirmado (US1)**: adicionar URL `…/get.php?username=…&password=…`
   de um painel que responde. Esperado: importação conclui contando
   categorias; nenhuma requisição a `get.php`; Home sem selo; hub sem
   explicação; entrar numa categoria traz itens; um canal toca.
2. **Painel recusa**: mesma forma de URL com senha errada. Esperado: falha
   "credenciais recusadas"; nenhuma tela mostra a URL, o usuário ou a senha.
3. **Modo limitado (US2)**: painel que não responde a `player_api.php`.
   Esperado: selo "Modo limitado" na Home; hub explica o motivo ("o painel
   não respondeu ao protocolo completo"), que todos os itens identificados
   estão disponíveis, o que a fonte perde, entradas descartadas (se houver)
   e o que fazer; nenhuma URL/usuário/senha na tela.
4. **Lista avulsa (US3)**: URL de um `.m3u` estático. Esperado: sem selo;
   importação conclui sem itens em `channels` (DevTools → IndexedDB →
   `ccplaytv` → `channels` vazio para a fonte); entrar numa categoria traz
   os itens sem requisição; voltar a ela não relê (`storedEntries` da
   categoria some depois da primeira leitura).
5. **Conteúdo ausente**: com a fonte do passo 4, apagar pelo DevTools as
   linhas de `storedEntries` de uma categoria ainda não aberta e entrar
   nela. Esperado: estado de erro com "Ressincronizar lista" e "Voltar",
   ambos ativáveis por SELECT; a categoria continua na trilha.
6. **Ressincronizar**: na Home, ressincronizar a fonte do passo 3 depois de
   o painel voltar a responder. Esperado: selo e explicação somem.

## Itens da constitution a conferir

- Todo estado novo (conteúdo ausente, explicação do hub) tem saída focável
  e ativável por SELECT, só com o controle.
- Nenhum log do console, mensagem de erro ou tela mostra URL completa,
  usuário ou senha (ADR-010, constitution 1.5.0).
- Tela de progresso sem percentual.
- Explicação do hub usa tokens de `tv-web/src/index.css`, sem cor, raio ou
  tamanho de fonte literal.

## TV física (recomendada, não obrigatória)

Pelo procedimento `tizen-tv`: repetir os passos 1, 3 e 4 com a lista real
e registrar os tempos de SC-001/SC-003 no `plan.md`.
