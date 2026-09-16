# Research: Importação de Fonte M3U por URL e por Provedor

## R1 — Parser M3U

**Decisão**: Adotar `ipytv` (pacote `m3u-ipytv`) como candidato inicial,
atrás de uma interface própria `M3UParser` (protocolo Python — não a
biblioteca diretamente usada pelo resto do importador).

**Justificativa**: ADR-006 marca `m3u-ipytv` como "condicional, candidato
preferido para prova técnica" — suporta `#EXTM3U`/`#EXTINF`/URLs e preserva
atributos extras. Licença MIT. Evita reescrever um parser do zero sem
evidência de que é necessário.

**Alternativas consideradas**: Parser próprio desde o início — rejeitado
por esforço repetitivo sem necessidade comprovada ainda (mesma alternativa
já rejeitada na ADR-006 §7). Se `ipytv` perder dados ou exceder limites
medidos durante os testes desta feature, substituir por um parser
incremental próprio atrás da mesma interface `M3UParser`, registrando a
evidência da troca (não presumir performance ruim do Python).

## R2 — Conector de provedor (DNS/usuário/senha)

**Decisão**: Implementar `ProviderSourceConnector` sobre HTTPX assumindo o
padrão comum observado em painéis compatíveis com Xtream: obter a lista
completa via um endpoint de exportação M3U autenticado por usuário/senha
(o mesmo formato de URL M3U com credenciais embutidas), reaproveitando o
mesmo `M3UParser`/classificador da entrada por URL (User Story 1). Não
implementar nesta feature o protocolo JSON estruturado do Xtream
(`player_api.php` com categorias/VOD/séries separadas) — fica registrado
como evolução futura (R-002 em Riscos e Decisões do `plan.md`).

**Justificativa**: ADR-004 §3 e ADR-006 §4.3 tratam Xtream-compatível como
hipótese não confirmada, não protocolo validado. Reduzir para "credenciais
geram uma URL M3U que o mesmo pipeline já processa" minimiza risco de
implementar contra um protocolo não confirmado, mantendo RF-005 atendido
(entrada por DNS/usuário/senha) sem duplicar toda a lógica de importação.

**Alternativas consideradas**: Implementar o protocolo JSON completo do
Xtream desde já — mais fiel a categorias/IDs nativos do provedor, mas
maior esforço e risco de quebrar contra um provedor que não seja
realmente Xtream. Adiada até haver evidência de que a URL M3U perde
metadados relevantes.

**Nota de proteção de amostras**: Os exemplos reais de credenciais e URLs
já presentes em `docs/m3u/dados.md` NÃO DEVEM ser copiados para código,
specs, commits, prompts de agente ou fixtures de teste — usar apenas
localmente, direto no navegador/Postman, durante verificação manual (ver
`quickstart.md`). Fixtures automatizadas usam dados sintéticos.

## R3 — Validação SSRF da URL informada

**Decisão**: Antes de baixar uma lista M3U por URL, validar: apenas
esquemas `http`/`https`; resolver o host e bloquear IPs de loopback,
link-local, privados (RFC 1918) e o endereço de metadata de nuvem
(`169.254.169.254`) por padrão; revalidar o destino a cada redirecionamento
seguido; aplicar limite de tempo total e de tamanho de download via
streaming (não carregar a resposta inteira em memória antes de validar
tamanho).

**Justificativa**: ADR-004 §7 exige essa proteção explicitamente,
referenciando o OWASP SSRF Prevention Cheat Sheet. Sem biblioteca externa
dedicada — validação implementada como função pequena e testável sobre
`httpx`, mantendo espaço pra exceções explícitas de rede local apenas se o
backend rodar num contexto que justifique (não é o caso desta fase, backend
local de desenvolvimento).

**Alternativas consideradas**: Confiar apenas na validação de esquema/regex
da URL sem resolver o host — rejeitada por não proteger contra DNS
rebinding nem redirecionamento para destino interno.

## R4 — Persistência local (PostgreSQL)

**Decisão**: `docker-compose.yml` provisiona um serviço `postgres` local
para desenvolvimento; `DATABASE_URL` configurável via `api/.env` (já
existente); SQLAlchemy 2 (engine assíncrono) + Alembic para migrações +
Psycopg 3 (driver assíncrono) para acesso.

**Justificativa**: Confirmado com o usuário nesta sessão de planejamento.
ADR-006 §4.4 já recomendava SQLAlchemy 2 + Alembic + Psycopg 3 sobre
SQLModel para este projeto; Docker é explicitamente opcional e não bloqueia
o setup `uv` existente (ADR-006 §4.4), portanto provisionar Postgres via
Docker não interfere no fluxo Python já configurado.

## R5 — Regras heurísticas de classificação (Canal/Filme/Série/Não Classificado)

**Decisão**: Usar como evidência, em ordem de prioridade: (1) atributos
explícitos de tipo do provedor quando existirem; (2) `group-title` contendo
termos fortes de categoria (ex.: grupo majoritariamente de canais ao vivo
vs. grupo de VOD); (3) padrão de nome compatível com episódio (ex.:
`S\d{1,2}E\d{1,3}`, "temporada"/"season" seguido de número). Entrada com
evidência insuficiente ou conflitante vai para Não Classificado. Correção
manual/reclassificação por regra fica fora desta feature (RF-011, item 13
do backlog).

**Justificativa**: ADR-005 §2 explicita que nenhuma extensão de arquivo ou
palavra isolada ("filmes" em um grupo) deve decidir o tipo sozinha,
e que ambiguidade deve virar Não Classificado, não suposição.

**Alternativas consideradas**: RapidFuzz para correspondência de título —
fora de escopo desta feature (ADR-006 marca RapidFuzz para o incremento de
enriquecimento/correspondência TMDB, não para a classificação básica
canal/filme/série).
