# Revisão de segredos — feature 072 (T030, SC-005)

Data: 2026-10-14. Método: marcadores fictícios (chave TMDB `tmdbmarcador072…`, `tmdb-marcador-072`, senha
`senha-marcador-072`, códigos de recuperação gerados pela própria execução) percorridos por URL, corpo de resposta,
cabeçalhos, armazenamento no serviço, logs da API e telas. Nenhum valor de `docs/m3u/dados.md` foi usado.

| Superfície | Regra (constitution 1.12.0 (g)(h)) | Evidência |
| --- | --- | --- |
| Conteúdo do backup | só dados de uso; nada de URL/credencial IPTV/catálogo; chave TMDB separada em `secrets` | contrato `usageBackup` (marcadores de senha, host e `m3uUrl` ausentes; chave fora de `usage`) |
| Armazenamento no serviço | payload inteiro cifrado (AES-GCM, `usage-backup/v1`); só contagens em claro | `test_backup.py` — documento sem a chave TMDB nem `stableId` em claro |
| Respostas | `no-store`; PUT não ecoa a chave; outra TV não lê | `test_backup.py` (round trip, outra emissão recusada, 413 sem eco) |
| Painel | só data e contagens; apagar com CSRF | `BackupCard.tsx`; `gerenciador.spec.ts` (contagens, apagar) |
| Código de recuperação | só no corpo HTTPS; uso único; nunca em URL/log/erro | contrato `relink` (nenhuma URL contém o código); `test_self_relink.py` (código antigo e novo fora do `caplog`; código consumido recusado) |
| Erros da reassociação | recusa uniforme `invalid_credentials` (identidade desconhecida, código errado, formato inválido) | `test_self_relink.py` |
| Cliente HTTP da TV | lê do corpo só `recovery_required`/`invalid_credentials`; nada mais é ecoado | `portalClient.codes.test.ts` (código desconhecido no corpo → mapeamento por status) |
| URLs e log da pilha real | chave TMDB e código fora de URL e do processo da API | `e2e/desvincular-backup.mjs` (passo 10) |
| Telas | chave TMDB, PIN e código nunca exibidos | `PortalBackupActions`/`RestoreOffer`/`BackupCard` só mostram datas e contagens |

## Riscos aceitos (ADR-017)

- PIN de lista em hash com sal (curto) reversível por força bruta se o backup cifrado vazar — mitigado pela cifra no
  serviço e pelo acesso só da mesma TV.
- Código de recuperação mantido na TV após Desvincular (já estava lá; consumido na reassociação).

## Limites

Pilha local e emulador. Não cobre IAM/Cloud Run reais, cabeçalhos do proxy de produção nem a TV física.
