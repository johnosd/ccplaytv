# Assessment Decision: Cota de armazenamento do app na TV estourando

- **Slug**: cota-armazenamento-app-na-tv-estourando
- **Decidido**: 2026-10-17
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Medido na TV: "82,1 MB de 80 MB", com 1,27 GB livres. Houve 3 bugs reais: licença, desvincular e séries/favoritos. |
| Força da evidência | adequate | Cota, volume das listagens (28 MB) e do EPG (15 MB) estão medidos. Falta a ocupação **por tabela** no IndexedDB, que é a 1ª tarefa. O efeito do `wgt-private` sobre a cota é ASSUMPTION, e por isso entra como spike, não como entrega. |
| Valor vs. custo de inação | strong | Sem isso, a loja recebe um app que bate no teto com uma lista. O bugfix só contorna. |
| Viabilidade / apetite | adequate | Encolher o formato e limitar o cache à lista ativa são mudanças locais em `lib/catalog` (fachada `catalogRepository`) e podem ser medidas no PC. O spike do Filesystem é curto, mas só prova algo na TV física, e o usuário autorizou com aviso. A migração completa ficou de fora. |
| Fit estratégico | strong | O usuário quer isso **antes da publicação** (078). Respeita o ADR-011 (lista ativa única), o ADR-002 (cobertura parcial normal) e o ADR-008 (sem backend). |

## Mais espaço: prós e contras

O usuário pediu esta comparação. "Mais espaço" só é possível pelo **Filesystem do Tizen** (`wgt-private`): a cota do
IndexedDB não sobe com `unlimitedstorage` e não há Quota Management API.

| | Prós | Contras |
| --- | --- | --- |
| **Ficar no IndexedDB (80 MB) e encolher** | Sem ADR novo nem privilégio novo. O pacote da loja (078) não muda. Testável no PC e no jsdom. Mantém transação e índices do Dexie. | Teto fixo: uma lista enorme (M3U de 78 MB, 300 mil filmes) não cabe com cache completo. Exige um orçamento rígido e o cache só da lista ativa. |
| **Filesystem `wgt-private` (mais espaço)** | Recomendado pela própria Samsung para dados acima de 5 MB. ASSUMPTION: o limite passa a ser o disco (~1,2 GB livres na TV de referência), não 80 MB. Caberiam várias listas cheias e M3U grande. | Precisa de ADR (o IndexedDB é a fonte da verdade, ADR-002/008). Sem transação nem índice, exige um formato próprio e gravação atômica (temporário + renomear). Não existe no PC nem no jsdom, então precisa de um adaptador duplo, como o `PlayerService`, e a paridade só é provada na TV física. Exige 2 privilégios novos (públicos) e revalidar o gate da 078. A consistência entre o IndexedDB (categorias) e os arquivos (itens) vira um risco novo. Espaço do disco é compartilhado com o sistema: encher a TV é pior que encher a cota. |

Conclusão: encolher resolve o cenário pedido (lista ativa grande + outras). O spike descobre, com dados, se vale pagar
o custo do Filesystem para ir além disso.

## Abordagens Candidatas

### A. Orçamento + formato enxuto no IndexedDB, com spike do Filesystem

1. Medir a ocupação por tabela, no PC com a lista real e na TV, pela linha de Sobre & créditos e por um diagnóstico.
2. Cache completo só da lista ativa. As outras listas guardam a estrutura e recarregam ao ativar.
3. Encolher o formato, na ordem que a medição indicar:
   - URL de reprodução montada na hora a partir da fonte, sem gravar credencial por item;
   - compressão dos blocos num Worker;
   - EPG numa janela de tempo.
4. Spike isolado na TV: gravar e ler ~150 MB em `wgt-private`, e medir a cota e o tempo.
5. **Recomendada**: sim. Atende a meta escolhida com risco baixo, e transforma a ASSUMPTION do Filesystem em dado antes
   de qualquer ADR.

