# Research — 072

## 1. Como a TV volta ao mesmo registro depois de desvincular

- **Decisão**: a TV guarda o código de recuperação ao desvincular e, quando o `enroll` responde `recovery_required`,
  chama `POST /portal/v1/devices/recovery/self` com `platformIdentity` + `nonce` + código. O serviço confere a
  identidade (HMAC do DUID, `identityClaims`) **e** o código (HMAC ativo e versão), gira bearer/chave/código e
  devolve credenciais do mesmo `deviceId`.
- **Justificativa**: cumpre "mesma TV em até 3 ações" (SC-002) sem celular. O código já estava na TV; a prova continua
  sendo um segredo que só o dono tem. O `enroll` já trata `identityClaims` existente como `recovery_required` (409).
- **Alternativas**: recuperação pelo site da 069 (QR + digitar código no celular) — segura, mas não cumpre SC-002;
  apagar o registro antigo e cadastrar de novo — viola ADR-015 e perde listas/licença/backup; usar só o DUID como
  prova — DUID não é segredo forte (pode ser lido por apps na mesma TV).

## 2. Onde guardar o backup no serviço

- **Decisão**: Firestore, `devices/{deviceId}/backups/current`, um documento com metadados em claro (`createdAt`,
  `format`, contagens) e o payload num envelope `PortalCrypto` (AES-GCM, contexto `deviceId/usage-backup/v1`).
- **Justificativa**: mesmo padrão das configurações cifradas (069/071), mesma retenção e mesma chave; uma leitura por
  restauração; custo desprezível.
- **Alternativas**: Cloud Storage (como o journal da 069) — mais peças (bucket, IAM, retenção) para um blob pequeno;
  cifra no cliente — a TV não tem onde guardar a chave depois de reinstalar.

## 3. Tamanho

- **Decisão**: payload JSON ≤ 512 KB antes da cifra (envelope base64 ≈ 683 KB, abaixo de 1 MiB). Se passar, a TV corta
  entradas de histórico **sem favorito e sem progresso**, da mais antiga para a mais nova, e registra a contagem cortada
  (`counts` reflete o que foi enviado).
- **Justificativa**: favoritos e progresso são o que a pessoa mais sente perder; histórico antigo é o menos valioso.
- **Alternativas**: dividir em vários documentos (complexidade de consistência); compressão (sem `CompressionStream`
  garantido no Chromium 108 da TV).
