# Bug Test: Erro ao abrir detalhe de qualquer série

- **Slug**: erro-ao-abrir-detalhe-qualquer-serie
- **Testado**: 2026-10-10
- **Result**: verified

## Checks Performed
| Checagem | Resultado |
| --- | --- |
| Reprodução Playwright com lista real (.env), antes da instrumentação | Dois detalhes abriram com 8 e 24 episódios; falha da TV não reproduzida. |
| Vitest diagnóstico, boundary e séries | 121/121, 13 arquivos, rerodados na fase Test. |
| Lint e arquitetura | Passaram, avisos herdados. |
| build:tizen | Passou, incluindo TypeScript e guard de arquivos. |
| Playwright do pacote final com erro de render controlado | 4/4: assinatura, sigilo, painel inteiro 1920×1080, RETURN ao catálogo. Fotografia inspecionada. |
| E2E completo | 45/46 em 305 s; fontes-estado falhou por timeout no cenário sem internet. |
| Reexecução isolada fontes-estado | 1/1 em 30 s. |
| TV 192.168.0.2 | Atualização assinada com ccplay_samsung_certificate_4 concluída; lançamento PID 5453 confirmado pelo CLI e script terminou exit 0. Sem desinstalação. |
| Reprodução original na TV / diagnóstico visível real | Pendente da fotografia do usuário. |

## Output Excerpts
- Test Files 13 passed; Tests 121 passed.
- E2E: 45/46 scripts passaram; fontes-estado isolado 1/1.
- Tizen application is successfully installed.
- Tizen application is successfully launched.

## Residual Risks
O cenário sintético valida o mecanismo de coleta, não a causa original. Não afirmar correção do bug ou aprovação visual da TV. Logs em memória limitados a 8 eventos, sem armazenamento, exportação ou envio; texto bruto de exceções não é exibido. A atualização preserva IndexedDB/localStorage pelo mesmo certificado. Instabilidade do cenário sem internet registrada, sem alterações fora do escopo.

## Recommendation
Manter aberto para diagnóstico. Usuário deve abrir a série e fotografar toda a mensagem e o painel SERIES-DIAG-01 antes de sair da tela. Usar posições junto aos hashes registrados em evidencias/pacote-diagnostico-sha256.txt para localizar a causa. Nenhum commit realizado.

## Test — iteração SERIES-DIAG-02 (2026-10-10)

Fotografia real confirma a mensagem de falha dos episódios e SERIES_QUERY ready / EPISODES_QUERY failed. Não contém a causa interna porque a iteração 01 não instrumentava o desfecho tratado no loader.

Checagens desta iteração: 136/136 testes em 14 arquivos; lint e build:tizen passaram. Playwright no pacote final, erro controlado 401 em get_series_info: 5/5 verificações, inclusive motivo de ProviderError visível, nenhum segredo, painel completo e RETURN. Fotografia sintética em evidencias/diagnostico-episodios.png inspecionada. A recusa 401 é fixture de teste, não causa atribuída à TV. E2E afetados: serie-foco-episodios, detalhe-cinema, modal-temporada, rede-lifecycle-erros — 4/4 em 25 s. Gate completo desta sessão permaneceu documentado acima; esta mudança recebeu reexecução direcionada.

Resultado continua partial: causa original pendente de nova foto com SERIES-DIAG-02. Instalação em andamento, confirmação será anexada abaixo.

Instalação confirmada: deploy-tv.ps1 -TvIp 192.168.0.2 -SkipBuild terminou exit 0; atualização com certificado existente concluída e app lançado, PID 18267. Sem desinstalar. Próximo passo: usuário abre série e envia foto completa com SERIES-DIAG-02; classificar a causa antes de aplicar correção funcional.

## Test — correção de quota / SERIES-DIAG-03 (2026-10-10)

Evidência física: a fotografia enviada pelo usuário mostra obtenção de episódios concluída e falha de gravação StorageFullError. Quota confirmada; espaço livre físico e efeito do privilégio ainda não medidos no aparelho.

141/141 testes (15 arquivos), lint e build:tizen aprovados. Reexecução crítica na fase Test: 3/3 casos de quota passaram (demais casos filtrados). Playwright no pacote final com quota nativa simulada: 8/8 verificações passaram; retry abriu detalhe depois da restauração da escrita, e RETURN restaurou catálogo. Fotografia em evidencias/quota-episodios.png. XML válido e privilégio unlimitedstorage presente.

Resultado segue partial até confirmação física de abertura com o privilégio corrigido. Gate completo em andamento; instalação e resultado serão anexados após confirmação. Nenhuma limpeza de banco nem desinstalação autorizada/executada.

Gate completo da correção: npm run test:e2e -- --jobs 3 --retry 1 terminou exit 0, 46/46 scripts passaram em 314 s; nenhuma repetição foi indicada nos resultados. Inclui fontes-estado, serie-foco-episodios, player-dev-mpegts e legibilidade-tv. Instalação da correção iniciada após o gate aprovado.

Instalação da correção concluída: deploy-tv.ps1 -TvIp 192.168.0.2 -SkipBuild, exit 0; assinatura ccplay_samsung_certificate_4, identidade 8tZqMtwANL.CCPlayTv mantida, app instalado e lançado PID 19301. O config.xml extraído em memória do WGT assinado confirma unlimitedstorage. Nenhuma exclusão de dados. Aguardar usuário abrir série para validar fisicamente o efeito; se persistir, coletar foto SERIES-DIAG-03 e distinguir quota do app de espaço físico.

## Confirmação física do usuário — 2026-10-10

Após a instalação da correção de quota com unlimitedstorage, usuário confirmou “resolvido”. Abertura de séries aprovada na TV; bug encerrado. Sem desinstalação nem exclusão de dados. Testes locais e E2E completos já aprovados na iteração 03.
