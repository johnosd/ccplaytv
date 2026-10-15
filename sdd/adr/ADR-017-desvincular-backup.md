# ADR-017: Desvincular a TV, reassociação pela própria TV e backup dos dados de uso

## Status

Aceita (2026-10-14). Atualiza a ADR-013 (o que o serviço guarda por TV) e a ADR-015 (como a mesma TV volta ao mesmo registro). A ADR-016 (nada automático) continua valendo integralmente.

## Data

2026-10-14

## Contexto

No teste da 070 na TV física, o pareamento ficou inconsistente e a única saída foi desinstalar o app — perdendo listas, favoritos, histórico, progresso, chave TMDB e PINs. Desde a 071 as listas já ficam no serviço (credenciais cifradas), mas os **dados de uso** só existem na TV. O usuário (2026-10-14) pediu:

- um **Desvincular** que solte só o pareamento e deixe a TV voltar a ser a **mesma** no serviço (mesmo ID, listas, licença);
- um **backup** dos dados de uso preso à identidade da TV, restaurado com confirmação depois de reinstalar ou re-parear, apagável na TV e no site;
- sem conta Google (fica como ideia futura; ADR-004).

O `enroll` já recusa (`409 recovery_required`) uma identidade de plataforma que tem registro; a saída de hoje é a recuperação pelo site da 069, que exige celular e o código de recuperação digitado. A constitution 1.11.0 proibia BYOK fora da TV; foi emendada para 1.12.0 (itens (g) e (h)) antes de qualquer código. Detalhes em `sdd/specs/072-desvincular-backup/`.

## Decisão

1. **Desvincular** apaga do aparelho só o pareamento (`portalDevice/device` e `bootstrap`, `licenseCache`, `sourceUploads`) e marca o backup como `unknown`. Preserva catálogo, dados de uso, `localTrial` (senão o teste de 7 dias reiniciaria) e a fila de exclusões (senão uma lista excluída ressuscitaria no site).
2. **Reassociação pela própria TV.** O Desvincular guarda o código de recuperação que a TV já tinha (`portalDevice/relink`). Quando o `enroll` responde `recovery_required`, a TV chama `POST /portal/v1/devices/recovery/self` com `platformIdentity`, `nonce` e o código no corpo HTTPS. O serviço confere identidade **e** código, gira bearer, chave e código (auth epoch + 1, derrubando sessões e QR antigos) e devolve o **mesmo** `deviceId`/ID exibido. O lembrete é apagado ao concluir. Sem lembrete (reinstalação), continua a recuperação pelo site da 069.
3. **Backup de uso.** Um documento por TV (`devices/{id}/backups/current`), payload inteiro cifrado com `PortalCrypto` (contexto `usage-backup/v1`), só a última versão, ≤ 512 KB (corta histórico antigo antes de favoritos/progresso). Conteúdo: userStates, preferências de categoria, PIN por lista (hash com sal), configurações por allowlist e chave TMDB. Nunca catálogo, URL ou credencial IPTV.
4. **Nada automático (ADR-016).** O backup sobe no Atualizar da tela de listas (passo depois do snapshot) e no botão "Fazer backup agora"; a checagem "existe backup?" é feita nesse passo.
5. **Nunca sobrescrever um backup não decidido.** Estado local `unknown → offered → settled`: logo após um pareamento novo, o Atualizar pergunta o resumo e, se houver backup, **oferece a restauração e não sobe**.
6. **Restauração** com confirmação: mescla por lista e identidade lógica (`stableId`), vence o mais recente; dados de lista ausente ficam pendentes por 5 dias.
7. **Painel** vê só data e contagens e pode apagar.

## Alternativas Consideradas

- **Recuperação pelo site (069) como único caminho de volta**: segura, mas exige celular e digitar o código — não cumpre "destravar em até 3 ações".
- **DUID como prova suficiente para reassociar**: o DUID não é segredo forte; qualquer app na mesma TV pode lê-lo.
- **Apagar o registro antigo e cadastrar de novo**: viola a ADR-015 (ID imutável) e perde listas, licença e backup.
- **Login com Google**: resolve levar dados a outra TV, mas cria conta de pessoa (ADR-004), mais dado pessoal e um segundo vínculo; adiado.
- **Cloud Storage para o backup**: mais peças (bucket, IAM, retenção) para um blob pequeno; Firestore já guarda as configurações cifradas.
- **Cifrar no cliente**: a TV não teria onde guardar a chave depois de reinstalar.

## Consequências

### Positivas

- Destravar a TV sem desinstalar; reinstalar sem perder favoritos, histórico, progresso, PINs e chave TMDB.
- Reaproveita identidade, cifra, rotação e limites que já existem.

### Negativas

- Dados pessoais de uso e a chave BYOK passam a existir cifrados no serviço (risco aceito; constitution 1.12.0 (g)).
- PIN curto em hash é reversível por força bruta se o backup cifrado vazar (risco aceito, mitigado pela cifra e pelo acesso só da mesma TV).
- O código de recuperação continua na TV após desvincular (já estava; uso único).
- Uma requisição a mais por Atualizar de listas.

## Caminho de Migração

Revisitar se houver clientes pedindo levar dados a outra TV (conta de pessoa, nova ADR), se o backup crescer além de 512 KB com frequência (dividir em partes ou Cloud Storage), ou se a recuperação por código mostrar abuso (exigir confirmação no site).
