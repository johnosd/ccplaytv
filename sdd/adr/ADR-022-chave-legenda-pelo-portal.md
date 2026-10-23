# ADR-022: Chave de legenda digitada no portal, entregue à TV pelo serviço

## Status

Aceita (2026-10-23), pelo usuário, depois de revisar o texto da exceção (m) e da emenda da constitution 1.17.0 (feature 091, T001). Estende a ADR-020 (chave TMDB pelo portal) a mais dois BYOK — OpenSubtitles e SubDL — e completa a exceção (l) da constitution (feature 090/ADR-021), que dizia que o envio pelo portal "exige decisão própria".

## Data

2026-10-23

## Contexto

Na feature 090 a pessoa pode usar a **própria chave** do OpenSubtitles e/ou do SubDL, digitada **na TV** (exceção (l)); a chave é testada no fornecedor e usada direto da TV. Ao medir a 090 na TV física o usuário relatou: *"Muito difícil digitar manualmente. Precisa ter opção pelo portal ou de copiar e colar pelo celular."* É a mesma dor da chave TMDB, que a ADR-020 já resolveu (a chave é colada no portal, cifrada no serviço e aplicada pela TV no **Atualizar**).

A ADR-020 diz que o OpenAI BYOK "NÃO herda esta exceção: exigiria ADR própria", e a exceção (l) diz que a chave de legenda "não herda a (j) (envio pelo portal)". Estender o caminho a um novo BYOK é, portanto, decisão própria — esta ADR.

Fatos que reduzem o risco marginal (os mesmos da ADR-020): o serviço já guarda, cifradas e só entregues à mesma TV, as credenciais das listas, a chave TMDB (pendente) e o backup; quem digita é a mesma pessoa já autenticada no portal pelo ID e pela chave da TV (ADR-014); a chave é da conta **da pessoa** no fornecedor, gratuita e revogável por ela a qualquer momento; nunca é a chave do desenvolvedor.

## Decisão

1. **Caminho.** Chave digitada no portal → `PUT` HTTPS ao serviço → serviço guarda **cifrada** (envelope com contexto `(device_id, "subtitle-key:<fornecedor>", operation_id)`), **uma única operação pendente por TV e por fornecedor** → a TV a busca por `GET` autenticado (bearer da TV) **somente no Atualizar da pessoa** (ADR-016: nenhuma consulta automática) → testa a chave **no próprio fornecedor** → só então substitui a existente → confirma com `applied|rejected|retry`.
2. **O navegador só envia.** Nenhuma resposta ao navegador contém a chave, nem para "editar": **Substituir** envia uma chave nova. O estado mostrado é pendente / último resultado / o que a TV informou no snapshot (`integrations.subtitles`, sem valor, máscara ou formato).
3. **Ciclo de vida do segredo.** O envelope é **apagado** ao ficar aplicado, recusado, substituído, removido, expirado (7 dias) ou com o aparelho apagado/época trocada. `retry` mantém o envelope e anota só o motivo (`offline`/`rate_limited`).
4. **Resultado mínimo.** O ack carrega só o fornecedor, o `operationId`, `state` e `reason` de lista fechada (`refused`, `invalid_format`, `offline`, `rate_limited`). **Nunca** a chave, trecho dela, corpo ou texto do fornecedor.
5. **Proibições mantidas.** A chave NÃO PODE estar em URL, `Referer`, log, mensagem de erro, analytics, cache, armazenamento do navegador, DOM depois do envio, checkout, backup ou exportação. Depois de aplicada, vive só na TV e vai só ao fornecedor a que pertence (exceção (l)).
6. **Remoção.** Operação `remove` do mesmo tipo, aplicada pela TV no mesmo passo (`removeSubtitleKey`); o portal confirma antes de enviar.
7. **A TV continua dona da decisão.** A chave só substitui a existente depois do teste no fornecedor (`rejected` não troca nada). A TV pode estar offline: a operação fica pendente até o próximo Atualizar. **Sem confirmação na TV** antes de aplicar (mesma decisão da ADR-020).
8. **O que NÃO muda.** Chave do desenvolvedor ou compartilhada continua proibida em qualquer cliente; a chave **padrão** do ccplayTv continua só no serviço (exceção (k)); o backup da ADR-017 não passa a conter a chave de legenda; OpenAI e outros BYOK continuam exigindo decisão própria.
9. **Fora de escopo (decidido pelo usuário).** Sem "cancelar envio pendente" e sem "Usar o padrão do ccplayTv" pelo portal.

## Alternativas Consideradas

### Só digitar na TV (status quo da 090)

- Zero mudança de constitution.
- **Rejeitada pelo usuário:** é exatamente a fricção que a feature remove.

### Estender a ADR-020 por uma nota (tratar como a mesma exceção (j))

- Mais rápido; um texto só.
- **Rejeitada:** contraria a frase da própria ADR-020 (novo BYOK ⇒ ADR própria) e a da exceção (l).

### Colar a chave no celular e transferi-la à TV por QR/código curto, sem passar pelo serviço

- Evitaria o serviço guardar o segredo.
- **Rejeitada** (como na ADR-020): exige um receptor local na TV (rede local, descoberta, certificado) que o app client-first não tem; o QR da TV é de uma via.

### Aplicar na hora (push), sem esperar o Atualizar

- Resposta imediata na tela do celular.
- **Rejeitada:** a ADR-016 proíbe consultas automáticas; o portal diz "Enviado — na TV, aperte Atualizar".

## Consequências

### Positivas

- Digitar uma chave de legenda passa de dezenas de teclas do controle para uma colagem no celular.
- O resultado volta ao portal como estado real, sem prometer o que ainda não aconteceu.
- Reaproveita cifra, limites, fila, `Idempotency-Key`, época e retenção da ADR-020; a refatoração extrai uma classe-base única (sem copiar código sensível).

### Negativas

- **R-001 / R-002 (aceitos):** uma chave BYOK de legenda passa a trafegar do navegador ao serviço e do serviço à TV, cifrada em repouso e por TLS, e fica no serviço até ser aplicada, substituída, removida ou expirar (no máximo 7 dias). Quem comprometer **ao mesmo tempo** a sessão do portal e o cofre do serviço poderia ler uma chave pessoal — o pior caso é consumir a cota gratuita da pessoa, que a revoga no fornecedor.
- A TV aplica a chave sem confirmar com a pessoa na TV (mitigado: só troca depois do teste no fornecedor, e o resultado fica visível no portal).
- TVs antigas não informam `integrations.subtitles`: o portal mostra "Estado desconhecido".

### Caminho de Migração / Evolução Futura

- Se houver abuso (relato de chave trocada sem a pessoa saber), exigir confirmação na TV antes de aplicar ou reduzir a retenção de 7 dias — decisão nova, revisitando esta ADR e a ADR-020.

## Referências

- Constitution 1.17.0, exceção (m); ADR-014, ADR-016, ADR-020, ADR-021.
- `sdd/specs/091-chave-legenda-portal/` (spec, plano, `logic/chave-legenda-portal.md`, `contracts/portal-api-legendas.md`).
