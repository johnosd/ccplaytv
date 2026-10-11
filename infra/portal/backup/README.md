# Backup e restauração — preparação local

manage-backup.ps1 gera argumentos por padrão; -Apply executa no projeto informado. Nenhum comando de nuvem foi executado nesta entrega. IAM administrativo deve ficar separado do runtime; use ADC.

Ação schedule: frequência diária e retenção de sete dias. Ação inspect: considera apenas backups READY da base informada e falha acima de24h; conectar a um monitor/alerta real permanece pendente. Ação restore: exige destino novo portal-restore-* e criptografia padrão Google, sem KMS próprio.

Exemplo somente de preparação:

powershell -NoProfile -ExecutionPolicy Bypass -File infra/portal/backup/manage-backup.ps1 -Action schedule -ProjectId projeto-homologacao

Restaurar a base não autoriza reabrir tráfego. T039/T052 continuam abertas: replay validado de journal, expurgo de credenciais deletadas, pisos de auth/licença, verificador de recuperação mais recente, conciliação autenticada de pagamentos e ensaio RPO/RTO precisam terminar na base isolada antes de trocar a conexão. Não restaurar sobre a base em uso. Não executar reinstalação na TV atual.

Registrar início do incidente, snapshotTime, fim de restore/replay/lookup, primeiro contato recuperado e contagens de fontes/grants rejeitadas. RPO real = incidente - snapshotTime; RTO real = contato recuperado - incidente. Frequência diária não garante RPO24h. Inspecionar agendamentos antes de repetir schedule; nunca remover o anterior automaticamente.

Referências: [agendamento](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/backups/schedules/create), [restore em nova base](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/restore), [backups Native](https://docs.cloud.google.com/firestore/native/docs/backups). Revisadas em2026-10-11. Scripts preparados não comprovam durabilidade ou custo.

O decoder local `app.portal.restore_journal.decode_journal_object` recusa objeto fora do destino, digest divergente, representação não canônica, campos desconhecidos, duplicação JSON e tamanho superior a 8192 bytes. Dez regressões locais cobrem o formato; isso não autentica o autor nem substitui IAM/imutabilidade do bucket. O replay e a conciliação ainda não foram implementados/ensaiados; manter tráfego fechado após restore.
