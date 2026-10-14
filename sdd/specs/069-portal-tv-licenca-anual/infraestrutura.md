# Infraestrutura e custos — 069

Revisão vigente de 2026-10-11, após entrevista e aceite do usuário. Ver ADR-013. Substitui Render/Supabase/Cloudflare e a meta obrigatória US$0. Nenhum serviço provisionado; Constitution 1.8.0/T001 formaliza exceções restritas; implementação ainda não validada.

## Composição

| Componente | Escolha |
| --- | --- |
| Provedor/região | Google Cloud; proposta us-central1/Iowa, priorizando custo. Usuário aceita EUA/transferência internacional. |
| Portal/API | Cloud Run público, container Python/FastAPI servindo React estático na mesma origem HTTPS; URL gratuita do serviço. |
| Processamento | Por requisição, mínimo zero instâncias. Proposta inicial 1 vCPU / 512 MiB, máximo duas instâncias; medir memória/cold start antes de produção. |
| Banco | Firestore Standard/Native, banco elegível à franquia, mesma região. SDK Python via identidade/ADC, sem chave Google em arquivo ou acesso direto do cliente. |
| Agendamento | Cloud Scheduler horário → serviço Cloud Run privado de jobs, mesma imagem, autenticação OIDC/IAM. A API pública nunca executa tick. |
| Segredos | Variáveis de ambiente privadas configuradas fora do Git/imagem/CLI com valores expostos. Sem KMS/Secret Manager. |
| Pagamento | Mercado Pago Checkout Pro; anual avulso BRL 3500 (R$35)/12 meses/uma TV/Pix/cartão. Tarifas por venda separadas da infraestrutura. |
| Backup | Nativo Firestore diário, proposta retenção 7 dias, restauração manual; cópia protegida das chaves separada. |

Sem PostgreSQL, Redis, worker residente, bucket de arquivos M3U ou API fallback no runtime do portal. Backend importa apenas app.portal. Região, sizing e retenção são propostas técnicas a validar, não recursos já criados.

## Escopo e dados

Portal cadastra/edita/remove Xtream e M3U por URL. Guarda apenas parâmetros Xtream ou URL cifrados e metadados; não baixa/salva arquivo M3U, catálogo ou vídeo. A TV baixa/importa a URL diretamente usando lógica e armazenamento locais existentes. Não criar m3u_file, upload/chunks remotos ou infraestrutura S3. Gestão remota TMDB/OpenAI fora deste incremento.

Configuração cifrada permanece enquanto cadastrada, inclusive após ACK. Pendência de create/update tem prazo máximo de 7 dias; expirar entrega não apaga a configuração permanente. Reenvio exige nova operação/revisão válida e pode reutilizar configuração guardada autorizada. Remover configuração apaga segredo ativo e cancela entregas pendentes, preservando tombstone sem segredo para replay. FR-033 define remoção também no portal: a TV grava tombstone/outbox atômicos, envia exclusões antes de receber comandos e conserva a intenção até ACK. Remoção pelo portal com TV offline não expira em 7 dias: elimina segredo/cancela pendências e aguarda confirmação local. Snapshot nunca recria fonte; sourceId removido não é reutilizado.

FastAPI cifra/decifra usando AES-256-GCM e chaves versionadas da aplicação em ambiente privado, nonce novo/AAD por destino/fonte/versão. HTTPS obrigatório; browser só recebe metadados e mantém segredo vazio na edição. Não buscar segredos que já existiam só na TV. Chave privada ES256 assina licença; apenas chave pública chega ao cliente. Chaves/token Mercado Pago/HMAC separados por finalidade. Controle de acesso ao Cloud Run inclui configuração e revisões antigas; rotação/redeploy e cópia de recuperação protegida precisam de procedimento, sem logs de configuração ou erros brutos.

## Execução durável

Firestore armazena operações/outbox/ledger; transações usam documentos determinísticos para idempotência e unicidade. Não tratar Firestore como PostgreSQL: sem Alembic, SELECT FOR UPDATE ou unique SQL. Transações podem repetir callbacks; não fazer pagamento, importação ou outros efeitos externos dentro delas.

Webhook valida/persiste evento mínimo e tenta reconciliação limitada. Pendência fica durável para lote horário; consulta autenticada de pedido pode antecipar reconciliação do próprio pedido com rate limit. Jobs usam lease transacional, lote limitado, timeout e retries. Não devolver 202 e depender de BackgroundTasks para terminar trabalho. OIDC restringe invocação do serviço privado ao Scheduler; tick na API pública recusado, SPA não captura API/webhook/internal.

Licença vigente é validada localmente ao entrar na lista. Vencimento durante sessão já aberta não a interrompe; a próxima entrada revalida, inclusive por RETURN do seletor ou após reabrir o app. Checagem normal 24 h recebe renovação/revogação quando online; falha de rede mantém licença local. Imediato/10 s apenas com QR/configuração/compra aberta, sem polling por foco/playback. Revogação pode levar até próxima consulta bem-sucedida e, offline, ao próximo contato; vencimento local só impede nova entrada, sem limite adicional de duração da sessão já admitida. Recuperação após reinstalação é pelo próprio site, com código privado guardado pelo usuário, desafio da mesma TV e rotação/revogação de acessos antigos (logic §7); não prometer restauração de catálogo.

## Franquias e orçamento

Piloto 10–50 TVs, referência **R$10/mês**. Faturamento habilitado foi autorizado. Manter serviço ativo e alertar responsável se previsão/consumo ultrapassarem referência; não cortar licença, compra ou configuração automaticamente por orçamento. Limites de instâncias/entrada/logs são proteção operacional, não teto de fatura. O budget atual usa alertas em 50%/90%/100%/150% e créditos incluídos; o serviço permanece ativo.

