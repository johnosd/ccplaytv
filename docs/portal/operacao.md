# Operação do portal CCPlayTV

Feature 069. Responsável pelo piloto e pelos alertas: mantenedor do projeto.
Este documento distingue preparação local, homologação e produção. Nenhum
recurso de nuvem ou pagamento real é criado por executar testes locais.

## Fronteira e ambientes

Importação, catálogo, credenciais já existentes na TV e Direct Play continuam
locais. `api/portal_main.py` é o entrypoint exclusivo do controle; não importa
`main.py`, `app.db`, routers SQL, Alembic ou o fallback da porta 3000.
Portal React é compilado separadamente e servido pelo controle na mesma origem.
Firestore não é acessado diretamente pelo navegador ou pela TV.

| Ambiente | Dados/autorização | Cobrança |
| --- | --- | --- |
| Desenvolvimento | Projeto `demo-ccplaytv-portal`, emulator loopback explícito, fixtures fictícias | Desabilitada |
| Teste | Projeto demo e emulator explícitos; ausência recusa conexão | Desabilitada |
| Homologação | Projeto dedicado, ADC, conta de teste Mercado Pago, opt-in para integração real | Sem venda real |
| Produção | Projeto próprio, ADC/IAM, HTTPS, gates da spec comprovados | Só após aceite comercial |

Variáveis do novo serviço usam `CCPLAY_PORTAL_`, exceto as variáveis padrão
`PORT` e `FIRESTORE_EMULATOR_HOST`. Não ler `.env` do fallback implicitamente.
Não usar credenciais JSON do Google. Ausência de emulator em teste/desenvolvimento
falha fechada; produção recusa emulator e projeto demo.

## Serviços e identidades

| Componente | Configuração inicial proposta | Permissões |
| --- | --- | --- |
| Cloud Run público | FastAPI/SPA, request billing, min 0, max 2, 1 vCPU/512 MiB | Firestore e journal mínimos |
| Cloud Run jobs | Mesma imagem, papel `jobs`, sem invocação pública | Firestore e journal mínimos |
| Scheduler | Tick horário via OIDC, audience URL do jobs | Invoker somente no jobs |
| Firestore Native | `us-central1`, database explícita, índices versionados | Runtime por ADC/IAM; clientes diretos negados |
| Cloud Storage | Journal regional privado, criação condicional | Runtime create/read/list; sem overwrite/delete |
| Backups | Firestore diário, retenção 7 dias; journal 30 dias | Operação de restore separada do runtime |

Permissões de deploy/IAM/restore são administrativas e não pertencem ao runtime.
Não habilitar retenção bloqueada irreversível no piloto. API pública nunca
executa `/internal/portal/jobs/tick`; jobs depende de IAM/OIDC real, não token
estático. Não executar fila em BackgroundTasks ou loop residente.

## ID do dispositivo no backup e no restore (ADR-015)

- `devices.display_id`/`display_id_source` e `displayIdClaims/{hmac(displayId)}`
  entram no backup do Firestore (banco inteiro, **sem lista de coleções**) e nenhuma
  retenção, manutenção ou restore os apaga ou regrava. Guardas automáticas:
  `api/tests/portal/test_display_id_durability.py` e `test_pairing.py`.
- Retenção: a reserva segue o dispositivo, e nenhuma rotina automática remove
  dispositivos. Se um dia existir exclusão integral de TV, ID e reserva saem juntos e
  só por operação documentada.
- Restore em nova base: dispositivos cadastrados depois do snapshot não existem lá.
  A TV recadastra com a mesma identidade e recebe o **mesmo** ID (origem `mac` ou
  `derived`). Registros antigos `generated` (sorteados antes da ADR-015) não são
  reproduzíveis; hoje só a TV de referência do staging (`2A:…`).
- A chave HMAC de identidade/reserva fica na cópia protegida das chaves: sem ela o
  ID derivado não se reproduz e a reserva não é consultável. Entra no ensaio de
  recuperação de chaves.
