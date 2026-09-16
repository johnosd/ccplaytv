<!--
Relatório de Impacto de Sincronização
- Mudança de versão: (nenhuma) -> 1.0.0
- Princípios modificados: N/A (criação inicial)
- Seções adicionadas: Princípios Fundamentais (8), Restrições do Projeto, Fluxo de Desenvolvimento, Governança
- Seções removidas: nenhuma
- Pendências: nenhuma
-->

# Constitution do CCPlay TV

## Princípios Fundamentais

### Sem Conta Obrigatória

O aplicativo DEVE abrir e permitir uso básico (navegar interface, configurar
fontes) sem exigir login de pessoa. Uma fonte de conteúdo (URL M3U, arquivo
ou credenciais de provedor) NÃO DEVE ser tratada como conta do CCPlay.
Indisponibilidade ou expiração de uma credencial de fonte NÃO DEVE bloquear
a abertura da interface nem o acesso ao estado local já sincronizado.

**Por quê**: RF-001/RF-002; ADR-004 §1.

### Segredos Fora dos Clientes e dos Logs

Chaves de OpenAI/TMDB, senha de provedor e URL completa de uma fonte NÃO
DEVEM aparecer no pacote Tizen, no futuro app Android, em variáveis
públicas do frontend, em logs, ou em telas/cards visíveis da interface
comum (ex.: home compartilhada). Erros DEVEM ser sanitizados antes de
exibidos.

