# Quickstart: Top 10 e Dica produzidos em segundo plano (087)

## 1. Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- `npm run dev` **no ar** para o E2E. Sem ele a suíte dá 4/54 e parece regressão — já custou tempo na feature 086.
- Para a TV: o IP atual, o coletor de métricas de pé e **autorização do usuário para cada instalação**.
- Uma lista real ativa, com catálogo obtido, e a **chave do TMDB configurada** em Ajustes → Integrações. Sem chave as
  fileiras não existem, e não há o que medir.

## 2. Checagens automatizadas (em `tv-web/`)

```powershell
npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx   # 5/5
npx vitest run src/lib/catalog src/features/catalog src/lib/metadata
npm run test
npx tsc -b
npm run lint
npm run build
```

Na raiz, as travas desta feature e das que ela pode quebrar:

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas
```

E2E (use o Bash: no PowerShell o `--` some):

```bash
cd tv-web && npm run test:e2e -- --only top10-dica,carrosseis-filmes-series,vitrine-filmes-series,home-vitrine-expandida
cd tv-web && npm run test:e2e        # gate antes da TV
```

## 3. Conferir sem a TV

No build de desenvolvimento, com a chave configurada e a lista carregada:

1. Abrir Filmes **logo depois** de entrar na lista. As fileiras **Em alta esta semana** e **Dica de filme** podem não
   existir ainda — isso é o esperado (FR-005), não um defeito.
2. Deixar o app quieto por um minuto e voltar a Filmes: as fileiras aparecem, com os cards numerados 1, 2, 3.
3. Com Filmes **aberto**, esperar a fila produzir: a fileira entra **sem** a tela sair e **sem** o foco pular (FR-006).
4. Em Ajustes → Integrações, **remover a chave**: as fileiras somem imediatamente (FR-011).
5. Salvar a chave de novo: as fileiras voltam sem esperar minutos (FR-010).
6. Trocar o idioma do app: as fileiras **continuam** na tela e trocam sozinhas depois (FR-012).

## 4. TV física — medição (T043)

Siga a skill `tizen-sonda`, modo C (app real com o canal de métricas).

**Roteiro de duração fixa** — esta é a lição do SC-009 da feature 086, que ficou sem veredito por comparar amostras de
durações diferentes. Cronometre:

1. Coletor de pé, build de medição instalado (**pedir autorização**), com `deploy-tv.ps1 -SkipBuild` (preserva dados).
2. Entrar na lista e esperar a Início aparecer.
3. **Filmes, exatamente 60 s**: mover o foco entre cards e entre fileiras, e rolar até o fim e voltar.
4. **Séries, exatamente 60 s**: o mesmo.
5. Sair do app, abrir e repetir 2–4 (segunda amostra).

Ler do `.jsonl`:

| Critério | O que olhar | Alvo |
| --- | --- | --- |
| **SC-008** | `assembly` → `revealMs` de `movies` e `series` | continua em **313–380 ms** |
| **SC-007** | `frames` → `over50` e `fps` nas duas janelas de 60 s | quadros longos **não aumentam**; mediana ≥ 38 fps |
| registro | `showcase` → `docMs` | a abertura segue lendo em ~1 ms |

Gravar em `evidencias/medicao-tv-<data>.md`: aparelho, o que foi instalado e desinstalado, a tabela por amostra, a
classificação (**gate** para SC-007/SC-008) e a leitura honesta. **Sem** URL, host, credencial ou nome de item.

**Reinstalar o pacote normal ao final, avisando o usuário** (T044).

## 5. Itens transversais da constituição

- **Foco**: a fileira que entra depois não move o foco nem a rolagem; nenhuma tela aparece sem elemento focável.
- **Segredos**: a chave do TMDB não aparece em registro, log, métrica ou tela. Ler o `.jsonl` antes de gravar a
  evidência.
- **Dados reais**: sem resultado, a fileira **não existe** — nunca esqueleto, nunca "Em breve", nunca item inventado.
- **Honestidade**: `npm run test:e2e` verde antes de pedir a TV; falha reexecutada em série antes de chamar de flake,
  com a taxa registrada.
