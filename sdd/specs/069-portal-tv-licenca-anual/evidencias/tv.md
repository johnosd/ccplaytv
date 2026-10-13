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

### Reinstalação do pacote pessoal — 2026-10-13

- Após o usuário reiniciar a TV, `deploy-tv.ps1` (sem `-SkipBuild`): TV `192.168.0.2`, `sdb` conectado, `build:tizen` PASS (guard de demux PASS), pacote assinado com `ccplay_samsung_certificate_4`, instalado e lançado (PID confirmado). Atualização sobre o mesmo pacote, sem desinstalação; nenhum dado local limpo.
- **Isto é o pacote pessoal, não o comercial.** Sem `VITE_PORTAL_ORIGIN` o agente do portal não inicia (`portalRuntime.ts`) e, fora de `MODE=commercial`, a guarda de entrada da lista não age (`licenseRuntime.ts`). Portanto este deploy **não valida** QR, trial, licença nem guarda de vencimento na TV; no máximo regressão do uso pessoal e preservação de dados. T046 segue **não executado** para o fluxo comercial.
- Validação visual desta instalação: pendente do usuário.

### Pacote comercial de staging instalado — 2026-10-13

- Pedido do usuário: instalar o comercial na TV após a validação no PC (`evidencias/pilha-local.md`) e depois de T056/T057.
- Build: `npm run build:tizen:commercial` com `VITE_PORTAL_ORIGIN` = serviço de staging (HTTPS) e `VITE_LICENSE_PUBLIC_KEYS` = JWKS público atual do staging (`kid=v1`, só `x`/`y`); variáveis apenas no processo, nada gravado em arquivo. Conferido no pacote: origem do staging e chave pública presentes, nenhum campo privado `d`.
- Instalação: `deploy-tv.ps1 -SkipBuild -TvIp 192.168.0.2`, perfil `ccplay_samsung_certificate_4`, instalado e lançado (PID confirmado), **sem desinstalar** (IndexedDB preservado). Reversão: `deploy-tv.ps1` com `build:tizen` (pacote pessoal), também sem apagar dados.
- Efeitos esperados na TV: cadastro do dispositivo no staging, trial de 7 dias, aba "Portal & licença", guarda de entrada da lista pela licença local.
- **Validação visual: pendente do usuário** (roteiro abaixo). Nada aqui é aceite de T046.

Roteiro sugerido (anotar aprovado/reprovado/não executado e quem viu):

1. A TV abriu e as listas/favoritos anteriores continuam presentes? Dá para entrar numa lista?
2. Configurações → "Portal & licença": mostra "Período de teste" com validade (~7 dias)? O QR é legível e o foco/RETURN se comportam?
3. Ler o QR no celular: o portal abre? Criar uma lista M3U URL/Xtream de teste e ver se aparece na TV em até ~30 s com a tela do QR aberta.
4. Excluir essa lista pela TV (card → ↓ → → Excluir) **sem** deixar a tela do QR aberta: em até alguns segundos o portal deve parar de listá-la (clicando em "Atualizar estado").
5. Excluir uma lista pelo portal e conferir que a TV a remove.

### Observações do usuário no pacote comercial — 2026-10-13

Fix T056 já publicado no staging (revisão `ccplaytv-portal-00013-ph4`) antes desta rodada.

| Passo | Resultado | Quem viu |
| --- | --- | --- |
| 1. Abrir, listas/favoritos preservados, entrar numa lista | **OK** (validado) | usuário |
| 2. "Portal & licença": período de teste, validade, QR, foco/RETURN | 1ª rodada **NÃO OK** (pacote antigo: botão inalcançável, QR falhava por relógio). Após T058 (pacote reinstalado em 2026-10-13): QR gerado — **OK** (usuário); licença/validade e RETURN não relatados | usuário |
| 3. QR → portal abre em "Suas listas" | **OK** (usuário: "acessar o portal") | usuário |
| 4. Criar lista pelo portal → aparece na TV | **OK** (usuário: "subir uma lista pelo portal e apareceu na tv") | usuário |
| Observação do usuário | "o acesso na TV está confuso" — descoberta/navegação até o portal; a detalhar | usuário |
| 5. Excluir pela TV (sem a tela do QR) → portal deixa de listar | **OK** (usuário, TV física, pacote comercial T057/T058) | usuário |
| 6. Excluir pelo portal → TV remove | **OK** (usuário, TV física) | usuário |
| 7. Editar nome (segredo vazio preserva) | **OK** (usuário, TV física) | usuário |

Cobertura do T046 até aqui (TV física, Tizen 9, staging, `file://`): QR, portal, criação, edição e exclusão nos dois sentidos, preservação de dados. **Ainda não observado na TV:** leitura explícita da licença ("Período de teste" + validade) e do código/chave, vencimento e reentrada bloqueada, uso offline, pagamento de teste → ativação, recuperação pelo site, suspend/standby, tempos medidos na TV. Por isso T046 segue aberto e a venda continua desligada.

### Confirmação visual do usuário — 2026-10-12

Após a atualização/lançamento, o usuário confirmou que o CCPlay abriu e que listas e favoritos permaneceram presentes. Esta confirmação valida a preservação dos dados na atualização do mesmo pacote. Não cobre, por si só, o roteiro comercial completo de QR, compra sandbox, ativação, entrada bloqueada por vencimento e remoção; esses cenários continuam pendentes de execução/observação específica.
