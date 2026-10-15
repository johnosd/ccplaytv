# Resolução de pendências — 2026-10-11

Pedido: resolver pendências do replanejamento, incorporando a resposta do usuário: código da licença visível para guardar/fotografar e recuperação pelo próprio site, sem atendimento.

Constitution 1.8.0 emenda restritamente controle remoto de configurações fornecidas no portal, retenção/backup cifrados, licença/checkout externo e exibição explícita de código/device key. T001 documental concluída; não prova conformidade de runtime.

Spec FR-031/SC-011/US2 e plano/tasks/modelo/API/logic/quickstart/infra/research/handoff alinhados. Código privado >=128 bits, HMAC no servidor, desafio temporário da mesma TV, confirmação, limite de tentativas, rotação e journal write-ahead. Entrega/ACK/retomada explicitados; código perdido sem acesso anterior não recupera automaticamente. Renovações/trial/vencimentos não mudam. Atendimento/canal/SLA deixam de ser requisitos; restore de backup permanece manual.

Preço anual R$35 corrigido nas seções finais. Retenções operacionais definidas no data-model; T045 continua obrigatória para publicar política/termos e verificar conta/oferta antes da venda. Nenhum parecer de conformidade legal é declarado.

Não comprovado nesta revisão: DUID/ES256/relógio/reinstalação na TV, infraestrutura/pagamento real, backup/restore e medições. São gates de execução T003/T035/T039/T043/T045/T046/T052, sem cobrança habilitada.

Diagnóstico A005: comando Vitest com reporter hanging-process reproduziu 5 falhas esperadas por not implemented, 138 FILEHANDLE sem stack e timeout de encerramento de dois servidores Vite após 10000 ms (15,47 s de execução). Isso não identifica a causa raiz nem autoriza elevar timeout. Nenhum contrato/lock/stub alterado. A investigação do runner permanece explicitamente aberta, sem alterar gates de aceite.

Validação documental: check-prerequisites -Stage execute PASS; check-contract-tests PASS (5 contratos íntegros); update-feature-status confirmou Planejada, 1/61 (somente T001). Contratos permanecem vermelhos por not implemented, conforme planejamento.

Reprodução adicional A005: npm.cmd exec -- vitest run src/lib/portal/portal-tv-licenca-anual.contract.test.ts --project node; 5 falhas esperadas, 15,28 s, mesmo close timed out after 10000ms, agora um servidor. Instalados Vitest 5.0.0/Vite 8.3.0. Selecionar somente Node não resolve. Causa raiz ainda não demonstrada; T041 passa a rastrear a correção antes do aceite. Issue upstream semelhante existe ([Vite #23143](https://github.com/vitejs/vite/issues/23143)), mas não se demonstrou que seja a causa local; nenhuma atualização de dependência ou workaround aplicada.
