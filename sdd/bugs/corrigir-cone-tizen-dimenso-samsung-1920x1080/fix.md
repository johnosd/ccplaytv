# Bug Fix: Assets do ícone Samsung

- **Slug**: corrigir-cone-tizen-dimenso-samsung-1920x1080
- **Corrigido**: 2026-10-16
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Foram gerados os três assets de identidade exigidos para o cadastro do app no
Seller Office Samsung, mantendo separado o ícone interno do pacote Tizen.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `docs/guia-praticas-app-tv/assets/logo_1920x1080.png` | added | Logo RGBA, 1920×1080, abaixo de 300 KB |
| `docs/guia-praticas-app-tv/assets/fundo_1920x1080.jpg` | added | Fundo RGB/JPG, 1920×1080, abaixo de 300 KB |
| `docs/guia-praticas-app-tv/assets/icone_512x423.png` | added | Logo RGB, 512×423, abaixo de 300 KB |
| `docs/guia-praticas-app-tv/02_icones_e_screenshots.md` | modified | Registra os assets produzidos e as capturas ainda pendentes |
| `reports/samsung-ux-checklist-review-2026-10-16.md` | modified | Corrige a distinção entre asset de loja e ícone interno |

## Tests Added or Updated

- Nenhum teste de aplicação foi necessário; a mudança é exclusivamente de
  material de publicação.

## Local Verification

- `logo_1920x1080.png` → 1920×1080, `Format32bppArgb`, 109507 bytes.
- `fundo_1920x1080.jpg` → 1920×1080, `Format24bppRgb`, 34777 bytes.
- `icone_512x423.png` → 512×423, `Format24bppRgb`, 14488 bytes.
- `CCPlayTv/icon.png` → 117×117, preservado sem alteração.
- As três imagens foram inspecionadas visualmente; o logo mantém área segura e
  fundo separado.

## Deviations from Assessment

- O assessment previa produzir os assets e manter o pacote intacto; nenhuma
  divergência.

## Follow-ups

- Fazer o upload e conferir a prévia no Seller Office.
- Produzir as quatro capturas JPG exigidas quando o material de publicação for
  finalizado.