### B. Migrar o catálogo para o Filesystem `wgt-private`

- Os blocos e o EPG passam a ser arquivos. O IndexedDB fica só com estrutura e estado da pessoa.
- **Recomendada**: não agora. Depende da ASSUMPTION não verificada, exige um ADR e é a maior mudança de arquitetura
  desde a 039. Volta a ser candidata se o spike de A der positivo **e** a medição mostrar que A não basta.

### C. Só a pré-carga restrita (`PREFETCH_SCOPE = 'neighborhood'`)

- Usa o recuo previsto na 038/FR-014.
- **Recomendada**: não sozinha. Reduz o volume, mas não cria orçamento nem resolve o EPG e as várias listas. Pode
  entrar como alavanca dentro de A, se a medição pedir.

### D. Híbrido: o volume vai para arquivo e o banco continua (ideia do usuário, 2026-10-17)

- O **IndexedDB continua sendo o banco do app** e guarda:
  - fontes e categorias (com ordem, ocultas e bloqueadas);
  - geração e manifesto de cada categoria;
  - todo o estado da pessoa;
  - licença e pareamento.
- O **volume grande** vai para arquivos em `wgt-private`:
  - o conteúdo da lista baixada (hoje `storedEntries` no M3U);
  - os itens de cada categoria (hoje `categoryBlocks`);
  - talvez o EPG.
- Ele combina com o que já existe:
  - desde a 039, os itens de uma categoria já são **um bloco lido e gravado inteiro**, e um bloco vira um arquivo por
    categoria (`<lista>/<geração>/<categoria>`) sem precisar de índice;
  - a 014 já separa o M3U em partes por categoria;
  - cobertura parcial já é o estado normal (ADR-002). Se um arquivo faltar ou estiver corrompido, a categoria passa a
    "não obtida" e volta a ser obtida quando a pessoa entra nela.

  Isso reduz bastante o principal contra da abordagem B: não é preciso transação nem índice próprios.
- **Contras que continuam**:
  - adaptador duplo: arquivo na TV e IndexedDB no PC e nos testes, atrás da fachada `catalogRepository`;
  - paridade provada só na TV física;
  - 2 privilégios novos e revalidação do gate da 078;
  - gravação atômica do arquivo (temporário e renomear);
  - limpar arquivos de gerações antigas e de listas removidas;
  - o arquivo também guarda credencial (URL por item), então exige **emendar o ADR-010**, que hoje diz "no aparelho
    (IndexedDB)", e a constitution: nunca logar nem exportar, e apagar com a lista.
- **Recomendada**: é a candidata "mais espaço" no lugar de B, **condicionada ao spike**. O spike passa a testar
  exatamente o formato do híbrido:
  - gravar e ler cerca de 150 MB em arquivos por categoria em `wgt-private`;
  - medir se a cota do IndexedDB fica intocada;
  - medir o tempo de ler uma categoria grande, comparado com o bloco atual.

  Se o spike der positivo, o híbrido vira ADR (emenda ao ADR-002/008/010) e uma fase própria. O usuário prefere manter
  o banco atual como base, então o encolhimento (A) vem primeiro de qualquer forma.

#### Portão do híbrido (decisão do usuário, 2026-10-17)

O usuário decidiu: **"só implementar a parte híbrida se realmente tiver uma grande evolução para o app"**. O padrão é
**não implementar**. O híbrido só vira ADR e implementação quando **todos** os itens abaixo forem verdadeiros, medidos e
registrados. Os limites são provisórios e o usuário pode ajustá-los no `sdd-specify`.

1. **A não basta**: depois do encolhimento, a medição na TV mostra pelo menos um destes casos:
   - a lista real ativa (com pré-carga e EPG) passa de 60 % da cota;
   - um caso que o usuário quer suportar não cabe, como uma 2ª lista completa ou um M3U grande guardado.
2. **Ganho grande de espaço**: o spike mostra que `wgt-private` fica **fora** da cota do IndexedDB e que dá para usar
   pelo menos **5×** a cota atual (≥ 400 MB) sem erro.