- Cloud Run por requisição: 2 milhões requests/mês, 180 mil vCPU-segundos e 360 mil GiB-segundos, referência de preços us-central1; cotas compartilhadas conforme faturamento. [Preços](https://cloud.google.com/run/pricing).
- Firestore: banco elegível com 1 GiB, 50 mil leituras/20 mil escritas/20 mil exclusões por dia e 10 GiB saída/mês. Leituras por índices/consultas e retries também contam. Backup/restore/TTL/PITR não têm franquia gratuita. [Preços](https://cloud.google.com/firestore/pricing).
- Scheduler: 3 jobs gratuitos por conta de faturamento; execução invoca Cloud Run normalmente. [Preços](https://cloud.google.com/scheduler/pricing).

50 TVs ×1 consulta/dia ×30 dias =1.500 consultas/mês. Exemplo de50 sessões rápidas/dia ×10 min ×6 consultas/min ×30 dias =90.000 consultas/mês adicionais. Chamadas não equivalem a documentos lidos/escritos; registrar consumo real. Builds, Artifact Registry, logs, tráfego, backup, câmbio e impostos completam orçamento; não estimar só runtime. Configurar retenção/limpeza de imagens/logs e excluir campos secretos de índices/observabilidade.

Expectativa: carga básica pequena pode ficar nas franquias de runtime/banco; não prometer custo zero ou R$35 garantidos. T043/T052 medem e T045 registra orçamento completo antes de venda. Não adicionar domínio, load balancer, NAT/VPC connector, PITR ou instância mínima por padrão. Subir máximo de instâncias exige revisão operacional de consumo, não desligamento por orçamento.

## Backup, exclusão e recuperação

Backup nativo diário inclui ciphertext das configurações permanentes e ledger, sem chaves de ambiente. Proposta retenção 7 dias; alertar falhas/idade e ensaiar restauração, objetivo RPO <=24 h, RTO a medir e responsável a nomear em T039. Não declarar garantia de 24 h só por agendamento. Preservar chaves antigas necessárias para decifrar backups durante rotação; sua perda pode inviabilizar recuperação. [Backups Firestore](https://docs.cloud.google.com/firestore/native/docs/backups).

Exclusão ativa não apaga instantaneamente backups, cuja retenção limita cópias. Restore não reabre sessões/convites expirados nem deve reenfileirar comandos destrutivos antigos; reconciliar ledger/pagamentos/revogações, exclusões e revisões recentes antes de reabrir. O procedimento precisa de registro de exclusões recuperável além do ponto restaurado para evitar ressuscitar segredos removidos. Provar essa recuperação em T039/T052 e documentar retenção/limites antes de cobrança.

## Implantação e aceite

T051 prepara Dockerfile multi-stage, .dockerignore, configurações Cloud Run/API/jobs/Scheduler/IAM e índices/versionamento Firestore, sem valores secretos ou provisionamento nesta revisão. Desenvolvimento usa Firestore Emulator, integração final banco dedicado real. Entry point isolado do fallback, sem alterar seu SQL/Alembic. HTTPS/file:// CORS, permissões mínimas, public/internal e ambientes separados precisam testes reais.

T052 prova concorrência/retries, cifragem/rotação/backup/restore, exclusão e IAM; T043 inclui amostras frias nas metas p95<=30 s recebimento e<=60 s ativação com tela rápida aberta. Cloud Run scale-to-zero ainda tem cold start; não relaxar metas por conveniência. T001 normativo concluído; T003 plataforma/tempo, T039 recuperação, T045 oferta/comercial, T046 TV e T052 infraestrutura continuam gates. Nenhum serviço criado, cobrança habilitada ou segredo real lido nesta revisão.

## Complemento do replanejamento — journal e preço

Preço comercial confirmado: **R$35 anuais por TV**, distinto da referência de **R$10/mês de infraestrutura**. T045 verifica conta/termos/oferta/retenção e orçamento, sem confundir os dois valores.

Para SC-010/SC-012, adicionar bucket Cloud Storage privado regional us-central1, sem conteúdo M3U/credenciais; somente eventos mínimos de exclusão/revogação, independentes da base Firestore restaurada. ADC/IAM create/read/list mínimos, sem overwrite/delete para runtime, append condicional por eventId/digest, lifecycle 30 dias. Não ativar retenção bloqueada irreversível no piloto. Write-ahead antes do ACK remoto; Firestore fence→journal→finalização, sem I/O no callback transacional. Falha conserva pendência/outbox, sem confirmação falsa. Jobs retomam crash. Fluxo vinculante em logic §3/data-model.

Backup Firestore diário (7 dias), journal (30 dias) e cópia protegida de chaves são três componentes distintos. Restore em base nova/isolada, somente backup <=7 dias e journal íntegro; replay de exclusões/revogações + reconciliação Mercado Pago + revogação das sessões antes de tráfego. Não reenfileirar configuração antiga automaticamente. Medir RPO/RTO; monitorar idade do último backup e falhas, avisando mantenedor quando >24 h. Falha generalizada ou perda das chaves/journal exige recuperação manual, sem declarar SC-010 aprovado.

Incluir operações/armazenamento/egress do journal e base temporária de restore na planilha de custos; não confundir baixo volume com gratuidade garantida. Backups/restore Firestore são cobrados além da franquia. A URL Cloud Run evita domínio/load balancer pagos. [Precondições Storage](https://docs.cloud.google.com/storage/docs/request-preconditions), [consistência](https://docs.cloud.google.com/storage/docs/consistency), [preços Storage](https://cloud.google.com/storage/pricing), [backup/restore Firestore](https://cloud.google.com/firestore/docs/backups).
