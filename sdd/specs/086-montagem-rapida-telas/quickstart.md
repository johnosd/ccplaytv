# Quickstart: Montagem rápida das telas principais (086)

## 1. Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Para a TV: o IP atual da TV, o coletor de métricas no ar e **autorização do usuário para cada instalação**.
- Uma lista real ativa no aparelho, já carregada (as fileiras calculadas só existem com catálogo).

## 2. Checagens automatizadas (em `tv-web/`)

```powershell
npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts   # 5/5
npx vitest run src/lib/catalog src/features/catalog src/features/vod src/features/home
npm run test
npx tsc -b
npm run lint
npm run build
```

Na raiz, as travas desta feature e das que ela pode quebrar:

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 082-orcamento-armazenamento-tv
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 085-gravacao-carga-secao-tv
```

E2E, com `npm run dev` no ar (use o Bash: no PowerShell o `--` some):

```bash
cd tv-web && npm run test:e2e -- --only carrosseis-filmes-series,home-vitrine-expandida,bem-avaliados,vitrine-filmes-series,campos-da-listagem
cd tv-web && npm run test:e2e        # gate antes da TV
```

## 3. Conferir que a varredura saiu do caminho da tela (sem a TV)

No build de desenvolvimento, abrir Início, Filmes e Séries e confirmar, pelo painel de medição, que:

- as fileiras "Adicionados recentemente" e "Bem avaliados" aparecem preenchidas na revelação;
- nenhuma montagem dispara leitura de bloco do catálogo (o contrato C3 cobre isso de forma automatizada).

## 4. TV física — linha de base (Fase 1, antes de mudar o desenho)

Siga a skill `tizen-sonda`, modo C (app real com o canal de métricas):

1. Coletor: `node sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs <ip-da-tv> 8770 --app-saida sdd\specs\086-montagem-rapida-telas\evidencias\linha-de-base.jsonl`
2. Build de medição: `$env:VITE_CCPLAY_PERF = "1"; $env:VITE_CCPLAY_METRICS_REPORT = "http://<ip-do-pc>:8770/app-metrics"; npm run build:tizen`
3. **Pedir autorização** e instalar com `deploy-tv.ps1 -SkipBuild -TvIp <ip>` (preserva os dados).
4. Roteiro, na ordem: abrir **Início** (1ª vez na sessão) → **Filmes** → **Séries**; depois, em cada uma, mover o foco entre
   cards e entre fileiras e rolar até o fim.
5. Ler do `.jsonl`, por tela: `revealMs`, motivo, tempo por leitura, `paintMs`, quadros longos, pico de heap e capas
   prontas/pedidas. Gravar em `evidencias/linha-de-base-tv-<data>.md`.
6. **Reinstalar o pacote normal, avisando o usuário.**

## 5. TV física — validação (Fase 7)

Mesmo roteiro da seção 4, com o código da feature, gravando em `evidencias/validacao-tv-<data>.md`. Critérios:

| Critério | Meta |
| --- | --- |
| SC-001 | Início com conteúdo em ≤ 1 s na primeira abertura |
| SC-002 | Nenhuma das três revela por `cap` |
| SC-003 | Filmes e Séries ≤ 1 s com no máximo 2 leituras pendentes |
| SC-004 | Montar as fileiras de um tipo ≤ 100 ms |
| SC-005 | Com a tela aberta durante uma atualização, as fileiras acompanham sem sair da tela |
| SC-006 | Com o serviço externo indisponível, as metas de tempo não mudam |
| SC-008 | `paintMs` não maior que a linha de base |
| SC-009 | Quadros longos na navegação não aumentam |
| SC-010 | Pico de memória não maior que a linha de base |
| SC-011 | Mais capas da primeira tela prontas que na linha de base |

Para o SC-005, com a tela aberta: pedir **Atualizar** na lista e verificar que as fileiras passam a refletir o conteúdo novo
sem sair da tela, com o foco e a rolagem onde estavam.

Para o SC-006: desligar a rede do PC (ou deixar o coletor sem a rota externa) e repetir a abertura.

## 6. Itens transversais da constituição

- **Foco**: nenhuma fileira que entra depois da revelação move o foco ou a rolagem; nenhuma tela aparece sem elemento focável.
- **Segredos**: nenhuma linha do coletor tem URL, credencial ou texto do provedor — só números e rótulos fixos.
- **Dados reais**: o aviso de cobertura parcial continua correto durante a pré-carga; nenhuma fileira inventa item.
- **Testes por task**: o Vitest da área tocada passa a cada task.
- **E2E antes da TV**: `npm run test:e2e` verde antes de T061.