- Chave do dispositivo após restore: vale o hash restaurado; `access_revoked` do
  journal derruba chaves revogadas depois do snapshot. O caso "TV com chave mais
  nova que o snapshot" deve ser **observado no ensaio real** (T060/T039) e
  registrado em `evidencias/`; não está afirmado aqui.

## Segredos e rotação sem cofres

Sem KMS/Secret Manager, conforme decisão do usuário. AES-GCM, assinatura ES256,
HMAC de identidade/recuperação, token Mercado Pago e assinatura webhook são
segredos distintos por finalidade. Manter em configuração privada do serviço,
fora da imagem, frontend, repositório, argumentos de CLI e logs. Não registrar
valores de ambiente nem exceções com input/URL. Acesso a revisões/configuração
Cloud Run é privilegiado: reduzir quem pode ler e fazer deploy.

Guardar cópia protegida das chaves fora do banco/backups e sob controle do
mantenedor. Testar recuperação dessa cópia. Rotação preserva versões necessárias
para decifrar backups de sete dias e validar direitos ainda vigentes; remover
chave antiga apenas após janela aplicável e ensaio. Perder chaves pode impedir
recuperação. Cifragem protege cópia do banco, não runtime comprometido.

Configurações fornecidas no portal ficam cifradas enquanto cadastradas. Por
decisão 1.10.0/ADR-014, somente uma sessão `manage` autenticada pela mesma TV
pode ler transitoriamente os valores allowlisted da própria fonte pela rota
`GET /portal/v1/configurations/{sourceId}/values`; a resposta é `no-store` e
nunca vai para logs, URL, QR, cards ou exportações. Exclusão elimina
versões/cancela entregas, com tombstone e journal para não ressuscitar depois
de restore. Somente Xtream/M3U URL; nenhum bucket de M3U, catálogo, histórico
ou credenciais exclusivas da TV.

## Recuperação da licença e restauração do serviço

Usuário guarda/fotografa código privado exibido explicitamente na TV. Recupera
pelo próprio site com desafio da mesma TV, sem atendimento. Troca revoga acessos
e código anteriores, preservando teste/vencimento/configurações não excluídas.
Sem código e sem acesso anterior, recuperação automática não é possível.
Algoritmo, envelopes/ACK/retomada, retenções e testes estão em `logic` e
`data-model` da 069. Não usar recibo, deviceId ou DUID como autenticação.

Restauração operacional é manual pelo mantenedor: fechar tráfego/escritas,
restaurar backup de até sete dias em nova base isolada, recuperar chaves,
reaplicar journal íntegro, conciliar Mercado Pago e invalidar sessões/desafios
anteriores antes de reabrir. Nunca restaurar acesso/código revogado nem segredo
excluído. Medir RPO/RTO; agendamento diário não garante objetivo RPO de 24 h.
T039/T052 entregam e ensaiam runbook executável; preparação não é aceite.

## Consumo e alertas

Licença custa **R$35 por 12 meses/uma TV**. Infraestrutura tem referência
independente de **R$10 por mês**, piloto de 10–50 TVs. Alertas em 50/90/100/150%
e previsão avisam mantenedor, que decide sobre orçamento. Manter serviço ativo;
alertas e max instances não garantem teto exato. Contar runtime, Firestore,
journal/backup/restore, imagens/builds, logs/tráfego, câmbio e impostos.

Monitorar idade/falha de backup (>24 h), falha journal/fences pendentes,
fila/retries, webhook/reconciliação e p95 frio/quente. Logs só por código
allowlist/operationId, sem corpo, URL, DUID ou tokens; definir retenção curta
e limpeza de imagens. T043/T045/T052 medem custos e definem thresholds reais.

## Gates e referências

Cobrança desligada até provas de identidade/tempo/ES256, recuperação pelo site,
pagamento de teste, IAM/OIDC, backup/restore/journal, medições, E2E e TV física.
Atualização do aparelho preserva dados/assinatura; reinstalação só laboratório.

