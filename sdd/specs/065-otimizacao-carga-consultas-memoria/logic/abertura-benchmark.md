# Abertura e benchmark: feature 065

## Abertura

Perfis permanece a primeira tela após splash, com última lista focada (ADR-011), inclusive quando só houver uma lista. Sem listas, Adicionar lista permanece o caminho principal. Prontidão = fontes locais consultadas com estado terminal (sucesso/vazio/erro), idioma/movimento aplicados e módulo de perfis disponível; não depende de TMDB, EPG, prefetch completo nem rede.

Splash mantém identidade e pelo menos uma ação focável para RETURN/recuperação enquanto espera. Passar estado ready em vez do timer fixo. Para evitar salto sem quadro, uma oportunidade de quadro da marca é suficiente; não inventar nova duração mínima. Erro local transita para recuperação focável sem expor stack/URL.

routeModules.ts descreve imports locais por rota e aquecimento por ociosidade; App mantém redutor/ordem dos efeitos e callbacks. Shell, splash/perfis e componentes de recuperação ficam iniciais; detalhes/settings/live/VOD/search são candidatos a módulos próprios. Evitar importação estática indireta que reconecte esses módulos ao entrypoint, inclusive barrels de importApi/catalogApi.

RouteBoundary.tsx cobre carregamento/falha com useRemoteNav, Spinner/ErrorState e textos existentes ou novas chaves pt/en/es. Não capturar RETURN duas vezes: apenas a camada ativa escuta. Recriar a lazy promise ao tentar novamente; não repetir a mesma promise rejeitada eternamente. Troca de contexto/rota antiga não toma foco. Recuperar o destino anterior e foco por id.

Nomes estáveis e caminhos relativos; todo chunk/asset/Worker emitido entra em CCPlayTv/tizen_web_project.yaml. Não relaxar CSP/CORS ou incluir demuxer de desenvolvimento. Build:tizen é sync, não instalação: não acionar deploy/emulador neste planejamento.

## Baseline e comparação

T001–T004 vêm antes da implementação. Runners do review são ponto de partida, **não** baseline de aceite: 3 amostras, CPU4, sem imagens/histórico/episódios, eventos manuais e uma sobreposição. Salvar nova baseline imutável em tv-web/bench-results/screen-perf-065/baseline/<run-id>/ com fingerprint do conteúdo dos arquivos/dependências de entrada, navegador/máquina/CPU, fixture/semente/relógio, condições e todas as amostras.

No mínimo 7 repetições independentes por configuração, build de produção, nenhum benchmark concorrente. Aquecimento e caches iguais; rede externa bloqueada, endpoints e imagens locais simulados. Não carregar instrumentação DEV no grafo de produção: CDP/automação observa o app; fixture/controladores de preparação são do executor, com servidor loopback dedicado e efêmero.

Candidata executa mesmos comandos/fixture em diretório candidate/<run-id> sem sobrescrever baseline. compare-screen-perf.mjs calcula ganho = 1 - medianaCandidata/medianaBaseline; limite de regressão = medianaCandidata/medianaBaseline - 1. Tarefa longa inexistente vale 0; denominador zero precisa de resultado explícito, sem divisão infinita escondida. Para p95, usar o mesmo número de comandos e publicar definição do quantil. Guardar json bruto e report.md com dispersão e falhas.

## Instrumentação necessária

- Marcar entrada e conteúdo útil/foco pronto com relógio do browser; separar actionability/RPC da automação. DOM/duas RAF são proxy, não pintura física.
- Capturar tarefas longas, get/getAll/cursor, chunks/itens processados e chamadas externas; instrumentação não grava URL com segredo, só aliases de endpoint.
- Para três eventos, usar createPrefetchScheduler com colaboradores de aquisição simulados e gravação real no mesmo IndexedDB/contexto que o app; observar callback real de conclusão e respetiva invalidação. Não chamar invalidateQueries manualmente para representar esse cenário.
- Categorias de 30.000, 100.000 episódios, 1.000 favoritos/5.000 históricos e três listas são fixtures próprias, não todas misturadas artificialmente na medição inicial.
- Medir heap após mesmo fluxo/estabilização/GC; ciclos 3..10 após aquecer todas as listas, cada ciclo de alternância passa pelas três. Relatar Worker/backfill/arte decodificada separadamente do heap principal, sem transformar sumiço da thread principal em economia total.
- Cold: novo contexto/processo/cache derivado em memória vazio; conteúdo persistido semanticamente igual. Distinguir primeira conversão da instalação existente e leituras frias com projeção persistida pronta. Publicar ambos; não excluir custo de migração da abertura/categoria e chamá-la de fria.
- Abertura: performance navigationStart até primeira tela pronta (com/sem lista, frio/quente). Contar JS efetivamente carregado até esse instante por recursos/grafo, sem gzip. Avaliar primeira navegação às demais telas.
- Equivalência coleta ids/ordem/quantidade/contadores/contexto de foco, e compara snapshots/dados sob contrato vigente. Corrigir falso sucesso não exige equivalência ao erro antigo.

Se o harness precisar de uma porta pública de controle, introduzir somente adaptador de teste separado da produção e registrar seu custo. Não editar app para detectar Playwright ou fabricar duração. SC-001..SC-013 são gates; não relaxar meta sem revisão explícita da spec.
