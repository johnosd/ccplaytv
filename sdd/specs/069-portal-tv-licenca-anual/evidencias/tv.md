# Evidências de TV física — Feature 069

### Tentativa T046 — 2026-10-12

O fluxo `deploy-tv.ps1` não iniciou build nem instalação porque a TV `192.168.0.2` aceitou a porta 26101, mas recusou a conexão do `sdb`. O script identificou a causa operacional provável: o `Host PC IP` gravado no Developer Mode da TV não corresponde ao IP atual do PC (`192.168.0.6`) ou a TV ainda não foi reiniciada após a alteração.

Nenhum pacote foi instalado, nenhum dado foi removido e o IndexedDB da TV foi preservado. Para retomar T046: na TV, abrir Developer Mode, definir `Host PC IP` como o IP atual do PC na mesma sub-rede, reiniciar a TV e executar novamente `deploy-tv.ps1`. A validação visual do fluxo comercial permanece pendente; não se infere aceite pelo preflight.

### Reexecução T046 — 2026-10-12

O endereço `192.168.0.2` foi usado explicitamente como TV. A porta 26101 continua aberta, porém o `sdb` recusa a conexão. O script confirma que o Host PC IP esperado na TV é `192.168.0.6`; ainda é necessário salvar esse valor no Developer Mode e reiniciar a TV. Nenhum build, instalação ou dado local foi alterado.

### Deploy T046 concluído — 2026-10-12

- Preflight `sdb` conectado à TV `192.168.0.2` após correção do Host PC IP.
- `npm run build:tizen`: PASS; guard `check-no-demux-in-build`: PASS; sincronização do pacote concluída.
- Pacote assinado com `ccplay_samsung_certificate_4`, instalado com sucesso e lançado com PID confirmado.
- A operação foi uma atualização/reinstalação sobre o mesmo pacote, sem desinstalação; nenhum dado local foi limpo.
- A prova de tela e do fluxo comercial (QR, compra de teste, ativação, foco, licença e remoção) ainda precisa de confirmação visual do usuário na TV. Instalação/lançamento não são aceites de reprodução ou UX.

### Confirmação visual do usuário — 2026-10-12

Após a atualização/lançamento, o usuário confirmou que o CCPlay abriu e que listas e favoritos permaneceram presentes. Esta confirmação valida a preservação dos dados na atualização do mesmo pacote. Não cobre, por si só, o roteiro comercial completo de QR, compra sandbox, ativação, entrada bloqueada por vencimento e remoção; esses cenários continuam pendentes de execução/observação específica.
