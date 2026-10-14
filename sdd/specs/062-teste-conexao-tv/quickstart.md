# Validação manual — Teste de conexão na TV

## Pré-requisitos e gates automatizados

Em `tv-web/`, executar `npm run lint`, `npx tsc -b --pretty false`, `npm run test`, `npm run build`. Na raiz, executar `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 062-teste-conexao-tv`. Contratos precisam estar verdes na implementação; durante o planejamento, os cinco vermelhos são esperados.

Manter `npm run dev` ativo e rodar `npm run test:e2e` em `tv-web/` antes de solicitar `tizen-tv`/`tizen-emulator`. Incluir o roteiro novo `tv-web/e2e/teste-conexao-tv.mjs` no runner. Sem backend como pré-requisito.

## Navegador

1. Sem fonte/chave, abrir Configurações → Integrações & BYOK → Teste de conexão. Montar/focar/consultar não gera requisições de medição. Abrir mostra destino, natureza HTTP, limite 30s/100MB e Iniciar focável.
2. SELECT inicia uma execução, com etapas reais e Cancelar focável. SELECT repetido não duplica tráfego. Resultado tem métricas válidas, unidades, data, destino, situação e motivo; não há qualidade inventada.
3. RETURN/Cancelar fecha primeiro a camada, aborta transfers e devolve foco/scroll ao card. Network confirma encerramento; repetir não sobrepõe execuções.
4. Repetir com resultado válido, reiniciar app e trocar lista: somente último resultado válido permanece. Cancelar/falhar totalmente não apaga anterior. Limpar dados do app/origem remove singleton.
5. Pelo dock, SELECT leva ao mesmo card, sem medir. Fechar diálogo volta ao card; voltar de Configurações restaura dock/posição. Foco no dock apresenta somente resumo local com data ou ausência.
6. Simular offline, HTTP 429, serviço indisponível, stream incompatível, timeout/orçamento e falha de armazenamento. Há tentativa manual/saída. Resultado atual sobrevive à falha de guarda e aviso não expõe detalhes internos.
7. Conferir pt/en/es, nomes acessíveis, tokens Spectrum e navegação só com setas/SELECT/RETURN. IA/clima permanecem soft disabled. Não há consulta externa por foco, reporte de resultado ou dado de fonte na requisição.

## TV física — obrigatório (FR-023 / SC-007)

Depois de automatizados/E2E, instalar app empacotado usando `tizen-tv`. Registrar modelo, Tizen/Chromium, origem, data, destino, duração, volume solicitado/recebido e métricas, sem credenciais/URLs de fonte. Anotar tráfego concorrente conhecido.

- Sucesso real com as três métricas; confirmar CORS de `file://`, leitura incremental e tamanho `bytes` atendido.
- Encerramento por limite com motivo e métricas disponíveis; se precisar de instrumentação para reproduzir, identificá-la no relatório sem adulterar números da UI ou elevar os tetos.
- Cancelar durante corpo de download, comprovar liberação de rede e repetição sem requisições anteriores.
- Sair, ocultar/suspender, retornar: não reinicia; RETURN conserva origem e scroll.
- Navegar da reprodução até Configurações; confirmar encerramento pelo percurso atual. Guard de reprodução residual bloqueia início sem fechar/retomar mídia por conta própria.
- Reiniciar aparelho/app, conferir singleton e memória sem retenção de corpos grandes.

Registrar evidência em `sdd/specs/062-teste-conexao-tv/validation-tv.md`, criada pelo execute. Browser/emulador não encerram esses riscos. Gate físico pendente impede declarar entrega, salvo decisão explícita do usuário registrada no plano.
