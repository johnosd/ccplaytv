<!--
Relatório de Impacto de Sincronização
- Mudança de versão: 1.1.0 -> 1.2.0
- Princípios modificados (1): "Segredos Fora dos Clientes e dos Logs" —
  aberta exceção explícita para credencial de provedor (dns/usuário/senha
  Xtream), que passa a poder residir no dispositivo sob a arquitetura
  client-first da ADR-008. Chaves de OpenAI/TMDB e URL completa de fonte
  continuam proibidas no cliente, sem mudança.
- Princípios adicionados: nenhum
- Restrições do Projeto: "Ambiente de execução do backend" reescrita para
  refletir client-first por padrão (ADR-008); backend deixa de ser
  descrito como "roda localmente, migra para VPS depois"
- Origem da mudança: ADR-008 (arquitetura client-first — backend só
  quando estritamente necessário), decisão de custo confirmada pelo
  usuário em 2026-09-19
- Seções removidas: nenhuma
- Pendências: nenhuma

Histórico:
- 1.0.0 (2026-09-14): criação inicial — Princípios Fundamentais (8),
  Restrições do Projeto, Fluxo de Desenvolvimento, Governança
- 1.1.0 (2026-09-16): 5 princípios novos (foco/voltar/identidade/
  progresso/documentação) + restrição de design system (ADR-007)
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

**Exceção (ADR-008, 2026-09-19)**: sob a arquitetura client-first, a
credencial de provedor (endereço, usuário, senha) PODE residir no
dispositivo (ex.: IndexedDB) — é o que permite ao cliente reautenticar sem
backend. Esta é a única exceção: chaves de OpenAI/TMDB e URL completa de
fonte continuam proibidas no cliente, sem exceção. A credencial permitida
aqui ainda NÃO DEVE ser logada, exibida depois de digitada, enviada a
TMDB/OpenAI, nem exposta por um canal de exportação/backup. Ver ADR-008
para o raciocínio completo.

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

### Foco Visível e Sem Becos Sem Saída

Todo estado de toda superfície — inclusive carregando, vazio e erro — DEVE
ter pelo menos um elemento focável; uma tela sem saída focável prende o
controle remoto. O estado de foco NÃO DEVE ser comunicado apenas por
mudança de cor, e NÃO DEVE depender de `hover` (que não existe neste alvo).
Mover o foco seleciona; SELECT executa — focar um item NÃO DEVE iniciar
reprodução nem disparar consulta a serviço externo.

**Por quê**: ADR-007 §4/§5; docs/guia-praticas-app-tv/04 (foco por contorno
+ realce) e /08 (UX09); docs/iptvnator/01-ui-ux.md #6 e
07-tela-canais.md #1.

### Voltar Restaura Foco e Posição

Ao retornar de detalhe, player ou trailer, o item que originou a navegação
DEVE recuperar o foco, e a posição de rolagem/janela virtual da grade DEVE
ser restaurada. Trocar de categoria começa no primeiro item; voltar à
categoria anterior restaura o item anterior. Após atualizar ou filtrar o
catálogo, o foco DEVE ser reconciliado pelo identificador do item, não pelo
índice.

**Por quê**: ADR-005 §3; ADR-006 §4.1; docs/guia-praticas-app-tv/01 (D04) e
/03 (I03, I04); docs/iptvnator/01-ui-ux.md #7.

### Identidade de Reprodução Não Depende da URL

Posição de retomada, favorito, histórico e sessão de reprodução DEVEM ser
chaveados por uma identidade lógica estável (fonte + tipo + id estável +
temporada/episódio), NUNCA pela URL de stream — que expira, muda com
catch-up e carrega credenciais. Uma reimportação/resync DEVE reconciliar o
estado do usuário por essa chave estável antes de expor o catálogo novo, e
NÃO DEVE reatribuir estado a outra obra por aproximação de título.

**Por quê**: ADR-005 §2/§4; docs/iptvnator/02-arquitetura.md #2 e
06-carga-listas-url-xtream.md #8/#12.

### Progresso e Capacidades São Reais, Nunca Prometidos

Quando não houver denominador confiável, a interface DEVE usar indicação
indeterminada em vez de um percentual inventado. Os controles do player
DEVEM refletir as capacidades reais do item: transmissão ao vivo sem janela
DVR NÃO DEVE oferecer busca temporal, e uma mensagem de "carregando" NÃO
DEVE encobrir autenticação inválida ou formato incompatível.

**Por quê**: docs/guia-praticas-app-tv/04 (T04) e /06 (P02, estados
explícitos); docs/guia-praticas-app-tv/01 (D03); ADR-007 §5.

### Documentação do Repositório É Canônica

ADRs, specs, `.planning/` e docs de subsistema são artefatos mantidos, não
rascunhos descartáveis — e continuam canônicos mesmo quando rascunhados por
um LLM. Quando uma mudança invalidar um caminho, comando ou rota citado na
documentação, a correção DEVE acontecer na mesma tarefa: um caminho
desatualizado contamina toda sessão futura de agente. Funcionalidade
planejada NÃO DEVE ser apresentada como entregue.

**Por quê**: docs/iptvnator/05-documentos.md #3/#4/#6; regra de veredito
honesto já em vigor no `sdd-bugfix` e no `sdd-converge`.

## Restrições do Projeto

**Plataforma-alvo**: Samsung QN50Q60DAGXZD (referência de engine: Tizen 8.0
/ Chromium 108). Nenhuma outra TV, geração ou firmware é presumida
compatível sem validação própria (ADR-006 E1).

**Reprodução**: Direct Play é o padrão — o vídeo flui da origem indicada
pela fonte direto para a TV, sem proxy ou transcodificação pelo backend.
Mudar isso exige decisão posterior baseada em necessidade comprovada, custo
e permissão da fonte (ADR-001 §2).

**Ambiente de execução do backend**: client-first por padrão (ADR-008,
2026-09-19) — import de fonte, catálogo e reprodução não DEVEM depender de
nenhum backend sempre-ligado, nem local nem VPS. Um backend continua
existindo só para o que estruturalmente não cabe no cliente (voz/OpenAI,
quando construída) ou como contorno opcional para provedor que bloqueia
CORS. Não presumir TLS, backup/restore ou infraestrutura de produção
resolvidos para esse contorno (ADR-006 E4, Incremento E, emendado).

**Uso pessoal com intenção comercial futura**: distribuição comercial
ainda não está autorizada nem implementada, mas licenças de dependências e
serviços externos DEVEM ser observadas desde já — TMDB exige atribuição em
uso não comercial e comercial; Psycopg é licenciado LGPL-3.0 (não MIT);
IMDb e YouTube têm termos próprios de uso de dados/player que não
autorizam scraping nem extração de mídia (ADR-006 §8).

**Interação primária por controle remoto**: touch, mouse, voz e o futuro
app Android são complementares. Nenhum recurso essencial pode ter esse
caminho como único meio de acesso.

**Design system de TV**: palco 1920×1080 escalado uniformemente, tema
escuro, paleta/tipografia/raios e receita de foco definidos na ADR-007 e
implementados como tokens em `tv-web/src/index.css`. Tela nova consome
token — não define cor, raio ou tamanho de fonte literal. O protótipo
`docs/design/CCPlayTv Prototype - Standalone.html` é a referência de
intenção; o CSS é o contrato executável.

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

**Versão**: 1.2.0 | **Ratificada**: 2026-09-14 | **Última Emenda**: 2026-09-19
