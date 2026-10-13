# ADR-013: Portal de controle serverless no Google Cloud

## Status

Aceita para arquitetura do serviço de controle. Atualiza ADR-003 apenas quanto ao banco deste serviço e ADR-008/ADR-010 quanto ao controle remoto e à retenção de configurações fornecidas no portal. Não substitui a constitution: T001 da feature 069 continua aberto para compatibilização normativa antes dos fluxos sensíveis e do bloqueio comercial. Não autoriza lançamento ou provisiona recursos.

## Data

2026-10-11.

## Contexto

O usuário escolheu FastAPI + Firestore, infraestrutura Google Cloud com faturamento habilitado e prioridade às franquias gratuitas. Piloto de 10–50 TVs; referência de R$35/mês, mantendo serviço ativo e avisando o responsável se houver previsão de excedente. Aceita hospedagem nos EUA e transferência internacional. Quer gestão permanente de configurações, compra anual avulsa e recuperação manual após reinstalação. Confirmou remoção de KMS/Secret Manager e ausência de upload de M3U: guardar apenas a URL no serviço.

## Decisão

- Cloud Run, proposta regional us-central1, container Python/FastAPI servindo o build estático React na mesma origem HTTPS. Cobrança por requisição, mínimo zero instâncias; configuração inicial proposta de 1 vCPU/512 MiB, máximo duas instâncias, sujeita a medição. Não usar keep-alive. URL HTTPS fornecida pelo serviço no piloto, sem domínio ou load balancer obrigatório.
- Firestore Standard/Native, banco elegível à franquia gratuita na mesma região. SDK Python via identidade de serviço/ADC do Cloud Run, sem arquivo JSON de chave Google. Navegador e TV só acessam a API; sem acesso direto ao Firestore. Sem PostgreSQL/Alembic no controle; fallback congelado permanece isolado.
- Portal gerencia Xtream e M3U por URL. Não recebe, armazena ou faz proxy de arquivo M3U, catálogo ou vídeo. Download, parsing e armazenamento local existente continuam na TV. TMDB/OpenAI remotos ficam fora deste incremento.
- Configurações digitadas no portal ficam cifradas permanentemente no Firestore enquanto cadastradas. FastAPI pode decifrá-las para substituir/reencaminhar à TV autorizada; não alegar criptografia ponta a ponta opaca ao servidor. Valores existentes apenas na TV não são exportados. Browser recebe metadados e campos secretos vazios para substituição, nunca leitura das credenciais salvas.
- Criptografia de aplicação AES-256-GCM com nonce aleatório novo por escrita e AAD vinculando deviceId/sourceId/versão. Chaves de cifragem, assinatura ES256, HMAC de identidade e credenciais Mercado Pago em variáveis de ambiente privadas do Cloud Run, configuradas fora de código/imagens/Git/logs. Sem KMS e sem Secret Manager neste piloto. Acesso a configuração/revisões do serviço é acesso privilegiado. Rotação versionada e cópia protegida das chaves fora do banco são obrigatórias; não expor valores em comandos, CI ou diagnósticos.
- Sessões temporárias por QR/manual e bearer exclusivo da TV. DUID não autentica. Recuperação manual exige evidência verificável de titularidade; device ID/DUID públicos não bastam. Revogar acessos antigos, preservar licença/teste e vincular novas credenciais sem restaurar catálogo. Procedimento detalhado em T007/T039 antes de produção.
- Mercado Pago Checkout Pro, anual avulso BRL/Pix/cartão, preço ainda pendente. Só confirmação autenticada ao provedor concede licença; Firestore usa transações e documentos determinísticos para unicidade, revisão, outbox e ledger. Chamadas externas fora da função transacional, que pode ser repetida.
- Licença JWS ES256 local válida até o vencimento; consulta diária quando online recebe renovação/revogação. Falha de rede não invalida licença vigente. Sincronização imediata/10s somente com QR/configuração/compra aberta; normal a cada 24h. Limitação de relógio offline permanece explícita, sem promessa de DRM inviolável.
- Cloud Scheduler dispara lote horário autenticado por OIDC/IAM. Isolar endpoint interno em serviço Cloud Run privado, usando a mesma imagem e identidade mínima; a API pública deve recusar chamadas ao tick mesmo com sessão web/TV. Sem token estático de cron nem processamento durável após resposta. Fila/leases no Firestore.
- Backup nativo diário Firestore, retenção inicial proposta de 7 dias; objetivo RPO <=24h com monitoramento de falhas e restauração manual ensaiada, RTO a medir. Inclui ciphertext permanente, não chaves. Após restore, reconciliar pagamentos/revogações e não reabrir sessões expiradas nem ressuscitar configurações excluídas. Exclusão nos backups segue retenção, não apagamento instantâneo. T039 define responsável e procedimento.
- Alertas sugeridos em R$17,50/R$28/R$35 e previsão de excedente; não desligar serviço ao superar orçamento. Limites de escala/entrada, retenção de logs e proteção contra abuso reduzem consumo, mas não garantem teto financeiro. Não contratar instâncias mínimas, PITR, WAF, domínio ou outros adicionais por padrão.

