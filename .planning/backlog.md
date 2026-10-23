# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

Só o que está **pendente**, na ordem sugerida de execução. O que foi entregue está em `docs/status-features.md`.

- [Infra — publicação Samsung] Ampliar a matriz de modelos Tizen 8.0 (origem: 078, R-001, 2026-10-16): só a TV de referência (Tizen 9.0) tem evidência; `release/samsung/target-matrix.json` só aprova o que tiver evidência por modelo/firmware, então outros alvos dependem de aparelho (ou Remote Test Lab) para testar.
- [Oferta — legendas (090/091)] Aceitação do uso de chave pessoal (BYOK) pelos fornecedores OpenSubtitles e SubDL em app distribuído (gates G-4 da 090 e G-3 da 091): sem código; falta a confirmação/termos dos fornecedores antes de anunciar o recurso. A 091 também deixou o `quickstart.md` sem execução manual completa (B1–B6 e B10–B12 têm cobertura automatizada).
- [Bug] E2E da TV `carrosseis-filmes-series`: sob `E2E_CPU=4` (CPU artificial) duas asserções do início do roteiro ("só as categorias da fonte" e "foco na 1ª fileira (Curto)") falham de forma intermitente, também no baseline sem a correção da 091 (2 de 3); na suíte normal passa 56/56 (origem: bug `e2e-tv-carrosseis-filmes-series-falha-maximum-update`, 2026-10-23). Caminho normal: `sdd-bugfix`.


## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 043-gostei-filmes-series | "Gostei" em filmes e séries | Especificada | N/A | 2026-10-01 |
| 078-prontidao-publicacao-samsung | Prontidão para publicação do app Samsung TV | Em Execução | 64/67 tasks | 2026-10-23 |
| 081-venda-producao-mercadopago | Venda em produção com Mercado Pago | Em Execução | 34/56 tasks | 2026-10-17 |

## Bugs


| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| epg-manual-falha-ao-salvar-epg-02 | EPG manual falha com EPG-02 embora o navegador baixe o XML | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-05 |
| epg-nao-atualiza-depois-primeira-carga | EPG não atualiza depois da primeira carga | Test | failed | Reabrir fase Assess com evidência nova | 2026-10-10 |
| epg-vinculado-recente-mas-guia-vazio | EPG "vinculado, recente" mas guia e "Agora" vazios | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-15 |
| armazenamento-app-cheio-na-tv-impede | Armazenamento do app cheio na TV impede gravar a licença e desvincular | Fix | applied (falta a medição e a confirmação na TV, na fase Test) | Rodar fase Test | 2026-10-17 |
| playwright-portal-licencaspects43-falha-esporadica-renovar | licenca.spec.ts:43 falha esporádica ao esperar "Renovar licença" | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-10-23 |

## Melhorias Ad-hoc

| Data | Área | Resumo |
| --- | --- | --- |
| — | — | Arquivadas em `docs/status-features.md` (ver "Arquivo do backlog — 2026-10-22"). |
