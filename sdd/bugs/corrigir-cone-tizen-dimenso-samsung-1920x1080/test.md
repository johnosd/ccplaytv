# Bug Test: Assets do ícone Samsung

- **Slug**: corrigir-cone-tizen-dimenso-samsung-1920x1080
- **Testado**: 2026-10-16
- **Fix**: ./fix.md
- **Result**: verified

## Reproduction Re-run

O conjunto de assets de publicação agora existe e foi validado diretamente no
filesystem. O ícone interno `CCPlayTv/icon.png` continua separado e preservado.

## Checks

| Checagem | Resultado |
| --- | --- |
| `logo_1920x1080.png` | PASS — 1920×1080, RGBA, 109507 bytes |
| `fundo_1920x1080.jpg` | PASS — 1920×1080, RGB, 34777 bytes |
| `icone_512x423.png` | PASS — 512×423, RGB, 14488 bytes |
| `CCPlayTv/icon.png` | PASS — 117×117, sem alteração |
| Inspeção visual dos três assets | PASS — identidade legível e área segura |
| `npm.cmd run build` em `tv-web/` | PASS — TypeScript, Vite e guard de demux |

## Verdict

`verified`: os assets locais atendem às dimensões e limites documentados pela
Samsung. O upload e a prévia no Seller Office ainda não foram executados.

## Recommendation

Fechar o bug de repositório. Antes da submissão, enviar os três arquivos ao
Seller Office e conferir a prévia; isso é uma validação externa, não reproduzida
localmente.
