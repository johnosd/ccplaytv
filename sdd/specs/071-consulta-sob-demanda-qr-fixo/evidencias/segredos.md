# Revisão de segredos — feature 071 (T028, SC-008)

Data: 2026-10-14. Método: marcadores fictícios (`usuario-marcador-071`, `senha-marcador-071`, chaves de dispositivo
geradas pela própria execução) percorridos por DOM, URL/fragmento, histórico, requisições, cabeçalhos, logs e erros.
Fixtures apenas; nenhum valor de `docs/m3u/dados.md` foi usado.

## Superfícies e evidência

| Superfície | Regra (constitution 1.11.0 / ADR-016) | Evidência |
| --- | --- | --- |
| Tela de listas e telas comuns da TV | chave e credenciais nunca aparecem | `e2e/consulta-sob-demanda.mjs` — texto da tela de listas sem senha, usuário nem as chaves (antiga e nova) |
| Adicionar lista / bloqueio | única exibição permanente da chave (a) e (f) | `legibilidade-tv.mjs` (capturas) e `consulta-sob-demanda.mjs` (ID e chave na tela, QR local) |
| Portal & licença | chave só por ação explícita | `PortalLicensePanel.test.tsx` — "foco não consulta; chave exige confirmação"; QR fixo só no clique |
| QR fixo | chave só no fragmento, nunca em path/query | contrato C4 (`fixedQr…contract.test.ts`); E2E: nenhuma URL de requisição do painel contém a chave |
| Endereço e histórico do painel | fragmento removido antes de qualquer requisição | `api.test.ts` (`replaceState` antes da rede) e `gerenciador.spec.ts` (URL sem `#` nem chave); E2E: `document.referrer === ''` e URL limpa |
| Requisições da TV | só rotas esperadas, por ação da pessoa; chave nunca na URL | E2E: lista de rotas inesperadas vazia; `POST /device/sources` leva credenciais só no corpo HTTPS |
| Resposta de `POST /device/sources` | não ecoa valores | `test_device_sources.py` — resposta e cabeçalhos sem os marcadores; `Cache-Control: no-store` |
| Logs da API | corpo de envio, usuário, senha e chave ausentes | `test_device_sources.py` (`caplog`) e E2E (saída do processo da API sem marcadores) |
| Erros e recusa | uniformes, sem eco de valor | `api.test.ts` (chave errada → `access`); E2E: QR antigo recusado com alerta genérico |
| Armazenamento no serviço | credenciais cifradas (AES-GCM, contexto device/source/versão) | `test_device_sources.py` — documento sem a senha em claro; `values` só pela sessão da mesma TV |
| Painel — lista | usuário/senha não aparecem fora da edição | E2E: texto do painel sem marcadores |
| Exportação/backup | nada de credencial em exportação pública | inalterado (069); a tabela `sourceUploads` guarda só `sourceId` + número |

## Riscos aceitos (ADR-016)

- R-004: foto/captura do QR dá acesso ao painel e às credenciais das listas; mitigação: fragmento fora do servidor e de
  logs, **Gerar nova chave** invalida QR e sessões (provado no E2E), limites de tentativa e recusa uniforme.
- Credenciais IPTV passam a existir cifradas no serviço para todas as listas enviadas pela TV.

## Limites desta revisão

Fixtures e pilha local (emulador). Não cobre IAM/Cloud Run reais, cabeçalhos do proxy de produção, nem a TV física
(quickstart §4). O `sourceUploads` da TV não guarda segredo.
