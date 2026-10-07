# Research: feature 065

## Decisões verificadas na exploração

### 1. Categoria extensa e compatibilidade do armazenamento

**Decisão**: manter categoryBlocks e linhas legadas como catálogo canônico e adicionar projeções de leitura reconstruíveis em partes de até 240 itens, atrás da fachada catalogRepository. Não substituir o contrato público dos blocos nesta feature.

**Justificativa**: IndexedDB desserializa o objeto inteiro de categoryBlocks.get; aplicar slice depois não atende FR-016. Os contratos da 039 exigem ids estáveis, nenhum canal/filme/série em channels após conversão e leitura dos dois formatos. Uma projeção compacta evita reler o objeto completo e não exige redefinir esses contratos.

**Alternativas consideradas**: só limitar DOM/páginas (não limita leitura); dividir o formato canônico agora (amplia a migração e altera consumidores/contratos); duplicar todos os CatalogRecord com URLs/headers (custo de quota e superfície secreta desnecessários). A projeção guarda apenas campos da listagem. Conversão inicial e custo de escrita extra são medidos separadamente, sem escondê-los no aquecimento.

### 2. Redução de trabalho na seleção

**Decisão**: otimizar o algoritmo puro vigente por top-K estável e fast paths comprovados da normalização; adicionar variante cooperativa, sem introduzir biblioteca ou novo Worker de seleção. Vitrines consomem resultados pequenos obtidos em varredura por categoria, não o SearchIndex completo.

**Justificativa**: recent pool = 36, escolha = até 12; ordenar todos é dispensável. O mapa de deduplicação ainda precisa enxergar todos os elegíveis para manter o contador exato e o vencedor em empate. Pausar entre lotes diminui bloqueio, mas não basta para o ganho de CPU de SC-003.

**Alternativas consideradas**: amostrar/parar ao achar 12 (muda seleção); usar só top-36 por categoria antes da deduplicação global (pode perder candidatos); mover todo o catálogo para Worker via postMessage (duplica dados e só desloca custo). A equivalência e as metas permanecem gates: nenhum ganho foi prometido sem medição.

### 3. Transporte e pausa de serviço

**Decisão**: deadline por requisição de 10 s incluindo leitura do corpo; AbortController próprio + corrida com deadline para colaboradores que ignorem signal; tentativa compartilhada com leases e contexto opaco. Cache externo só é publicado com todas as páginas válidas.

**Justificativa**: a consulta atual não recebe signal; as páginas 2..8 são best-effort. RATE_LIMIT_PAUSE_MS encontrado no código é **10 minutos**, não 60 segundos. Preservar esse fallback (satisfaz o mínimo da spec), respeitar Retry-After válido e impedir sucesso concorrente de apagar pausa ativa.

**Alternativas consideradas**: timeout só até headers (não cobre corpo); abortar por qualquer consumidor (interrompe o outro); tratar rejeição de página como sucesso parcial (falso freshness). Não usar a chave crua em query keys, logs ou mensagens entre contextos.

### 4. Abertura e origem local

**Decisão**: code splitting por rotas com módulos locais de nomes estáveis e fallback focável; splash atrelado à prontidão de fontes/perfis, sem pular a escolha de lista.

**Justificativa**: App importa todas as telas antecipadamente; Vite já emite nomes fixos, base ./ e alvo chrome108; sync-tizen recusa arquivos fora do YAML. O pacote atual usa script type=module. Validar o grafo efetivamente emitido e caminhos locais, sem relaxar CORS/CSP para obter aceite.

**Alternativas consideradas**: CDN/ponte para código do app (contraria disponibilidade local); prefetch de rota disparado pelo foco (proibido); importar tudo durante o splash (elimina ganho inicial). Preaquecer módulos locais após a primeira tela, por ociosidade/contexto, é permitido se não piorar a interação nem disparar APIs externas.

## Incertezas a resolver na execução

- Percentuais de CPU, heap e primeira visita são metas a demonstrar; T001–T004 criam baseline pareada antes de qualquer mudança de comportamento.
- Escrita/conversão da projeção e índices de resumo têm custo de disco/quota; medir importação/carga de categoria além das telas. Falha de projeção não pode apagar catálogo/estado.
- Execução real em file:// Tizen continua validação recomendada. Inspeção do pacote e navegador validam recursos/fluxos, não provam engine física, memória total ou AVPlay.
