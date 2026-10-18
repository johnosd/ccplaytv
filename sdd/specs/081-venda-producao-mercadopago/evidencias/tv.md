# TV física — 081

## T018 — pacote comercial de produção (2026-10-17)

Instalação: `deploy-tv.ps1 -SkipBuild -TvIp 192.168.0.2` → instalado e lançado (`8tZqMtwANL.CCPlayTv`), TV
`QN50Q60DAGXZD`. Host PC IP na TV = `192.168.0.6` (IP do PC; o usuário ajustou e reiniciou a TV).

Roteiro SC-001, **observado pelo usuário**:

| Item | Resultado |
| --- | --- |
| QR de Adicionar lista abre o portal `portal.ccplaytv.com` conectado à TV | **reprovado** (16:34, captura do usuário): o portal abre, mas "Access is invalid or expired" — a TV manteve o pareamento (ID/chave/bearer) da homologação, que a reinstalação preserva e a produção não conhece. Caminho: Desvincular → Adicionar lista (cadastro novo na produção) → QR novo |
| Licença aparece como teste | aprovado |
| Lista adicionada pelo portal chega no Atualizar | aprovado (inclusão e exclusão), depois do novo pareamento |
| "Comprar licença" com venda fechada | mostra "A compra está indisponível no momento." (estado esperado da US1). Usuário pediu que a compra oriente para o site quando o Pix não estiver disponível → R-012 / T044 |

### Novo pareamento na produção (2026-10-17)

- 1ª e 2ª tentativa de **Desvincular**: `AbortError` (o backup antes dele deu 401, esperado); nada apagado, nenhum
  cadastro chegou ao serviço. Causa não identificada → `[Bug]` no backlog (feature 072).
- Pacote de diagnóstico (mensagem do erro na tela, revertido depois) instalado: **Desvincular funcionou** na 1ª
  tentativa (`PUT /device/backup` 401 → `POST /devices/enroll` 200 → `recovery/ack` 204 → `entitlement/refresh` 200,
  19:46–19:47 UTC). O diagnóstico não chegou a mostrar o erro.
- Observado pelo usuário: **chave do dispositivo mudou**; **QR novo abre o portal conectado**; **lista incluída e
  excluída pelo portal chega no Atualizar**. SC-001 aprovado.
- No caminho, o portal no celular bloqueou (429, 5 falhas/15 min) tentando a chave antiga, e o campo de MAC não
  aceita digitação além de 2 caracteres → T045/T046.
- A TV está com o pacote de diagnóstico (inofensivo); o próximo build da TV (Fase 4) o substitui.