## Alternativas Consideradas

### Render Free + Supabase + cron Cloudflare

Não mantida: três provedores e suspensão por ociosidade do Render com despertar de aproximadamente um minuto, ameaçando metas interativas. Supabase/PostgreSQL divergiriam do banco escolhido.

### Workers TypeScript + D1

Não escolhida: usuário preservou Python/FastAPI e escolheu Firestore. Economia potencial não justifica impor outra stack.

### KMS e Secret Manager

Removidos por decisão explícita de simplificação. Variáveis privadas reduzem serviços, mas transferem guarda/rotação/recuperação das chaves à operação. Credenciais continuam confidenciais; retirar cofres não autoriza texto claro no banco ou exposição no cliente.

### Payload efêmero browser → TV e storage de M3U

Não atende gestão permanente/recuperação manual escolhidas. Arquivo M3U não faz parte do escopo; URL suficiente evita bucket, multipart, chunks e limites de arquivo remoto.

## Consequências

### Positivas

- Mantém FastAPI; concentra operação em um provedor e elimina banco SQL/bucket de payload do serviço de controle.
- Consulta diária e configurações pequenas favorecem franquias; catálogo/playback continuam locais.
- Recuperação manual evita construir autoatendimento adicional no piloto.

### Negativas

- Comprometimento do runtime/configuração pode expor chaves e credenciais; cifragem protege dump do banco, não servidor comprometido.
- Firestore exige desenho específico de transações/índices/limites, sem constraints SQL.
- Cold start, câmbio, impostos, builds, imagens, logs, backup e excedentes precisam medição. R$35 é referência, não teto garantido.
- Backup inclui configurações cifradas; apagar uma configuração ativa não remove imediatamente cópias anteriores. Recuperação manual exige operação e evidências.

### Caminho de Migração / Evolução Futura

Rever cofres gerenciados quando equipe/acessos, exigências de auditoria ou rotação justificarem. Rever escala/região/instâncias mínimas após medições. Migrar dados com versões e preservar ledger, revisões e identidade; nunca exportar segredos locais existentes para preencher o portal.

## Fontes

Consultadas na revisão de 2026-10-11: [Cloud Run](https://cloud.google.com/run/pricing), [Firestore](https://cloud.google.com/firestore/pricing), [backups](https://docs.cloud.google.com/firestore/native/docs/backups), [Scheduler](https://cloud.google.com/scheduler/pricing), [Render Free](https://render.com/docs/free). Franquias não são resultado de benchmark nem promessa de custo.

**Atualização (feature 069, sdd-plan 2026-10-11):** o usuário fixou preço anual de R$35 por TV (BRL 3500), distinto do orçamento mensal de infraestrutura. A referência anterior a preço pendente é histórica. O plano detalha exclusão bidirecional e journal mínimo independente do restore, sem credenciais ou arquivo M3U, para impedir restauração de configurações excluídas; não altera os gates normativos ou autoriza provisionamento.

**Atualização (feature 069, resolução de pendências 2026-10-11):** constitution 1.8.0 formaliza as exceções restritas do portal/licenciamento/convite efêmero e exibição protegida de código. Por nova decisão do usuário, recuperação manual da licença fica substituída por autoatendimento no próprio site, com código privado que pode guardar/fotografar e desafio da mesma TV; revogar acessos/código antigos e preservar teste/validade. Não transfere licença nem recupera catálogo apagado. Restauração operacional de backup permanece manual. Detalhes em spec/plan/logic da 069; nenhuma implementação/provisão declarada.

**Atualização (feature 069, decisão de vencimento 2026-10-11):** por decisão explícita do usuário, licença vigente é exigida ao entrar na lista. Se vencer dentro dela, navegação/reprodução continuam até sair para o seletor ou fechar o app; nova escolha/RETURN/reabertura revalidam localmente. Sem autorização persistida de sessão. Revogação confirmada mantém encerramento controlado. Constitution 1.9.0 formaliza essa expansão delimitada; catálogo e player continuam locais.

**Atualização (ADR-014, 2026-10-13):** a entrada manual no painel passa a ser por ID do dispositivo no formato MAC + chave numérica permanente de 10 dígitos exibida na tela Adicionar da TV, e o painel autenticado da própria TV pode ler os valores salvos das listas dela para edição. Ver ADR-014 e constitution 1.10.0.