3. **Sem piora perceptível**: ler uma categoria grande do arquivo leva no máximo 1,5× o tempo do bloco atual na TV,
   e a navegação não trava (constitution: foco nunca trava).
4. **Custo aceito**: o usuário confirma, com os números na mão, que o ganho compensa:
   - privilégios novos;
   - revalidação da 078;
   - adaptador duplo;
   - emenda do ADR-010.

Se algum item falhar, o híbrido é **descartado**, com o motivo e os números registrados no `plan.md` da feature. Esse é um
resultado válido, não um fracasso. O spike é descartável: o código dele não entra no app.

## Veredito

### Resultado do portão (082)

O portão do híbrido foi reavaliado com as sondas de 2026-10-18. A quota de referência permanece em 80 MiB e não há
alavanca para aumentá-la. O formato comprimido em pedaços reduziu o uso observado no PC de 7.933.418 para 4.451.556
bytes na rodada com CPU 4×, sem erro de quota. O spike de `wgt-private` foi cerca de 3× mais lento na leitura e gravou
a aproximadamente 0,8 MB/s, portanto falhou no critério de desempenho máximo de 1,5×. O híbrido fica descartado para a
082; não há emenda de ADR nem privilégio novo.

**go**: o problema é válido e medido, todos os critérios centrais estão em `adequate` ou acima, e o usuário escolheu a
meta, o caminho, a autorização do spike e a prioridade.

- O ponto fraco é a falta da ocupação **por tabela**, e o primeiro passo da feature é medi-la.
- A hipótese do Filesystem continua **unknown** de propósito. Ela entra no escopo como spike com resultado registrado,
  nunca como entrega garantida.

### Se go — Handoff

- **Problema**: a cota do IndexedDB na TV é ~80 MB, não sobe com `unlimitedstorage`, e uma lista grande já ocupa boa
  parte dela. Ao estourar, até licença e favoritos falham. O bugfix `armazenamento-app-cheio-na-tv-impede` só contorna.
- **Abordagem recomendada**: A, nesta ordem:
  1. medição por tabela;
  2. cache completo só da lista ativa;
  3. formato enxuto (URL derivada, compressão em Worker, EPG em janela), escolhido pela medição;
  4. spike na TV de `wgt-private` no formato do híbrido D, com um arquivo por categoria, mantendo o banco (instalação
     com aviso e permissão). Se o resultado for positivo, o híbrido vira ADR e uma fase ou feature própria.
- **Escopo sugerido**:
  - **Entra**: medição, orçamento e limpeza das listas não ativas, formato enxuto e spike com relatório. O uso e a cota
    em Sobre & créditos já existem.
  - **Não entra**: migração para o Filesystem (vira ADR e feature próprios se o spike der positivo), tela de gerenciar
    armazenamento, apagar estado da pessoa, backend.
- **Métricas de sucesso**:
  - lista real ativa com pré-carga e EPG em ≤ 60 % da cota na TV;
  - zero `QuotaExceededError` no roteiro de uso com 3 listas;
  - emergência do bugfix não acionada;
  - redução medida por tabela;
  - spike com resultado registrado.
- **Perguntas em aberto pro sdd-specify**:
  - Ao ativar uma lista que perdeu o cache, a recarga é automática (pré-carga) ou só sob demanda? Qual estado/progresso
    real a tela mostra?
  - Qual janela de EPG basta, e ela mantém o guia coerente com "Progresso e capacidades são reais"?
  - A compressão roda sempre num Worker? Qual é o custo aceito de abrir "Todos" (leitura progressiva da 039)?
  - Migrar o formato gravado: converter em segundo plano (como a 039) ou recarregar?
  - A URL derivada vale para M3U ou só para Xtream? No M3U cada item tem uma URL arbitrária.
  - A medição por tabela entra no diagnóstico da 062 ou fica só em Sobre & créditos?