Fontes primárias consultadas na execução: [contrato de runtime Cloud Run](https://docs.cloud.google.com/run/docs/container-contract),
[emulator Firestore](https://docs.cloud.google.com/firestore/native/docs/emulator),
[IAM versus regras de clientes](https://firebase.google.com/docs/firestore/security/get-started).
Design completo: `sdd/specs/069-portal-tv-licenca-anual/` e ADR-013.

## Formatos privados e rotação de criptografia (T008)

`CCPLAY_PORTAL_AES_KEY`: 32 bytes aleatórios em Base64 URL-safe sem padding; `AES_KEY_VERSION` identifica a versão ativa. `AES_PREVIOUS_KEYS`: JSON privado de versão→chave no mesmo formato, somente versões antigas. `SIGNING_KEY`: PEM PKCS8 privado P-256; `SIGNING_KID` identifica chave ativa. `SIGNING_PREVIOUS_PUBLIC_KEYS`: JSON de kid→PEM SubjectPublicKeyInfo das chaves antigas. Todos com prefixo CCPLAY_PORTAL_. Não usar senha humana como chave AES. Não copiar valores para VITE_*, Docker, CLI, logs ou exemplos.

`PortalCrypto.from_settings` recusa material inválido, IDs duplicados e algoritmos diferentes. Cifra com nonce aleatório de 12 bytes/AAD deviceId+sourceId+configVersion+keyVersion; assinatura ES256 usa formato JWS r||s de 64 bytes. Public JWKS só contém coordenadas públicas. A verificação criptográfica não substitui validação comercial/temporal do entitlement, implementada em T032/T035.

Rotação: preservar cópia protegida separada das chaves antigas; publicar chave pública nova antes de emitir tokens novos; manter públicas antigas enquanto houver token vigente. Trocar versão AES ativa, mantendo antigas para configurações/versões e backups ainda referenciados; não remover até reencrypt/restore verificados em T039/T052. Nunca gerar chaves efêmeras automaticamente no startup nem reutilizar nonce em callback transacional.

## Autenticação e recuperação — T006/T007

HMAC de identidade/autenticação: `IDENTITY_HMAC_KEY` contém 32 bytes aleatórios Base64URL sem padding; `IDENTITY_HMAC_VERSION` identifica versão ativa e `IDENTITY_HMAC_PREVIOUS_KEYS` contém JSON privado versão→chave antiga (até quatro). Prefixo CCPLAY_PORTAL_. Hashes têm domínio/finalidade distintos para identidade, bearer TV, device key, convite, sessão, CSRF e contadores; código de recuperação usa outra chave. Nunca reutilizar chave de recuperação como chave de identidade.

Preservar versões HMAC antigas e consultar todos os claims correspondentes antes de cadastrar identidade durante rotação. Descartar chave antiga sem migração segura pode perder vínculo/trial; DUID bruto não é armazenado para recalcular hashes em lote. `SERVICE_RECOVERY_EPOCH` deve ser valor aleatório Base64URL de 32 bytes, comum às instâncias público/jobs e trocado em todo restore com tráfego fechado. Ausência recusa autenticação; health continua independente. T007 integra reemissão local; T039/T052 ainda ensaiam restore real.

Convite nasce fora do callback transacional, vale cinco minutos e é consumido uma única vez por CAS. Cookie de sessão HttpOnly/SameSite=Strict/Path=/portal/v1, Secure em staging/produção; somente HTTP loopback de desenvolvimento/teste permite cookie sem Secure. Mutações exigem Origin exato e CSRF; Origin null somente no transporte TV autenticado com bearer. Sessão expira após 30min inativa ou 8h totais, mesmo que TTL não tenha apagado o documento.

Limites compartilhados: cinco falhas por par device/IP em 15min e cooldown de 15min; adicionais de 25/device, 25/IP e 100 globais por 15min. Formulários: 30/min/sessão. IP entra somente em HMAC e contadores expiram operacionalmente após um dia; a expiração lógica é aplicada em toda tentativa. Limiar adicional global deverá ser medido/calibrado em T043. Não confiar em X-Forwarded-For fornecido arbitrariamente pelo cliente; validar configuração do proxy real em T038/T052. Cadastro inicial/rotação/revoke/recuperação estão implementados no núcleo/API local; telas e validações reais posteriores permanecem pendentes.

### Entrada manual e operação do gerenciador (feature 070)

Na TV, **Adicionar lista** abre o pareamento e mostra o `displayId` em formato
`XX:XX:XX:XX:XX:XX`, a chave numérica de dez dígitos, endereço e QR (fixo desde a 071: ver a seção seguinte). O QR não carrega credencial nem URL de provedor — só
ID e chave no fragmento. No painel, a entrada manual
aceita `displayId` (maiúsculas, minúsculas ou hífens são normalizados) e chave;
falhas retornam a mesma resposta de credencial inválida. A tela autenticada
mostra ID, estado/validade da licença e as listas com tipo, nome e estado.

Ao editar uma lista, `values` busca os campos salvos da própria TV uma vez; o
formulário os exibe somente nessa sessão e o olho alterna a visibilidade. A
rotação **Gerar nova chave** invalida a chave anterior e as sessões associadas.
Recarregar é explícito e dispara uma sincronização imediata, respeitando o
mutex e os limites de pull; não existe polling contínuo do painel.

### Consulta sob demanda, QR fixo e envio TV → site (feature 071, ADR-016)

Nada consulta o serviço sozinho: não há ciclo diário, janela de 10 s, renovação de convite nem consulta ao abrir o
app ou ao negar a entrada. As únicas chamadas da TV são ações da pessoa — **Atualizar** (listas: exclusões → envios
→ busca → snapshot; licença: só a licença; pausa de 10 s por escopo), criar/editar/excluir uma lista (uma tentativa
no ato; a fila `sourceUploads` é durável e sobe no próximo Atualizar) e abrir pela primeira vez uma tela que precisa
de ID/chave (cadastro único, preguiçoso). Estimativa de custo: uma TV em uso típico faz no máximo ~10 requisições
por mês (SC-007).

- **QR fixo**: gerado na TV, sem requisição, com `<site>/#id=<ID>&key=<chave>` (a chave só no fragmento, que nunca
  chega ao servidor nem a logs). O `portal-web` consome o fragmento, chama `POST /sessions/manual` (mesmos limites e
  recusa uniforme) e limpa o endereço antes de renderizar. **Gerar nova chave** invalida QR e sessões. O convite
  efêmero `manage` deixou de ser usado pela TV; os convites de recuperação (069) permanecem.
- **Tela de entrada (A006)**: "Adicionar lista" é uma tela com as abas **Pelo site** (abre aqui; ID, chave, QR,
  Recarregar e Voltar), **Xtream Codes** e **Lista M3U** (formulário e Conectar e sincronizar); RETURN de qualquer aba volta à tela de listas. Sem portal a aba do site mostra o estado honesto. Gerar
  nova chave fica em Configurações → Portal & licença ("Revogar acessos ao portal"). Excluir uma lista na TV envia a
  exclusão no ato (A007); offline fica na fila até o Atualizar.
- **Teste de 7 dias contado no app** (`localTrial`), com marca d'água do relógio; o primeiro cadastro envia o início
  (`trialStartedAt`) e o serviço grava `min(created_at, valor)` — nunca estende. Reinstalar antes do 1º contato
  reinicia o teste (risco aceito, R-003).
- **Envio TV → site**: `POST /portal/v1/device/sources` (bearer da TV, lote ≤ 10, 20 requisições/min por TV)
  grava a lista cifrada com `applied_revision` direto, sem operação pendente. Resposta por item: `stored`,
  `unchanged` (digest), `conflict` (edição do portal pendente), `gone` (tombstone), `invalid`. Nome, tipo,
  host, usuário, senha e URL M3U vão no corpo HTTPS e nunca em log, erro ou cache (constitution 1.11.0 (d)).
- **Publicação**: publicar a API (rota nova + âncora) **antes** de instalar o pacote na TV; senão a TV nova chama
  uma rota inexistente. Sem detecção de estorno: só aparece no próximo Atualizar.
- **Verificação local**: `node e2e/consulta-sob-demanda.mjs` (pilha local; fora do `SUITE`).


Atenção no restore: trocar SERVICE_RECOVERY_EPOCH invalida acessos antigos. Não atualizar recoveryEpoch dos devices em lote mantendo hashes de acesso antigos: o repositório recusa essa transição. A reemissão precisa reservar fence e trocar bearer/key com epoch maior antes de remover o bloqueio. Sessões/convites antigos continuam com epoch global anterior. T039/T052 devem ensaiar esse caminho; preparação local não autoriza reabrir tráfego.


## Recuperação e manutenção paginada — implementação local

`POST /recoveries/exchange` consome convite recover e abre cookie ccplay_portal_recovery, com namespace HMAC distinto e duração máxima do desafio5min. Não abre sessão manage. Confirmação exige CSRF/Origin/código/destino/Idempotency-Key e devolve só operationId/state; TV consulta por claimId com claimSecret no bearer exclusivo. Persistir desafio antes do QR, novas credenciais antes do ACK. Código consumido só retoma operação original não reconhecida, mesma identidade, até24h; rodada nova não estende esse prazo.

Worker privado continua limitado a5jobs/180s, lease240s, sem trabalho após resposta. Job retention-global percorre páginas de20documentos com cursor durável, retomável em outra instância; ciclo completo agenda próxima varredura em1h. Um tick não promete limpar todo o banco. Validade lógica de convites/sessões/envelopes/códigos/operações é verificada no acesso, independentemente do atraso físico do expurgo; cadência/backlog/IAM/índices e custo reais serão medidos em T043/T052. Scheduler horário e preparação local não demonstram remoção física pontual aos5min.

Expurgo remove envelopes expirados e verificadores consumidos após24h, conserva floors/intents, configuração corrente e deletes pendentes. Journal tardio não recria envelope expurgado: finalize usa a releitura CAS do intent e emite resultado expired sem ciphertext; prova privada ainda válida pode retomar a mesma operação com uma nova rodada. Expiração create/update libera referência uma única vez; versão órfã só sai se não for corrente nem referenciada. Recibos/digests não são apagados prematuramente; compactação30dias com claims será integrada ao repositório de configuração T013/T022.

**Superado pela 071**: o agente não tem mais ciclo de 24 h, retries nem tela rápida — só `refresh(scope)` por botão (seção "Consulta sob demanda"). O texto abaixo é o histórico da 069.

Agente TV/transporte integrados ao App (T018). 24h/retries1-5-15min persistidos; tela rápida10s, falha com jitter/backoff até60s (Retry-After maior prevalece). Background/offline aborta a requisição; deadline absoluto reconcilia timer atrasado mesmo sem visibilitychange no standby. A prova física atual não demonstrou suspensão de callbacks no standby: T046 mede integração.

## Build e licença local — implementação verificada localmente

O agente está integrado ao App e só consulta por ação da pessoa (071: botão Atualizar e envio no ato; sem ciclo de 24 h nem modo rápido). O player não consulta rede de licenciamento. O pacote comercial usa npm run build:commercial ou build:tizen:commercial, com VITE_PORTAL_ORIGIN HTTPS e VITE_LICENSE_PUBLIC_KEYS contendo somente o mapa kid→JWK pública ES256. A chave privada fica no servidor; nunca buscar chaves de confiança automaticamente do endpoint público. Build pessoal permanece para desenvolvimento e para preservar a TV atual; não é o artefato de distribuição comercial. Venda segue bloqueada em settings até os gates reais.

manage-backup.ps1 em infra/portal/backup prepara schedule/inspect/restore; sem -Apply não executa nuvem. A configuração de restauração ainda não permite reabrir tráfego: replay/expurgo/floors/reconcile e ensaio real continuam T039/T052.

## Regra vigente de vencimento — decisão 2026-10-11

Licença vigente é exigida localmente ao entrar numa lista, inclusive após importação/verificação do provedor e por RETURN do seletor. Se vencer dentro dela, o usuário mantém navegação, novas reproduções e retomada até sair para o seletor ou fechar o app. Configurações abertas dentro da sessão podem voltar ao conteúdo. Não há autorização persistida para a próxima abertura. Revogação confirmada continua encerrando a sessão. A guarda não faz HTTP por tecla nem dentro do player; o teste de 7 dias e o bloqueio são decididos no aparelho (071), sem rede.

## Desvincular a TV e backup dos dados de uso (feature 072, ADR-017)

- **Desvincular** (TV → Configurações → Portal & licença): apaga do aparelho só o pareamento (identidade, emissão
  pendente, licença em cache, fila de envios) e guarda o código de recuperação. Preserva listas, catálogo, favoritos,
  histórico, progresso, chave TMDB, PINs, o teste local e a fila de exclusões. Com internet faz o backup antes.
- **Reassociação**: no próximo Atualizar o `enroll` responde `recovery_required`; a TV chama
  `POST /portal/v1/devices/recovery/self` (identidade + código, só no corpo). O serviço reaproveita a rotação
  write-ahead `revoke`: mesmo `deviceId` e ID exibido, chave/código/bearer novos, sessões e QR antigos derrubados.
  Limites: 5/h por identidade, 20/h por IP, 200/h global; recusa uniforme `invalid_credentials`. Reinstalação (sem
  lembrete) continua pela recuperação no site (069).
- **Backup de uso**: `devices/{id}/backups/current` (só a última versão), payload cifrado (`usage-backup/v1`),
  ≤ 512 KB (a TV corta histórico antigo antes de favoritos/progresso). Rotas da TV: `PUT/GET /device/backup`,
  `GET /device/backup/summary`, `DELETE /device/backup` (20 PUT/h). Painel: `GET/DELETE /backup` (só data e
  contagens). Sobe no fim do Atualizar de listas e no botão "Fazer backup agora" — nunca sozinho.
- **Nunca sobrescrever backup não decidido**: logo após um pareamento novo a TV pergunta o resumo; havendo backup,
  oferece "Restaurar backup de <data>?" e não sobe até a pessoa decidir. Restaurar mescla por lista (o mais recente
  vence); dados de lista ausente ficam pendentes por 5 dias. A chave TMDB do backup só entra se a TV não tiver chave.
- **Apagar** (TV ou site) desliga o envio automático: a TV manda `expectExisting` e o serviço responde 404 sem
  recriar; o backup volta só com "Fazer backup agora".
- **Publicação**: publicar a API (rotas novas) antes de instalar o pacote na TV. Rollback da API: revisões
  anteriores dos dois serviços; documentos de backup antigos ficam inertes.

## Compra por Pix na TV e código de recuperação no portal (feature 073)

- **Pix na TV**: "Comprar licença" (bloqueio e Portal & licença) chama `POST /portal/v1/device/orders/pix`
  (`{renew, requestId}`). O serviço cria um Pix pela **API de pagamentos** do Mercado Pago (`POST /v1/payments`,
  `payment_method_id: pix`, `X-Idempotency-Key = sha256(orderId/tentativa)`, prazo de 30 min) no **mesmo pedido
  pendente** da TV e devolve só o copia-e-cola (a TV desenha o QR). Reabrir com ≥ 60 s de folga reaproveita o Pix sem
  chamar o provedor; vencido devolve `expired` e só "Gerar novo Pix" (`renew: true`) cria outra tentativa.
  Respostas `no-store`; o copia-e-cola nunca vai para log, erro, `repr` ou portal e é apagado quando o pedido termina.
- **Recebimento**: só pelo Atualizar (ADR-016). `POST /device/orders/pix/refresh` concilia o pedido sob demanda
  (independe do webhook/worker; 12/min por TV) e, aprovado, a TV busca a licença no refresh de entitlement de sempre.
- **Configuração**: `CCPLAY_PORTAL_PIX_PAYER_DOMAIN` (e-mail sintético `tv-<hash>@domínio`, sem dado pessoal) e
  **chave Pix cadastrada** na conta Mercado Pago. Sem o domínio ou com `checkout_enabled` falso, a rota de Pix
  responde 503 (a venda continua desligada fora do staging de teste).
- **Dois pagamentos no mesmo pedido** (Pix na TV + cartão no portal): o segundo vira pedido derivado (`s…`, com
  `parentOrderId`) e concede +12 meses; estorno dele afeta só a concessão dele (acha o pedido pelo `paymentClaims`).
  Cancelamento/expiração de uma tentativa de Pix antiga não cancela o pedido corrente.
- **Portal**: `GET /session/device` traz `pendingOrder` (Pix válido ou checkout aberto, sem copia-e-cola); a aba
  vira "Comprar licença" (teste) ou "Renovar licença" (licença paga).
- **Código de recuperação no portal** (constitution 1.13.0 (i)): no Atualizar, a TV envia o código que guarda para
  `PUT /device/recovery-code/escrow` quando a versão mudou; o serviço confere HMAC + versão e guarda uma cópia cifrada
  em `devices/{id}/recoveryEscrow/current` (`recovery-code/<versão>`). O painel revela por
  `POST /session/recovery-code` (CSRF, `no-store`, 5/10 min) só se a cópia é do código corrente; senão `409
  not_escrowed` ("aperte Atualizar na TV"). Rotação/recuperação tornam a cópia inerte até o próximo Atualizar.
- **Leituras concorrentes do painel** (correção feita na 073): a sessão é validada por leitura e `lastSeenAt` é tocado
  com escrita otimista serializada por sessão no processo; `/session/device` não grava no dispositivo. Antes, rajadas
  de GETs davam "Transaction lock timeout" no Firestore.
- **Publicação**: API (rotas novas) antes do pacote da TV. Rollback: revisões anteriores; pedidos com campos `pix*` e
  documentos `recoveryEscrow` ficam inertes para a versão antiga.

## Domínio próprio: `portal.ccplaytv.com` (2026-10-14)

O portal responde em **https://portal.ccplaytv.com** (o endereço `run.app` do Cloud Run continua existindo, mas o
serviço só aceita a origem do domínio próprio em requisições de navegador com mutação).

| Peça | Valor |
| --- | --- |
| Registrador / DNS | Wix (`ns4.wixdns.net`, `ns5.wixdns.net`); o site Wix em `ccplaytv.com` e `www` não foi tocado |
| Verificação de propriedade | registro TXT `google-site-verification=…` na raiz (Search Console, propriedade de domínio, conta `johnscosta2@gmail.com`) |
| Mapeamento | Cloud Run *domain mapping* `portal.ccplaytv.com → ccplaytv-portal` (us-central1); certificado gerenciado |
| DNS do subdomínio | CNAME `portal` → `ghs.googlehosted.com` (TTL 30 min) |
| Origem pública | `CCPLAY_PORTAL_PUBLIC_ORIGIN=https://portal.ccplaytv.com` em `ccplaytv-portal` (rev. `00018-nx5`) e `ccplaytv-portal-jobs` (rev. `00017-kxv`) |
| TV | `build:tizen:commercial` com `VITE_PORTAL_ORIGIN` e `VITE_PORTAL_SITE_URL` = `https://portal.ccplaytv.com` |

**Por que domain mapping e não Firebase Hosting**: o Hosting só repassa o cookie `__session` ao Cloud Run, e a sessão do
painel usa outro cookie (`Path=/portal/v1`).

**Origem exata**: `auth.py` exige que o cabeçalho `Origin` de requisição de navegador com mutação seja exatamente a
origem pública. Trocar a variável antes de o domínio responder derruba o site; por isso a ordem é domínio com TLS
válido → variável nos dois serviços → pacote da TV. A TV (`file://`, `Origin: null`) não é afetada pela origem, mas
o QR e o endereço mostrados vêm de `VITE_PORTAL_SITE_URL`.

**Rollback**: voltar `CCPLAY_PORTAL_PUBLIC_ORIGIN` ao `run.app`
(`gcloud run services update <serviço> --update-env-vars=CCPLAY_PORTAL_PUBLIC_ORIGIN=<origem>` ou `update-traffic` para
`ccplaytv-portal-00017-664` / `ccplaytv-portal-jobs-00016-dhq`) e reinstalar o pacote anterior da TV. Sessões abertas
no endereço antigo caem (cookie preso ao host); a licença e as listas não são afetadas.

**Verificação feita**: `smoke-staging.ps1` e `smoke-sources.ps1` no domínio novo (aprovados); `Origin` do domínio novo
aceito e o do `run.app` recusado (403) em `POST /sessions/manual`. Os `BaseUrl` padrão dos scripts de `infra/portal/`
passaram para o domínio.


## Portal redesenhado, chave TMDB e ID lembrado (feature 077, ADR-020)

**Casca do portal.** Quem entra vê três destinos — **Listas**, **Licença** e **Ajustes** — e, fixo no topo, o resumo da TV (ID, licença e último contato). No celular (< 960 px) a navegação é a barra inferior; a partir de 960 px é o menu lateral. Tudo é estado + `history.pushState`, sem mudar a URL (o QR com `#id=…&key=…` e o retorno do Checkout `?checkout=return` continuam como antes). Uma só leitura (`useTvData`, a cada 10 s e só com a aba visível) alimenta todas as telas. Em **Ajustes**: Chave TMDB, Backup, Código de recuperação, Recuperar acesso, Ajuda e Sair.

**ID lembrado.** Depois de uma entrada bem-sucedida (manual ou por QR) o navegador guarda **só o ID** da TV em `localStorage["ccplay-portal-last-device"]`; a chave do dispositivo, a sessão e o CSRF nunca. A próxima entrada já vem com o ID preenchido e o foco na chave; **Usar outra TV** apaga o ID lembrado. Sem `localStorage` o portal funciona igual, só não lembra.

**Chave TMDB pelo portal (constitution 1.15.0, exceção (j)).** A pessoa cola a própria chave TMDB em Ajustes → Chave TMDB; o portal a envia no corpo de `PUT /portal/v1/integrations/tmdb` e **nenhuma resposta a devolve**. O serviço guarda cifrado (`devices/{id}/integrations/tmdb`, contexto `(device_id, "tmdb-key", operation_id)`), **uma operação pendente por TV**, e a entrega só à mesma TV (`GET /device/integrations/tmdb`, bearer, sem `Origin`) no passo `integrations` do **Atualizar de listas** — entre o `pull` e o `snapshot`. A TV testa a chave no TMDB, grava pelo caminho normal (`saveTmdbKey`) e responde em `POST /device/integrations/tmdb/ack` só com `applied`, `rejected` ou `retry` (motivo de lista fechada). O portal mostra o estado real (Não configurada, Configurada na TV, Aguardando a TV, Aplicada na TV, Recusada pelo TMDB) a partir do estado do serviço e de `integrations.tmdb` (`none|configured`) que a TV publica no snapshot; TV antiga sem esse campo aparece como "desconhecida".

- **Retenção e limpeza:** o envelope é apagado ao aplicar, recusar, cancelar (`DELETE /integrations/tmdb/pending`), substituir, expirar (7 dias) e quando a chave de acesso muda (`auth_epoch`), na próxima leitura. O documento mantém só o último resultado (`last_*`), nunca a chave.
- **Limites:** navegador 10 mutações/hora por TV; TV `tmdb-pull` 3 por 10 s (limite próprio — o do `pull` das listas recusaria o pedido logo depois dele) e `tmdb-ack` 20 por minuto; recusa uniforme 429.
- **Incidente de chave:** a chave é gratuita e revogável pela própria pessoa no TMDB; para zerar uma pendência basta cancelar no portal. Nenhum log, resposta ao navegador, URL ou armazenamento do navegador contém a chave (testes `api/tests/portal/test_tmdb_integration.py` e `portal-web/e2e/tmdb.spec.ts`).

**Testes do portal.** Playwright com o servidor de dev já no ar (`cd portal-web; npm run dev`, porta 5174). O projeto `default` roda os specs e os contratos; `mobile` (360), `tablet` (768) e `desktop` (1280) rodam `layout.spec.ts` (sem rolagem horizontal, alvos ≥ 44 px no toque e ≥ 36 px no PC, nomes acessíveis, navegação e resumo no lugar certo, em pt/en/es; 320 px só no `mobile`). O serviço usa o emulador do Firestore em `127.0.0.1:8085` com `PORTAL_TEST_FIRESTORE=1` (veja "Gates e referências"); não rode junto da pilha `npm run dev:portal`.