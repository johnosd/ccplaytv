# Pilha local integrada (PC) — Feature 069

Criada em 2026-10-13 a pedido do usuário: validar o fluxo no PC (`npm run dev`) antes de levar o pacote comercial à TV.

## O que sobe

`tv-web/e2e/portal-integrado-local.mjs` (opt-in, **fora** do `SUITE` de `run.mjs`: exige gcloud/emulador e `api/.venv`):

| Peça | Como | Observação |
| --- | --- | --- |
| Firestore | `cloud_firestore_emulator.cmd` do gcloud SDK, `127.0.0.1:8085` | Exige **Java 21**; o `java` do PATH é 17. O script prioriza `JAVA_HOME` (JBR do Android Studio, 21.0.10) só no processo filho |
| API | `infra/portal/dev/local_portal.py` (`development` + emulador) | Journal **em memória** no lugar do Cloud Storage (os testes da API fazem o mesmo); recusa ambiente não local |
| portal-web | `vite` em `127.0.0.1:5174`, proxy `/portal/v1` → API | Mesma origem: sem CORS e com `Origin` real |
| TV | `vite --mode commercial` em `127.0.0.1:5176`, `VITE_PORTAL_ORIGIN` = API local, `VITE_LICENSE_PUBLIC_KEYS` = chave pública gerada | Chrome com `--disable-web-security` (análogo à política de acesso do `config.xml`; a API não envia CORS) e `webapis.productinfo.getDuid` injetado |

Chaves (AES, ES256, HMAC, epoch) são geradas em memória a cada execução; nunca vão a disco nem ao log. Cada execução sobe um emulador novo (estado limpo) e derruba tudo ao final.

Comando (de `tv-web/`): `node e2e/portal-integrado-local.mjs`.

## Resultado (2026-10-13)

Cenário completo (execução de 11:39–11:41, API real + emulador, TV simulada em Chrome): **PASS**.

| Passo | Resultado observado | Tempo |
| --- | --- | --- |
| TV abre "Adicionar pelo site" | Trial exibido ("Período de teste", validade em 7 dias, ES256 verificado pela TV) e QR gerado | — |
| Portal entra pelo convite e cria lista M3U URL | TV aplica pela tela rápida; URL com marcador secreto nunca aparece na UI do portal | ~2 s |
| Card do portal | "Aguardando TV" até o ACK; depois "Configuração aplicada · Importação concluída" | ~4 s após aplicar |
| Portal edita nome (campo secreto vazio preserva) | TV reflete o novo nome | ~9 s |
| Portal remove lista | TV remove a lista (contagem local 0) | ~5 s |
| TV remove lista pela UI (card → ↓ → → → Excluir → confirmar), **fora da tela rápida** | Outbox sai na hora (T057): `POST /device/deletions` + `PUT /device/snapshot`, sem `GET /device/operations` nem refresh de licença; portal deixa de listar a lista | ~4 s |

Histórico da decisão (T057): na 1ª versão, fora da tela rápida a exclusão local só chegava ao portal no próximo ciclo (24 h) ou ao abrir a tela rápida, e o portal reteve a configuração cifrada (inclusive credenciais) de uma lista já apagada na TV. O usuário decidiu enviar a outbox imediatamente. Na implementação, enviar só `/device/deletions` não bastava: o servidor removia a configuração, mas sem snapshot novo o portal seguia listando a fonte como "Somente na TV"; por isso o envio imediato é `flushDeletions` + `publishSnapshot`. Estabilidade: 5/5 execuções consecutivas do cenário completo.

Observações:

- O card exige aguardar "Configuração aplicada" e um snapshot da TV posterior à aplicação antes de nova mutação; editar/remover antes disso gera conflito de revisão ("Revisar e repetir"), tratado pela UI como previsto. O script espera esse sinal (o 1º `settled` passava cedo demais).
- Cuidado ao reexecutar: as falhas intermitentes vistas durante o desenvolvimento foram do script (espera prematura e uma variável usada antes do `let`), não de instabilidade do produto.

Defeitos/armadilhas encontrados pelo caminho:

1. **Defeito real (corrigido, T056):** `authenticate_session` devolvia `401` a leituras concorrentes da mesma sessão válida (o portal dispara `configurations`, `operations` e `snapshot` juntos após login e após cada mutação). Causa: `now` é capturado antes da transação e a guarda `now < last_seen_at` recusava a requisição que terminava depois de outra mais nova já ter gravado `last_seen_at`. Efeito visível: banner "Acesso inválido ou expirado" com a sessão válida (reproduzido em 2 de 3 rodadas). Correção: tolerância `SESSION_CONCURRENCY_SKEW = 30 s` e `last_seen_at = max(anterior, now)`. Regressão: `test_concurrent_reads_with_out_of_order_clock_keep_valid_session` (vermelho sem a correção, verde com ela) e `test_session_rejects_clock_rolled_back_beyond_concurrency_tolerance` (relógio muito atrás continua recusado).
2. **Artefato de ambiente (não é defeito do produto):** `--disable-web-security` faz o `POST` do portal sair sem `Origin` e o exchange responde 403. O portal usa um navegador separado, com segurança normal.
3. **Configuração local:** a API exige `CCPLAY_PORTAL_SERVICE_RECOVERY_EPOCH` (token de 32 bytes); sem ele toda rota autenticada responde 503.
4. **Observação aberta:** na TV, `POST /devices/recovery/ack` responde 204 e logo em seguida o navegador reporta `net::ERR_ABORTED` para a mesma chamada. Sem efeito funcional observado (o ACK persiste); investigar se a requisição é abortada por `AbortController`/navegação em T046.

Validação da correção: `pytest tests/portal` com emulador (`PORTAL_TEST_FIRESTORE=1`, `--basetemp` em diretório acessível): **111 passed (52,1 s)**; `ruff check app/portal tests/portal`: PASS.

## O que o PC não prova

DUID real e relógio do aparelho, suspend/standby, AVPlay, teclas do controle, origem `file://` com a política de acesso do `config.xml`, desempenho no Chromium da TV, IAM/Scheduler/Cloud Storage reais, pagamento. Continuam em T046/T052/T039.