**Por quê**: ADR-001 §4; ADR-004 §7; docs/guia-praticas-app-tv/01
(critério D05 — "nenhuma credencial aparece em cards, avisos ou histórico
visível").

### Categorias da Fonte São Preservadas

Grupos/categorias declarados pela fonte original NÃO DEVEM ser substituídos
silenciosamente por gênero, categoria ou taxonomia externa (ex.: gênero
TMDB). Enriquecimento externo é aditivo (filtro complementar), nunca
substitutivo.

**Por quê**: ADR-005 §1; docs/guia-praticas-app-tv/12 ("preservar grupos
declarados pela fonte").

### IA e Classificação Nunca Inventam Dados

Quando a evidência for insuficiente para classificar um item, associar um
título externo, ou recomendar algo, o sistema DEVE declarar o estado como
incerto/não classificado/sem dado, e NUNCA preencher a lacuna com uma
suposição apresentada como fato (ex.: nota IMDb inventada, trailer de outro
título, hierarquia de série fictícia).

**Por quê**: RF-016, RF-017; ADR-001 §4; ADR-005 §2/§5/§6.

### Comandos Locais Independem de Rede, Backend ou IA

Ações originadas na própria TV — mover foco, Voltar, play/pause/seek/volume
de uma mídia já em reprodução — DEVEM executar localmente, sem esperar
resposta do backend, WebSocket ou OpenAI.

**Por quê**: ADR-001 §5; ADR-002 §4.

### Trailers e Metadados Não Alteram o Estado Principal da Obra

Consultar, abrir ou assistir um trailer, ou consultar metadados/nota
externa, NÃO DEVE marcar a obra como assistida, alterar progresso de
episódio/filme, nem marcar "Gostei" ou favorito automaticamente.

**Por quê**: ESPECIFICACAO-TRAILERS.md (TR-07); ADR-006 §4.8.

### Toda Ação Essencial Tem Caminho Completo por Controle Remoto

Nenhuma função essencial (navegar, buscar, favoritar, assistir, adicionar
fonte, cancelar importação) DEVE depender exclusivamente de mouse, touch,
voz ou de um celular pareado. Setas + SELECT + RETURN DEVEM alcançar toda
ação essencial; RETURN DEVE fechar primeiro a camada/diálogo aberto antes
de sair da tela ou encerrar o app.

**Por quê**: docs/guia-praticas-app-tv/03 (Input Methods) e /08 (UX
Checklist, item UX03); ADR-001 (controle remoto como meio primário).

### Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming

O importador DEVE reconhecer a diferença entre uma playlist de catálogo e
um manifesto de streaming (ex.: HLS/master playlist). A extensão do
arquivo ou da URL, isoladamente, NÃO DEVE decidir se uma entrada é um
canal, filme, série ou um segmento técnico de streaming.

**Por quê**: RF-011; ADR-005 §2; docs/guia-praticas-app-tv/12 (RFC 8216 —
playlists de mídia vs. master playlists).

## Restrições do Projeto

**Plataforma-alvo**: Samsung QN50Q60DAGXZD (referência de engine: Tizen 8.0
/ Chromium 108). Nenhuma outra TV, geração ou firmware é presumida
compatível sem validação própria (ADR-006 E1).

**Reprodução**: Direct Play é o padrão — o vídeo flui da origem indicada
pela fonte direto para a TV, sem proxy ou transcodificação pelo backend.
Mudar isso exige decisão posterior baseada em necessidade comprovada, custo
e permissão da fonte (ADR-001 §2).

**Ambiente de execução do backend**: roda localmente no computador do
desenvolvedor por ora. Migração para VPS é evolução planejada, não
implementada — não presumir TLS, backup/restore ou infraestrutura de
produção já resolvidos (ADR-006 E4, Incremento E).

**Uso pessoal com intenção comercial futura**: distribuição comercial
ainda não está autorizada nem implementada, mas licenças de dependências e
serviços externos DEVEM ser observadas desde já — TMDB exige atribuição em
uso não comercial e comercial; Psycopg é licenciado LGPL-3.0 (não MIT);
IMDb e YouTube têm termos próprios de uso de dados/player que não
autorizam scraping nem extração de mídia (ADR-006 §8).

**Interação primária por controle remoto**: touch, mouse, voz e o futuro
app Android são complementares. Nenhum recurso essencial pode ter esse
caminho como único meio de acesso.

**Validação em hardware real**: emulador e navegador são suficientes para
o desenvolvimento do dia a dia nesta fase do projeto. Teste na TV real é
fortemente recomendado antes de considerar uma capacidade de
player/DRM/codec comprovada, mas **não é gate obrigatório** para o
`sdd-converge` fechar uma feature nesta fase — decisão explícita,
revisitável quando o projeto avançar para preparação comercial
(docs/guia-praticas-app-tv/12, "emulador não reproduz integralmente o
hardware").

## Fluxo de Desenvolvimento

**Testes automatizados obrigatórios**: nenhuma task do `sdd-execute` DEVE
ser marcada como concluída sem as checagens automatizadas do seu lado da
stack passando — `pytest` + `ruff` no backend (Python/FastAPI), `vitest`
no frontend (TypeScript/React/Vite). Isso é checado a cada task, não
apenas ao final da feature.

**Revisão de segredos antes de commit/push**: qualquer mudança que toque
configuração, `.env`, logs ou serialização de `Source`/credenciais DEVE
ser revisada quanto a vazamento de segredo antes de integrar, mesmo
passando nos testes automatizados.

**Critério de "pronto" por feature**: uma feature só é considerada
implementada quando (a) os testes automatizados relevantes passam, (b) os
critérios de aceite da spec (`Acceptance Scenarios`) foram verificados
manualmente pelo menos em emulador/navegador, e (c) nenhum princípio desta
constitution foi violado sem justificativa registrada em Complexity
Tracking do `plan.md`.

## Governança

Emendas a esta constitution são feitas editando este arquivo diretamente
(nenhum skill edita a constitution depois de criada) e atualizando
**Versão**/**Última Emenda** abaixo conforme as regras de versionamento
desta seção. Mudança de stack, plataforma-alvo ou reprodução (Direct Play)
deve primeiro passar por uma ADR (`sdd-adr`) antes de refletir aqui.

A constitution usa versionamento semântico. Uma versão MAJOR denota remoção
ou redefinição incompatível de um princípio. Uma versão MINOR denota um
novo princípio ou expansão material da governança. Uma versão PATCH denota
esclarecimentos, correções ou mudanças de texto não semânticas.

**Versão**: 1.0.0 | **Ratificada**: 2026-09-14 | **Última Emenda**: 2026-09-14
