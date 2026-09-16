# Revisão das ADRs e do README — CCPlay TV

Data: 2026-09-13.

## Base e alcance

Revisão dos quatro arquivos enviados, considerando as decisões da conversa: frontend React/TypeScript, backend Python/FastAPI e uso de uv confirmado pelo desenvolvedor. As correções de afirmações técnicas foram conferidas nas fontes oficiais indicadas nas respectivas ADRs.

Foram preservados os números, os nomes dos arquivos e a organização principal das ADRs. A ADR-001 apresenta a arquitetura vigente; a ADR-003 preserva o histórico da substituição de Node.js/Fastify, sem declarar toda a ADR-001 obsoleta.

Não foram fornecidos arquivos de código, configurações reais do ambiente, modelo da TV ou resultados de execução. Portanto, esta revisão não certifica instalações, compatibilidade ou funcionalidades implementadas.

## Alterações por documento

| Documento | Ajustes principais |
| --- | --- |
| ADR-001 | Aplicativo descrito como web empacotado para Tizen; backend vigente consolidado em Python/FastAPI/uv; AVPlay como opção principal, sem descartar genericamente HTML5; comandos locais separados do transporte remoto; voz e desempenho sem garantias não verificadas. |
| ADR-002 | Cache do catálogo separado de download de mídia; queda do backend separada de perda de internet; cache de capas explicado; limites de armazenamento e primeira abertura tratados; sincronização segura descrita como diretriz; Dexie/Service Workers sem adoção presumida. |
| ADR-003 | uv incorporado; removida a justificativa de superioridade universal de Python para strings ou OpenAI; Pydantic estrito distinguido de normalização; processamento pesado separado de concorrência; ORM, fila e escalabilidade mantidos em aberto. |
| README | Escopo planejado separado de funcionalidades comprovadas; comandos ajustados para uv; migração opcional de requirements documentada; YouTube, TV local, IMDb e Google preservados como itens ainda sem definição técnica. |

## O que está decidido e o que continua em aberto

As escolhas já registradas — React/TypeScript, AVPlay, backend Python/FastAPI, uso de uv, PostgreSQL como banco-alvo e resiliência do catálogo — foram mantidas.

O fluxo gerenciado por pyproject/lockfile e os cuidados de sincronização são recomendações operacionais explicitadas nesta revisão, não descrições comprovadas do repositório atual. As ADRs continuam sem fixar ORM, ferramenta de fila, hospedagem definitiva, versão mínima da TV, origem efetiva do áudio ou modelo de transcrição.

As metas de fluidez continuam metas. Não foi atribuído a React, Python ou uv um resultado de desempenho que não foi medido.

## Aplicação dos arquivos

Substitua os documentos correspondentes no repositório e preserve o histórico anterior no controle de versão. Os quatro nomes originais foram mantidos. Os links relativos do README pressupõem que as ADRs estejam na mesma pasta; ajuste-os caso seu repositório utilize uma subpasta de documentação.

Nenhum comando de instalação, migração de dependências ou alteração da aplicação foi executado no ambiente do desenvolvedor. O pacote contém somente documentação revisada; este arquivo de revisão é complementar.
