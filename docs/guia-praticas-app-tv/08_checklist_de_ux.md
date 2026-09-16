# 08. Checklist de experiência de uso

**Página pesquisada:** UX Checklist
**Consulta:** 13 de setembro de 2026
**Link fornecido:** https://developer.samsung.com/smarttv/design/ux-checklist.html

> Converter o guideline em verificações rastreáveis sem confundir recomendações de UX com certificação já concluída.

## 1. Síntese com os identificadores oficiais

A Samsung distingue requisitos, cujo descumprimento pode causar rejeição, de recomendações. A síntese preserva os identificadores para facilitar a consulta à redação oficial. [1]

| Itens | Tema resumido |
| --- | --- |
| 1.1–1.2 | Ícones previstos e indicação de rolagem. |
| 1.3–1.4 | Posicionamento navegável; foco organizado em grades. |
| 1.5–1.6 | Moderação tipográfica; padrões de interface consistentes. |
| 1.7–1.8 | Informação dosada e agrupada. |
| 1.9–1.10 | Interações compreensíveis, sem movimentos excessivos. |
| 2.1–2.3 | Teclas coerentes, acesso direcional e comandos de mídia funcionais. |
| 3.1–3.3 | Controles na tela e operação por setas, seleção e teclas de reprodução. |
| 4.1–4.3 | Feedback, foco único e destaque reconhecível. |
| 4.4–4.6 | Foco consistente, progresso e orientação para erros. |

### Como usar esta síntese

Manter a classificação normativa da página original: não transformar todo should em obrigação formal. Para organizar o trabalho interno, é possível priorizar recomendações como bloqueadoras de qualidade, desde que essa decisão seja registrada como critério do projeto, não como nova exigência da Samsung.

### Escopo de validação

Propor três conjuntos: experiência de navegação, tarefas completas de consumo e recuperação de erros. Executar todos com fonte vazia, uma fonte demonstrativa e um catálogo volumoso. A lista oficial não substitui testes específicos do importador, do armazenamento ou dos streams.

## 2. Matriz de aceite aplicada ao projeto

| ID / prioridade | Procedimento | Resultado esperado |
| --- | --- | --- |
| UX01 / P0 | Abrir instalação limpa. | Usar o app sem criar conta própria; Adicionar fonte está disponível. |
| UX02 / P0 | Importar lista válida e inválida. | Exibir etapas, resultado e recuperação sem travamento. |
| UX03 / P0 | Percorrer todas as áreas. | Nenhuma ação essencial depende de mouse ou celular. |
| UX04 / P0 | Abrir diálogo e retornar. | Foco retorna a uma posição previsível, sem duas camadas ativas. |
| UX05 / P0 | Reproduzir live e VOD. | Controles correspondem às capacidades do item. |
| UX06 / P1 | Buscar e trocar ordenação. | Contexto e origem dos resultados continuam compreensíveis. |
| UX07 / P1 | Favoritar e reabrir o app. | Estado local persiste sem misturar fontes. |
| UX08 / P1 | Marcar filme e episódio. | Indicadores de histórico são coerentes e corrigíveis. |
| UX09 / P0 | Retirar rede e voltar. | Ações de recuperação não causam foco perdido ou tela bloqueada. |
| UX10 / P1 | Testar nomes e capas ausentes. | Os cards permanecem navegáveis e identificáveis. |

### Interpretação das prioridades

P0 significa bloqueador interno da versão: falha que impede uso central ou recuperação. P1 significa requisito de qualidade importante para a experiência prevista. P2, utilizado nos demais documentos, representa evolução opcional. Essas prioridades são propostas do projeto, não categorias oficiais de certificação.

### Não marcar aprovação sem evidência

Registrar para cada teste: responsável, aparelho, firmware, versão, dados utilizados, resultado e evidência. Um teste não executado fica A testar. Usar Não aplicável somente com justificativa explícita, por exemplo casting fora do escopo aprovado.

## 3. Roteiro de execução e registro

### Percurso de referência

Instalar, abrir sem fonte, configurar conteúdo demonstrativo, entrar em canais, reproduzir, voltar, buscar filme, favoritar, assistir parcialmente, reabrir, continuar e remover a fonte. Executar novamente com falha de rede e dados incompletos. Esse percurso conecta vários critérios sem depender de verificações isoladas.

| Registro | Informação a preencher |
| --- | --- |
| Ambiente | Modelo, firmware, resolução da UI e tipo de controle. |
| Versão | Identificador do pacote e versão do conjunto de dados. |
| Caso | ID, pré-condições e sequência exata de comandos. |
| Resultado | A testar, aprovado, reprovado ou não aplicável com justificativa. |
| Evidência | Vídeo, captura, log sanitizado ou descrição reproduzível. |
| Correção | Defeito associado e versão em que será revalidado. |

### Cobertura complementar

Usar o documento 10 para pacote e submissão, o 06 para player e o 12 para riscos técnicos. Não concluir que uma interface utilizável está pronta para a loja sem verificar permissões, publicação, acesso de teste e funcionamento nas TVs selecionadas.

## 4. Fontes e escopo da pesquisa

[1] **Samsung Developer — UX Checklist** — Itens 1.1 a 4.6 e distinção entre requisitos e recomendações.  
https://developer.samsung.com/smarttv/design/ux-checklist.html


Consulta: 13 de setembro de 2026. As recomendações e os critérios de aceite deste relatório não substituem as exigências de revisão vigentes no Seller Office.
