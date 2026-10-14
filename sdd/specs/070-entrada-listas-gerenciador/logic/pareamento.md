# Lógica delimitada — pareamento por ID + chave (070)

## 1. Normalização do MAC (TV, `lib/portal/displayId.ts`)

```text
displayIdFromMac(raw):
  se raw não é string → undefined
  hex = raw sem espaços nas pontas, remove ':' '-' '.' ; maiúsculas
  se hex não casa ^[0-9A-F]{12}$ → undefined
  octetos = pares de hex
  se todos 00 ou todos FF → undefined
  se (octeto0 & 0x01) == 1 → undefined          # multicast
  retorna octetos.join(':')
```

## 2. Escolha do ID no cadastro (servidor, `display_id.py`)

```text
candidato = normaliza(mac) (mesmas regras do §1; nunca confiar no cliente)
dentro da transação do cadastro:
  se candidato e claim(hmac(candidato)) livre → usa candidato, source="mac"
  senão repetir até 5 vezes:
     bytes = 6 aleatórios (CSPRNG); bytes[0] = (bytes[0] | 0x02) & 0xFE   # local, unicast
     se claim livre → usa, source="generated"
  esgotou → AuthError("try_again", 409)
grava claim + device.display_id na MESMA transação (nunca ID sem claim)
```

Mesmo MAC já reivindicado por outra TV (reinstalação usa recuperação pelo site, não novo cadastro): gera ID aleatório; nunca transfere o claim.

**Atualização (ADR-015):** o passo aleatório foi substituído por um ID **derivado** — `hmac("display_id_derived", identity_hmac + ":" + n)`, primeiros 6 bytes, mesma máscara local/unicast, `n = 0..4` só em colisão, `source = "derived"`; a mesma TV recebe sempre o mesmo ID, inclusive num recadastro após perda de dados. Uma vez gravado, `display_id`/`display_id_source` não mudam nem somem (`immutable_display_id` no repositório) e `displayIdClaims` não trocam de dono nem são apagados. Registros antigos `generated` são preservados. Ver ADR-015.

## 3. Chave (servidor)

```text
nova_chave = f"{secrets.randbelow(10**10):010d}"
guardar tokens.digest("device_key", nova_chave); devolver em claro só no envelope cifrado de emissão
```

## 4. Upgrade de TV antiga (TV + servidor)

```text
ao abrir a tela Adicionar, online, com device local:
  se device.displayId ausente ou deviceKey !~ ^\d{10}$ e nenhuma rotação pendente:
     connection.rotate('revoke')          # write-ahead existente; servidor cria display_id/claim se faltar
  falha → mantém tela com ID "indisponível" + código de erro + Recarregar (sem loop automático)
```

## 5. Sessão manual (servidor)

```text
manual_session(display_id, key, ip):
  limites por (hmac(display_id)+ip, hmac(display_id), ip, global) ANTES de ler o dispositivo
  formato inválido → mesma resposta de chave errada (401) após consumir o limite
  claim → device; comparar HMAC em tempo constante; device revogado/fence → 401
  sucesso → sessão "manage" (30 min ocioso / 8 h), cookie + CSRF como na 069
```
