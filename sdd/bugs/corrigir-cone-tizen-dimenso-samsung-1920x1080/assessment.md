# Bug Assessment: Assets do ícone Samsung ausentes

- **Slug**: corrigir-cone-tizen-dimenso-samsung-1920x1080
- **Criado**: 2026-10-16
- **Origem**: revisão UX Samsung solicitada pelo usuário e documentação oficial
- **Veredito**: valid
- **Severidade**: high

## Report

O relatório SUX-01 apontou que `CCPlayTv/icon.png` mede 117×117 px, enquanto a
documentação Samsung lista assets do Seller Office em 1920×1080 e 512×423 px.

## Symptom

O repositório não contém os assets de apresentação exigidos para o cadastro no
Seller Office. O arquivo de 117×117 px é o ícone interno referenciado pelo
`config.xml`, e não deve ser confundido com os assets de publicação.

## Reproduction

1. Ler `CCPlayTv/config.xml` e confirmar `<icon src="icon.png">`.
2. Medir `CCPlayTv/icon.png` e obter 117×117 px.
3. Consultar o guia Samsung de ícones e confirmar os dois conjuntos: logo e
   fundo em 1920×1080, além do logo em 512×423.
4. Procurar esses assets no repositório e confirmar que não estão disponíveis.

## Suspected Code Paths

- `CCPlayTv/config.xml` — referencia o ícone interno do pacote Tizen.
- `CCPlayTv/icon.png` — asset interno existente, 117×117 px.
- `docs/guia-praticas-app-tv/02_icones_e_screenshots.md` — define os nomes e
  formatos esperados para os materiais do Seller Office.

## Root Cause Hypothesis

Os materiais de apresentação do Seller Office nunca foram exportados para o
repositório; a auditoria inicial também confundiu o ícone interno do pacote
com o logo de publicação. Confiança: high.

## Proposed Remediation

**Preferida**: gerar assets de publicação derivados da identidade visual atual,
em `docs/guia-praticas-app-tv/assets/`, sem alterar `CCPlayTv/icon.png` nem o
`config.xml`.

**Alternativas**:
- Substituir o ícone interno por uma imagem 1920×1080 — rejeitada, pois mistura
  o formato do Seller Office com o metadata do pacote Tizen.

**Files likely to change**:
- `docs/guia-praticas-app-tv/assets/logo_1920x1080.png`
- `docs/guia-praticas-app-tv/assets/fundo_1920x1080.jpg`
- `docs/guia-praticas-app-tv/assets/icone_512x423.png`
- `reports/samsung-ux-checklist-review-2026-10-16.md`

**Tests to add or update**:
- Medir dimensões, formato de cor, DPI e tamanho dos três arquivos.
- Confirmar que o ícone interno do pacote permanece 117×117 px e inalterado.

## Risks & Considerations

- Os arquivos são materiais de cadastro, não artefatos emitidos pelo build
  Tizen; não devem ser adicionados ao `tizen_web_project.yaml`.
- A prévia e a aceitação final ainda dependem do upload no Seller Office.

## Open Questions

- Nenhuma para o ajuste solicitado.
