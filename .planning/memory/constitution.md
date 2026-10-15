<!--
Relatório de Impacto de Sincronização (2026-10-14, feature 072)
- Mudança de versão: 1.11.0 -> 1.12.0 (MINOR, expansão delimitada de "Segredos
  Fora dos Clientes e dos Logs").
- Origem: decisões explícitas do usuário no sdd-specify/sdd-plan da feature 072
  (desvincular a TV do portal e backup dos dados de uso), após aviso de risco;
  ADR-017.
- Exceção delimitada (g): por ação da pessoa (Atualizar da tela de listas, botão
  de backup, desvincular), a TV PODE enviar ao serviço um backup dos dados de uso
  (favoritos, histórico, progresso, preferências de categoria, configurações do
  app), o PIN por lista só como hash com sal e a chave BYOK do TMDB; tudo cifrado
  em repouso, devolvido só à mesma TV, apagável pela pessoa; o painel vê só data
  e contagens. (h) a TV PODE guardar o código de recuperação depois de
  desvincular, só para se reassociar ao mesmo registro, uso único.
- Continuam proibidos: logs, URL, erros, cache, analytics, terceiros, outra TV,
  exportação pública; catálogo, URLs e credenciais IPTV continuam fora do backup.
- Riscos aceitos pelo usuário: PIN curto reversível por força bruta se o backup
  cifrado vazar; código de recuperação mantido na TV após desvincular.
- Formalização normativa não comprova implementação, hardware ou lançamento.

Relatório anterior:
Relatório de Impacto de Sincronização (2026-10-14)
- Mudança de versão: 1.10.0 -> 1.11.0 (MINOR, expansão delimitada de "Segredos
  Fora dos Clientes e dos Logs").
- Origem: decisões explícitas do usuário no sdd-specify/sdd-plan da feature 071
  (consulta sob demanda e QR fixo), após aviso de risco; ADR-016.
- Exceções delimitadas: (d) a TV PODE enviar ao serviço, por ação da pessoa, as
  credenciais IPTV das listas dela (host, usuário, senha, URL M3U), que ficam
  cifradas, nunca em log, e só voltam à sessão autenticada da mesma TV; (e) a
  chave do dispositivo PODE estar no FRAGMENTO do QR fixo gerado na TV, nunca em
  path, query, log, requisição ou resposta; (f) a chave também fica visível na
  tela de bloqueio da licença.
- Esclarecimento: nenhuma consulta ao serviço é automática; só ação da pessoa.
- Continuam proibidos: logs, URL enviada ao servidor, cards comuns, mensagens de
  erro, analytics, checkout, exportação/backup público e terceiros.
- Riscos aceitos pelo usuário (foto/captura do QR, credenciais no serviço, teste
  local reiniciável antes do 1º contato) com mitigações na ADR-016.
- Formalização normativa não comprova implementação, hardware ou lançamento.

Relatório anterior:
Relatório de Impacto de Sincronização (2026-10-13)
- Mudança de versão: 1.9.0 -> 1.10.0 (MINOR, expansão delimitada de "Segredos
  Fora dos Clientes e dos Logs").
- Origem: decisões explícitas do usuário no sdd-specify/sdd-plan da feature 070
  (entrada de listas estilo gerenciador), após aviso de risco; ADR-014.
- Exceções delimitadas: (a) chave do dispositivo numérica permanente exibida o
  tempo todo SOMENTE na tela de adicionar lista da TV; (b) painel autenticado da
  própria TV recebe os valores salvos das listas dela; (c) a TV mostra credencial
  local na digitação e na edição da própria lista, com controle para ocultar.
- Continuam proibidos: logs, URL de navegação, QR, cards comuns, mensagens de
  erro, analytics, checkout, exportação/backup público e terceiros.
- Riscos aceitos pelo usuário (foto da tela, sessão sequestrada) com mitigações
  obrigatórias listadas no próprio princípio.
- Formalização normativa não comprova implementação, hardware ou lançamento.

Relatório anterior:
Relatório de Impacto de Sincronização (2026-10-11)
- Mudança de versão: 1.8.0 -> 1.9.0 (MINOR, expansão delimitada da exceção comercial).
- Decisão explícita do usuário: licença vigente exigida ao entrar na lista;
  vencimento durante a sessão não a interrompe, nova entrada exige revalidação.
- Configuração, compra e dados preservados; revogação confirmada mantém encerramento.

Relatório anterior:
Relatório de Impacto de Sincronização (2026-10-11)
- Mudança de versão: 1.7.0 -> 1.8.0 (MINOR).
- Origem: decisões explícitas do usuário na feature 069 e pedido de resolver
  suas pendências normativas; arquitetura aceita na ADR-013.
- Exceções delimitadas: controle remoto opcional, retenção/backup cifrado de
  configurações fornecidas no portal, convite QR efêmero, código de licença
  protegido para recuperação pelo site e bloqueio comercial só de reprodução.
- Checkout externo escolhido pelo usuário; comandos locais continuam locais.
- Catálogo/importação/Direct Play e exceções BYOK locais preservados.
- Formalização normativa não comprova implementação, hardware ou lançamento.

Relatório anterior:
Relatório de Impacto de Sincronização
- Mudança de versão: 1.6.1 -> 1.7.0 (MINOR)
- Princípios modificados: "Sem Conta Obrigatória" ganha uma exceção — uma
  lista cuja conta o painel confirmou vencida ou recusada PODE ser impedida
  de abrir; a interface, as outras listas e o estado local continuam
  garantidos. Mesmo formato das exceções anteriores (1.2.0, 1.5.0, 1.6.0).
- Princípios adicionados: nenhum
- Origem da mudança: decisão explícita do usuário em 2026-09-30 ("é
  necessário ter uma lista [válida] para abrir"), levantada pelo
  Constitution Check do `sdd-plan` da feature 034
- Seções removidas: nenhuma
- Pendências: nenhuma

Relatório anterior (1.6.0 -> 1.6.1): "Plataforma-alvo" corrigida para a
engine medida no aparelho (Tizen 9.0 / Chromium 120), feature 033.

Relatório anterior (1.5.1 -> 1.6.0): "Segredos Fora dos Clientes e dos
Logs" — a exceção client-first passou a cobrir a chave BYOK de serviço de
terceiro (TMDB, OpenAI) digitada pela própria pessoa na TV (decisão do
usuário em 2026-09-29, `sdd-specify` da feature 032, FR-027).

Histórico:
- 1.0.0 (2026-09-14): criação inicial — Princípios Fundamentais (8),
  Restrições do Projeto, Fluxo de Desenvolvimento, Governança
- 1.1.0 (2026-09-16): 5 princípios novos (foco/voltar/identidade/
  progresso/documentação) + restrição de design system (ADR-007)
- 1.2.0 (2026-09-19): exceção em "Segredos Fora dos Clientes e dos Logs"
  para credencial de provedor sob client-first (ADR-008); restrição de
  ambiente de execução do backend reescrita para client-first
- 1.3.0 (2026-09-24): "Foco Visível e Sem Becos Sem Saída" passa a exigir
  SELECT funcional, não só aparência de foco; "Progresso e Capacidades São
  Reais" ganha cobertura de catálogo parcial (feature 010); "Validação em
  hardware real" ganha exceção de gate obrigatório por feature (feature
  011)
- 1.4.0 (2026-09-24): Fluxo de Desenvolvimento ganha "Testes E2E
  (Playwright) antes de validação em TV física"; critério de "pronto"
  passa a exigir roteiro E2E
- 1.5.0 (2026-09-24): exceção de "Segredos Fora dos Clientes e dos Logs"
  estendida à URL completa de fonte e ao arquivo M3U (ADR-010)
- 1.5.1 (2026-09-26): restrição "Design system de TV" passa a apontar o
  DS V14 Spectrum (`docs/design/design-system/`) como referência de
  intenção; o protótipo antigo foi movido para `docs/design/old/`. Explicita
  que a constitution prevalece sobre o DS em conflito (ex.: preview em foco)
- 1.6.0 (2026-09-29): exceção de "Segredos Fora dos Clientes e dos Logs"
  estendida à chave BYOK digitada pela pessoa (TMDB/OpenAI), alinhando com
  a ADR-008 §3/§4 (feature 032)
- 1.6.1 (2026-09-30): "Plataforma-alvo" corrigida para a engine medida no
  aparelho de referência, Tizen 9.0 / Chromium 120 (era 8.0 / 108); mesmo
  aparelho, correção factual (feature 033, R-006)
- 1.7.0 (2026-09-30): "Sem Conta Obrigatória" ganha exceção para impedir a
  entrada numa lista cuja conta o painel confirmou vencida ou recusada, sem
  apagar o estado local dela (feature 034)
- 1.8.0 (2026-10-11): exceções restritas do portal/licença/recuperação pelo
  site e retenção cifrada (feature 069/ADR-013), sem mover catálogo à nuvem.
- 1.9.0 (2026-10-11): licença exigida só na entrada da lista (feature 069).
- 1.10.0 (2026-10-13): chave do dispositivo sempre visível na tela de adicionar,
  valores salvos ao painel da própria TV e credencial local visível com olho
  (feature 070/ADR-014).
- 1.11.0 (2026-10-14): credenciais IPTV da TV ao serviço (cifradas), chave no
  fragmento do QR fixo e chave visível na tela de bloqueio; nenhuma consulta
  automática ao serviço (feature 071/ADR-016).
- 1.12.0 (2026-10-14): backup dos dados de uso, PIN em hash e chave TMDB
  cifrados no serviço só para a mesma TV, e código de recuperação guardado para
  a reassociação após desvincular (feature 072/ADR-017).
-->

# Constitution do CCPlay TV

## Princípios Fundamentais

### Sem Conta Obrigatória

O aplicativo DEVE abrir e permitir uso básico (navegar interface, configurar
fontes) sem exigir login de pessoa. Uma fonte de conteúdo (URL M3U, arquivo
ou credenciais de provedor) NÃO DEVE ser tratada como conta do CCPlay.
Indisponibilidade ou expiração de uma credencial de fonte NÃO DEVE bloquear
a abertura da interface nem o acesso ao estado local já sincronizado.

**Exceção (2026-09-30, feature 034)**: quando o painel da fonte **confirmou**
— na verificação mais recente, feita agora ou guardada no aparelho — que a
assinatura venceu ou que a credencial foi recusada, o app PODE impedir a
entrada **naquela lista**, porque sem conta válida a lista não reproduz nada.
Mesmo assim: a interface continua abrindo; as outras listas não são afetadas;
a tela de impedimento DEVE dizer o motivo e oferecer caminho por controle
remoto para corrigir a lista, verificar de novo e voltar; e o estado local
daquela lista (favoritos, histórico, retomada, catálogo) NÃO DEVE ser apagado
— volta a ficar acessível assim que a conta for confirmada válida. Falha de
rede ou painel fora do ar, sozinhos, nunca impedem a entrada.

**Exceção comercial (2026-10-11, feature 069/ADR-013)**: após o teste,
a entrada no catálogo de uma lista PODE exigir licença vigente da própria TV,
sem conta pessoal. A decisão DEVE ser local, inclusive ao retornar do seletor.
Vencimento durante uma sessão já admitida NÃO DEVE interromper navegação,
reprodução ou retomada; o usuário pode continuar até sair da lista ou fechar
o app. A próxima entrada DEVE revalidar a licença, sem autorização persistida
para contornar vencimento. Revogação confirmada recebida PODE encerrar a sessão
controladamente. Abertura do app, seleção/gestão de listas, configuração, compra
e dados locais DEVEM permanecer disponíveis. Licença local verificada e vigente
DEVE permitir entrada offline; falha de consulta NÃO equivale a revogação.
Primeira ativação, renovação e recuperação pelo site exigem conexão.

**Por quê**: RF-001/RF-002; ADR-004 §1; feature 069/ADR-013.

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
backend. **Extensão (ADR-010, 2026-09-24)**: pelo mesmo motivo, a URL
completa de uma fonte, a URL de reprodução de cada item e o conteúdo do
arquivo M3U baixado — que numa lista de painel repetem usuário e senha —
também PODEM residir no dispositivo. **Extensão (BYOK, 2026-09-29, feature
032)**: a chave de API de um serviço de terceiro (TMDB e, quando existir,
OpenAI) que a **própria pessoa digitou na TV**, da conta dela, PODE residir
no dispositivo — é o modelo "traga sua chave" da ADR-008 §3/§4. Continua
proibido embutir chave do desenvolvedor ou chave compartilhada no pacote,
em variável pública do frontend ou em qualquer cliente; uma chave BYOK só é
enviada ao serviço a que pertence, nunca a outro. Tudo o que esta exceção permite guardar
ainda NÃO DEVE ser logado, exibido em tela, cartão ou mensagem de erro
(a credencial, nem depois de digitada), enviado a TMDB/OpenAI ou a
qualquer terceiro, nem exposto por um canal de exportação/backup, e DEVE
ser descartado junto com a fonte ou a geração a que pertence. Ver ADR-008
e ADR-010 para o raciocínio completo.

**Exceção remota restrita (2026-10-11, feature 069/ADR-013)**: configurações
Xtream/M3U URL fornecidas pela própria pessoa no portal PODEM permanecer
cifradas no serviço enquanto cadastradas, com backup operacional protegido
de retenção definida. O servidor PODE decifrar transitoriamente para entrega
à TV autorizada; navegador NÃO recebe segredos salvos. Isso NÃO autoriza
exportar valores existentes apenas na TV, arquivo M3U, catálogo, BYOK ou
chaves do desenvolvedor. Chaves de decifragem DEVEM ficar separadas dos
dados/backups, com recuperação protegida. Exclusão DEVE remover segredo
ativo/cancelar entregas e impedir ressurreição por sincronização/restore;
cópias antigas expiram conforme retenção informada.

Convite QR aleatório, efêmero e de uso único PODE estar no fragmento da URL,
removido antes da primeira requisição e trocado no corpo HTTPS; NÃO PODE
conter device key permanente, código da licença ou credenciais IPTV.
Device key e código da licença para recuperação PODEM ser revelados somente
por ação explícita na superfície protegida da TV/portal autorizado, para
digitação/guarda/fotografia escolhida pelo usuário, nunca em cards comuns,
URL de navegação, logs, erros, analytics, checkout ou exportação pública.
Código da licença é credencial de recuperação, não identificador público;
reuso/revogação/tentativas DEVEM ser controlados. Não alegar DRM inviolável.

**Exceção de pareamento estilo gerenciador (2026-10-13, feature 070/ADR-014)**,
decisão explícita do usuário com risco aceito:
(a) a TV PODE exibir o tempo todo, **somente na tela de adicionar lista**, o ID
do dispositivo (formato de endereço MAC, não secreto) e a chave do dispositivo
numérica permanente de 10 dígitos, para digitação no painel. A chave DEVE ser
aleatória (CSPRNG), guardada no serviço só como HMAC, regenerável por ação
explícita (invalidando a anterior e as sessões), protegida por limite de
tentativas por ID/origem/global com recusa uniforme, e NÃO PODE ir para QR,
URL, cards, logs, erros, analytics ou exportação. O QR continua sendo convite
efêmero de uso único.
(b) o painel autenticado **da própria TV** PODE receber os valores salvos das
listas dela (URL, usuário, senha) para edição; a resposta NÃO DEVE ser
armazenada em cache, logada nem enviada a outra TV/sessão; demais regras da
exceção remota continuam valendo.
(c) a TV PODE exibir a credencial que a própria pessoa digita e, na edição, a
credencial local já guardada daquela lista, com controle explícito para
ocultar — ainda proibido em cards, avisos, histórico, erros e telas comuns.

**Exceção de consulta sob demanda e QR fixo (2026-10-14, feature 071/ADR-016)**,
decisão explícita do usuário com risco aceito, emenda os itens (a) e (b) acima e
o parágrafo do convite QR:
(d) a TV PODE enviar ao serviço, **somente por ação da pessoa** (adicionar,
editar ou excluir uma lista; botão Atualizar), nome, tipo, host, usuário, senha
e URL M3U das listas dela. O serviço DEVE cifrá-las em repouso, NÃO PODE logá-las
nem devolvê-las a outra TV, sessão ou cache, e as devolve só à sessão autenticada
da mesma TV (item (b)). Não amplia o que sai do aparelho: arquivo M3U, catálogo,
BYOK e chaves do desenvolvedor continuam proibidos.
(e) a chave do dispositivo PODE compor o QR fixo gerado **localmente na TV**
(`<site>/#id=<ID>&key=<chave>`), exclusivamente no **fragmento**. NÃO PODE estar
em path, query, log, requisição, resposta, `Referer` ou analytics; o site DEVE
consumi-la no navegador e removê-la do endereço/histórico antes de renderizar.
"Gerar nova chave" DEVE invalidar o QR e as sessões abertas.
(f) a chave também PODE ficar visível na **tela de bloqueio** da licença, onde a
pessoa precisa dela para comprar. Fora de Adicionar lista e do bloqueio, continua
só por ação explícita em Portal & licença; nunca em cards, perfis, avisos,
histórico, erros ou diagnóstico.
Limite de tentativa por ID/origem/global e recusa uniforme (item (a)) continuam.

**Exceção de backup de uso e reassociação (2026-10-14, feature 072/ADR-017)**,
decisão explícita do usuário com risco aceito, amplia o item (d):
(g) a TV PODE enviar ao serviço, **somente por ação da pessoa** (Atualizar da tela
de listas, "Fazer backup agora", Desvincular), um backup dos dados de uso dela —
favoritos, histórico, progresso, preferências de categoria e configurações do app
—, o PIN por lista **só como hash com sal** e a chave BYOK do TMDB. O serviço DEVE
cifrar o backup inteiro em repouso, guardar só a última versão, NÃO PODE logá-lo
nem devolvê-lo a outra TV, sessão ou cache, e o devolve só à **mesma TV**
autenticada. O painel da própria TV PODE ver apenas data e contagens e apagar o
backup. A pessoa DEVE poder apagá-lo na TV e no site. Catálogo, URLs de stream,
URL/credenciais IPTV, arquivo M3U e chaves do desenvolvedor continuam fora do
backup. A chave TMDB continua nunca exibida, logada ou enviada a terceiro.
(h) depois de **Desvincular**, a TV PODE manter o código de recuperação que já
guardava, exclusivamente para se reassociar ao mesmo registro; ele vai só no
corpo HTTPS, é de uso único (o serviço emite outro) e é apagado da TV ao concluir.
Limites de tentativa e recusa uniforme da recuperação (069) continuam valendo.

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

**Esclarecimento (2026-10-11, feature 069)**: a decisão de licença DEVE ser
local, sem consulta por tecla ou início de playback. Sincronização diária
online e consulta rápida apenas em QR/configuração/compra NÃO entram no
caminho síncrono dos comandos. Falha de rede NÃO bloqueia licença vigente.
**Atualização (2026-10-14, feature 071)**: o app NÃO DEVE consultar o serviço sem
ação da pessoa — nem ciclo diário, nem consulta rápida, nem ao abrir o app ou ao
negar a entrada. Só as ações listadas na exceção (d)–(f) de "Segredos" e o botão
**Atualizar** falam com o serviço.

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

**Exceção de conveniência/comercial (2026-10-11, feature 069)**: portal para
configurar e concluir compra/recuperação pelo site PODE exigir celular ou
computador, por escolha explícita do usuário. A TV DEVE oferecer QR e
endereço/código, situação/validade, instruções e retorno por controle.
Adicionar/editar/remover fontes localmente, navegar e usar mídia autorizada
DEVEM continuar com caminho completo pelo controle. Foco nunca compra,
importa ou reproduz; código secreto não integra URL do QR.

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
reprodução nem disparar consulta a serviço externo. Um elemento com a
aparência visual de foco (contorno/classe) mas que SELECT não ativa de fato
NÃO satisfaz este princípio — foco é o par completo "visível + ativável por
SELECT", nunca só o primeiro.

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
DEVE encobrir autenticação inválida ou formato incompatível. O mesmo vale
para o catálogo: quando a cobertura de uma categoria for parcial — obtida
sob demanda, truncada por limite de armazenamento, ou ainda não
sincronizada — a interface DEVE indicar esse escopo, e NUNCA apresentar um
catálogo parcial como se fosse o catálogo completo declarado pela fonte.

**Por quê**: docs/guia-praticas-app-tv/04 (T04) e /06 (P02, estados
explícitos); docs/guia-praticas-app-tv/01 (D03); ADR-007 §5; ADR-002
(emenda de cobertura parcial de catálogo, feature 010).

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

**Plataforma-alvo**: Samsung QN50Q60DAGXZD (referência de engine: Tizen 9.0
/ Chromium 120, medido no próprio aparelho em 2026-09-29, com o app rodando
em origem `file://`). O build continua mirando `chrome108` como piso seguro
(não é a engine medida). Nenhuma outra TV, geração ou firmware é presumida
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

**Exceção (2026-10-11, feature 069/ADR-013)**: serviço central serverless
PODE cuidar de identidade/sessões, configurações fornecidas no portal,
pendências, pagamento/licença, recuperação pelo site e backups de controle.
Importação, classificação, catálogo e Direct Play permanecem na TV.
Indisponibilidade do serviço NÃO impede configuração local ou uso de
licença local vigente. Infraestrutura/custo/restore/tempo/plataforma DEVEM
ter validação própria; esta exceção não autoriza lançamento comercial.

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
token — não define cor, raio ou tamanho de fonte literal. O Design System
V14 Spectrum (`docs/design/design-system/`: Spec, Component Lab e
protótipo de telas) é a referência de intenção; o CSS é o contrato
executável. Em conflito, esta constitution prevalece sobre o DS.

**Validação em hardware real**: emulador e navegador são suficientes para
o desenvolvimento do dia a dia nesta fase do projeto. Teste na TV real é
fortemente recomendado antes de considerar uma capacidade de
player/DRM/codec comprovada, mas **não é gate obrigatório por padrão** para
o `sdd-converge` fechar uma feature nesta fase — decisão explícita,
revisitável quando o projeto avançar para preparação comercial
(docs/guia-praticas-app-tv/12, "emulador não reproduz integralmente o
hardware").

**Exceção**: a spec/plano de uma feature específica PODE elevar a
verificação em TV física a gate obrigatório para uma capacidade concreta
que o adaptador de desenvolvimento (`<video>`) estruturalmente não
consegue provar nem desprovar (ex.: superfície de VOD do AVPlay — pausa,
busca, posição, duração — na feature `011-assistir-filme-retomada`). Quando
isso acontecer, fechar a feature sem satisfazer esse gate por completo DEVE
ser uma decisão explícita do usuário, com o risco residual registrado em
`Riscos e Decisões` do `plan.md` — nunca um item pulado em silêncio pelo
`sdd-execute`/`sdd-converge`.

## Fluxo de Desenvolvimento

**Testes automatizados obrigatórios**: nenhuma task do `sdd-execute` DEVE
ser marcada como concluída sem as checagens automatizadas do seu lado da
stack passando — `pytest` + `ruff` no backend (Python/FastAPI), `vitest`
no frontend (TypeScript/React/Vite). Isso é checado a cada task, não
apenas ao final da feature.

**Testes E2E (Playwright) antes de validação em TV física**: ao concluir
uma feature (última fase implementada no `sdd-execute`, ou convergência
sem achado no `sdd-converge`), além dos testes automatizados por task já
exigidos acima, DEVE rodar pelo menos um roteiro de teste E2E via
Playwright cobrindo os fluxos principais da feature (`npm run test:e2e`
em `tv-web/`, hoje `tv-web/e2e.mjs`) contra o dev server (`npm run dev`).
Este é um gate **anterior** a qualquer solicitação de teste na TV física
(`tizen-tv`) ou no emulador (`tizen-emulator`) — nunca um substituto para
eles: pega regressão de fluxo, formulário, diálogo e navegação mais cedo e
mais barato do que o ciclo de hardware real, mas não valida
`webapis.avplay`, codec, DRM nem desempenho (só a TV real faz isso, ver
"Validação em hardware real" acima).

**Revisão de segredos antes de commit/push**: qualquer mudança que toque
configuração, `.env`, logs ou serialização de `Source`/credenciais DEVE
ser revisada quanto a vazamento de segredo antes de integrar, mesmo
passando nos testes automatizados.

**Critério de "pronto" por feature**: uma feature só é considerada
implementada quando (a) os testes automatizados relevantes passam —
unitários/componente (pytest/vitest) e pelo menos um roteiro E2E via
Playwright cobrindo os fluxos principais da feature, (b) os critérios de
aceite da spec (`Acceptance Scenarios`) foram verificados manualmente pelo
menos em emulador/navegador, e (c) nenhum princípio desta constitution foi
violado sem justificativa registrada em Complexity Tracking do `plan.md`.

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

**Versão**: 1.12.0 | **Ratificada**: 2026-09-14 | **Última Emenda**: 2026-10-14
