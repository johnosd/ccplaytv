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

Configurações fornecidas no portal ficam cifradas enquanto cadastradas. Browser
nunca lê segredo salvo. Exclusão elimina versões/cancela entregas, com tombstone
e journal para não ressuscitar depois de restore. Somente Xtream/M3U URL;
nenhum bucket de M3U, catálogo, histórico ou credenciais exclusivas da TV.

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
independente de **R$35 por mês**, piloto de 10–50 TVs. Alertas em 50/80/100%
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

Atenção no restore: trocar SERVICE_RECOVERY_EPOCH invalida acessos antigos. Não atualizar recoveryEpoch dos devices em lote mantendo hashes de acesso antigos: o repositório recusa essa transição. A reemissão precisa reservar fence e trocar bearer/key com epoch maior antes de remover o bloqueio. Sessões/convites antigos continuam com epoch global anterior. T039/T052 devem ensaiar esse caminho; preparação local não autoriza reabrir tráfego.


## Recuperação e manutenção paginada — implementação local

`POST /recoveries/exchange` consome convite recover e abre cookie ccplay_portal_recovery, com namespace HMAC distinto e duração máxima do desafio5min. Não abre sessão manage. Confirmação exige CSRF/Origin/código/destino/Idempotency-Key e devolve só operationId/state; TV consulta por claimId com claimSecret no bearer exclusivo. Persistir desafio antes do QR, novas credenciais antes do ACK. Código consumido só retoma operação original não reconhecida, mesma identidade, até24h; rodada nova não estende esse prazo.

Worker privado continua limitado a5jobs/180s, lease240s, sem trabalho após resposta. Job retention-global percorre páginas de20documentos com cursor durável, retomável em outra instância; ciclo completo agenda próxima varredura em1h. Um tick não promete limpar todo o banco. Validade lógica de convites/sessões/envelopes/códigos/operações é verificada no acesso, independentemente do atraso físico do expurgo; cadência/backlog/IAM/índices e custo reais serão medidos em T043/T052. Scheduler horário e preparação local não demonstram remoção física pontual aos5min.

Expurgo remove envelopes expirados e verificadores consumidos após24h, conserva floors/intents, configuração corrente e deletes pendentes. Journal tardio não recria envelope expurgado: finalize usa a releitura CAS do intent e emite resultado expired sem ciphertext; prova privada ainda válida pode retomar a mesma operação com uma nova rodada. Expiração create/update libera referência uma única vez; versão órfã só sai se não for corrente nem referenciada. Recibos/digests não são apagados prematuramente; compactação30dias com claims será integrada ao repositório de configuração T013/T022.

Agente TV/transporte integrados ao App (T018). 24h/retries1-5-15min persistidos; tela rápida10s, falha com jitter/backoff até60s (Retry-After maior prevalece). Background/offline aborta a requisição; deadline absoluto reconcilia timer atrasado mesmo sem visibilitychange no standby. A prova física atual não demonstrou suspensão de callbacks no standby: T046 mede integração.

## Build e licença local — implementação verificada localmente

O agente está integrado ao App: consulta24h, modo rápido10s apenas nas telas permitidas. O player não consulta rede de licenciamento. O pacote comercial usa npm run build:commercial ou build:tizen:commercial, com VITE_PORTAL_ORIGIN HTTPS e VITE_LICENSE_PUBLIC_KEYS contendo somente o mapa kid→JWK pública ES256. A chave privada fica no servidor; nunca buscar chaves de confiança automaticamente do endpoint público. Build pessoal permanece para desenvolvimento e para preservar a TV atual; não é o artefato de distribuição comercial. Venda segue bloqueada em settings até os gates reais.

manage-backup.ps1 em infra/portal/backup prepara schedule/inspect/restore; sem -Apply não executa nuvem. A configuração de restauração ainda não permite reabrir tráfego: replay/expurgo/floors/reconcile e ensaio real continuam T039/T052.

## Regra vigente de vencimento — decisão 2026-10-11

Licença vigente é exigida localmente ao entrar numa lista, inclusive após importação/verificação do provedor e por RETURN do seletor. Se vencer dentro dela, o usuário mantém navegação, novas reproduções e retomada até sair para o seletor ou fechar o app. Configurações abertas dentro da sessão podem voltar ao conteúdo. Não há autorização persistida para a próxima abertura. Revogação confirmada continua encerrando a sessão. A guarda não faz HTTP por tecla nem dentro do player; agente diário/rápido permanece independente.
