# Bug Verification: Favorito de canal segurando OK

- **Slug**: falha-ao-salvar-favorito-canal-segurando
- **Testado**: 2026-10-11
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O equivalente automatizado reproduziu o aviso antes da correção e passou depois. E2E confirmou persistência, estrela e navegação. Pacote instalado e lançado na TV, mas a condição específica do aparelho ainda depende de confirmação do usuário; relato posterior de quota pode representar outra causa da falha original.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução antes do fix | Vitest, filtro `cache de séries indisponível` | fail esperado | Renderizou “Não foi possível salvar o favorito.” |
| Reprodução após fix e regressão próxima | Vitest, arquivo `LiveScreen.favorites.test.tsx`, filtros documentados no fix | pass | 4 testes; 16 ignorados por filtro. |
| Persistência e controle remoto | `node e2e/favoritos.mjs` | pass | Segurar OK, OK curto, RETURN, reload, desfavoritar, filmes e séries. |
| Lint dirigido | Oxlint nos arquivos alterados | pass | Nenhuma mensagem de erro. |
| Type-check/build | `npm.cmd run build:tizen` | pass | `tsc -b`, Vite, guard demux e sync Tizen. |
| Instalação física | `deploy-tv.ps1 -TvIp 192.168.0.2 -SkipBuild` | pass | Mesmo perfil Samsung, sem desinstalar; instalação e lançamento confirmados. |
| Favoritar na TV após instalação | Usuário | not-run | Aguardando observação física. |
| Suíte completa | Não executada | skipped | Pedido explícito do usuário. |

## Output Excerpts

`Tests 4 passed`; `Todas as verificações passaram.`; `install completed`; `successfully launched pid = 13916`.

## Residual Risks

- Não foi capturada a exceção interna dos favoritos no aparelho.
- Falha real de quota continua exigindo correção da quota; dispensar o cache não oculta erro de gravação.

## Recommendation

Manter partial até o usuário confirmar favorito na TV com a lista importada. Não limpar dados para tentar reproduzir.

## Confirmação na TV — 2026-10-11

Após confirmar categorias e séries, o usuário confirmou também: “favoritos estao corretos tbm”. O fluxo de favoritos na TV fica verificado por observação do usuário após a instalação. Resultado atualizado de `partial` para `verified`; recomendação atual: fechar o bug. As seções anteriores preservam a situação antes dessa confirmação, sem atribuir uma exceção interna específica ao aparelho.
