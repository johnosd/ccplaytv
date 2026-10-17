# ADR-020: Chave TMDB digitada no portal, entregue à TV pelo serviço

## Status

Aceita (2026-10-16), pelo usuário, depois de revisar o texto (feature 077, T024). Emenda a ADR-013 ("o navegador não recebe segredos salvos" continua; passa a existir um caminho em que o navegador **envia** um segredo BYOK) e a ADR-016 (nenhuma consulta automática ao serviço; o novo fluxo só corre no **Atualizar** da pessoa) e, por consequência, a exceção de "Segredos Fora dos Clientes e dos Logs" da constitution (1.14.1 → 1.15.0, nova exceção (j)). ADR-008, ADR-010, ADR-014, ADR-015, ADR-017 e ADR-019 continuam valendo.

## Data

2026-10-16

## Contexto

A chave TMDB é BYOK: a **própria pessoa** cria a chave na conta dela no TMDB e a digita **na TV** (feature 032, constitution 1.6.0). Digitar uma chave de 32 caracteres hexadecimais (v3) ou um JWT com mais de 200 caracteres (v4) com o controle remoto é lento e propenso a erro; é, na prática, a razão de muita gente não ativar os metadados.

Hoje a chave só viaja em um sentido: da TV para o serviço, **dentro do backup cifrado** da ADR-017 (constitution item (g)), e de volta só para a mesma TV. Não há caminho do navegador para ela.

Na feature 077 (redesenho do portal) o usuário pediu, em ordem de importância, "adicionar/editar chave TMDB" entre as quatro operações principais do site e escolheu, na entrevista, a opção **"Enviar pela TV via serviço"** (a chave é digitada no celular, que tem teclado e área de transferência, e a TV a recebe) e o retorno de **estado real** ("aplicada e válida" ou "recusada"). A constitution 1.14.1 não prevê esse caminho: o item (g) cobre só o backup, e o parágrafo "Exceção remota restrita" diz que o navegador "NÃO recebe segredos salvos" e que a exceção "NÃO autoriza exportar … BYOK". Implementar sem emenda seria violação de princípio (registrado como R-001 da feature 077).

Fatos que reduzem o risco marginal:

- o serviço **já** guarda, cifradas e só entregues à mesma TV, as credenciais das listas (itens (d) e (b)) e a chave TMDB (dentro do backup, item (g)), com a mesma cifra de envelope e as mesmas chaves separadas dos dados;
- a pessoa que digita é a **mesma** que já está autenticada no portal pelo ID e pela chave de 10 dígitos da TV (ADR-014) — o portal não guarda conta própria;
- a chave é da conta TMDB **da pessoa**, gratuita e revogável por ela no site do TMDB a qualquer momento; nunca é chave do desenvolvedor. O pior caso de um vazamento é alguém consumir a cota gratuita dela, e o usuário avaliou (2026-10-16) que esse risco é pequeno e aceitável: não é credencial paga nem de acesso a conteúdo. Por isso a exceção vale **só** para esta chave; senhas e URLs de provedor seguem com o tratamento próprio dos itens (b) e (d).

## Decisão

1. **Caminho.** Chave digitada no portal → `PUT` HTTPS para o serviço → serviço guarda **cifrada** (envelope com contexto `(device_id, "tmdb-key", operation_id)`), **uma única operação pendente por TV** → a TV a busca por `GET` autenticado (bearer da própria TV, sem `Origin`), **somente** no passo `integrations` do **Atualizar de listas** da pessoa (ADR-016: nenhuma consulta automática) → a TV valida o formato, testa a chave no TMDB e a grava com `saveTmdbKey` → a TV responde com `applied`, `rejected` ou `retry`.
2. **O navegador só envia.** Nenhuma resposta do serviço ao navegador contém a chave, nem para "editar": **Substituir** sempre envia uma chave nova. O estado mostrado ao navegador é `pendente` / `último resultado` / `o que a TV informou no último snapshot` (`none`|`configured`), nunca o valor.
3. **Ciclo de vida do segredo no serviço.** O envelope é **apagado** ao ficar `applied`, `rejected`, cancelado, substituído por outra operação, expirado (7 dias) ou com o aparelho apagado/época trocada. `retry` mantém o envelope e anota só o motivo (`offline` | `rate_limited`). Ack repetido ou de operação obsoleta é idempotente e não revela estado.
4. **Resultado mínimo.** O ack carrega só `operationId`, `state` (`applied|rejected|retry`) e `reason` de uma lista fechada (`refused`, `invalid_format`, `offline`, `rate_limited`). **Nunca** a chave, um trecho dela, o corpo da resposta do TMDB ou texto de erro livre.
5. **Proibições mantidas.** A chave NÃO PODE estar em URL, `Referer`, log, mensagem de erro, analytics, cache, `localStorage`/`sessionStorage`/IndexedDB do navegador, atributo ou texto do DOM depois do envio, nem em checkout, exportação pública ou resposta ao navegador. O campo do formulário é oculto por padrão (olho) e é **limpo** logo após o envio. O serviço NÃO PODE logá-la e inclui a operação no mesmo limite de tentativas por TV (10 mutações/hora) e na mesma recusa uniforme das demais configurações.
6. **Remoção.** Remover a chave é uma operação do mesmo tipo (`remove`), aplicada pela TV no mesmo passo; `removeTmdbKey` apaga o valor local. O portal confirma a remoção antes de enviar.
7. **A TV continua dona da decisão.** A chave só substitui a existente depois de passar no teste do TMDB (`rejected` não troca nada). A TV pode estar offline ou sem rede: a operação fica pendente até o próximo Atualizar.
8. **O que NÃO muda.** Chave do desenvolvedor ou compartilhada continua proibida em qualquer cliente. O backup da ADR-017 continua com a chave TMDB cifrada, sem relação com este fluxo. Nenhuma chave TMDB passa a ser enviada a outro terceiro que não o TMDB (pela TV).

## Alternativas Consideradas

### Só orientar a pessoa a digitar a chave na TV

- Zero mudança de constitution, zero risco novo.
- **Rejeitada pelo usuário:** é exatamente a fricção que a feature quer remover; a TV continua sendo o único lugar com a chave.

### Colar a chave no celular e transferi-la à TV por QR/código curto, sem passar pelo serviço

- Evitaria o serviço guardar o segredo, mesmo que cifrado e por pouco tempo.
- **Rejeitada:** exige a TV abrir um receptor local (rede local, descoberta, certificado) que o app client-first não tem; o QR da TV é de uma via (TV → celular) e levar a chave no sentido contrário exigiria câmera na TV. O serviço já é o canal autenticado e cifrado de configuração (ADR-013/016).

### Deixar o portal exibir a chave guardada para "editar"

- Permitiria editar só um trecho.
- **Rejeitada:** devolveria um segredo ao navegador, contrariando a ADR-013 e o item (g); Substituir por uma chave nova resolve o mesmo caso com menos exposição.

### Aplicar a chave na hora (push), sem esperar o Atualizar

- Resposta imediata na tela do celular.
- **Rejeitada:** a ADR-016 proíbe consultas automáticas ao serviço; o portal passa a dizer "Enviado — na TV, aperte Atualizar" e mostra "Aguardando a TV" (R-007 da feature 077).

## Consequências

### Positivas

- Digitar uma chave TMDB passa de dezenas de teclas do controle remoto para uma colagem no celular.
- O resultado volta ao portal como estado real (aplicada na TV ou recusada pelo TMDB), sem prometer o que ainda não aconteceu.
- Reaproveita cifra, limites, fila, `Idempotency-Key`, época e retenção já existentes; não cria infraestrutura nova.

### Negativas

- **R-001 / R-008 (aceitos):** uma chave BYOK passa a trafegar do navegador ao serviço e do serviço à TV, cifrada em repouso e por TLS, e fica no serviço até ser aplicada, cancelada ou expirar (no máximo 7 dias). Quem comprometer **ao mesmo tempo** a sessão do portal (ID + chave de 10 dígitos) e o serviço obtém a chave TMDB da pessoa — que é gratuita, de conta própria e revogável no TMDB.
- A TV aplica a chave **sem confirmar com a pessoa na TV** (quem tem a sessão do portal pode trocar a chave); mitigado porque a TV só troca depois do teste no TMDB e o resultado fica visível no portal.
- A TV precisa de um passo novo no Atualizar (`integrations`) e o snapshot ganha `integrations.tmdb` opcional; TVs antigas ignoram o campo e aparecem como "estado desconhecido" no portal.

### Caminho de Migração / Evolução Futura

- Se houver abuso (relato de chave trocada sem a pessoa saber), exigir confirmação na TV antes de aplicar, ou reduzir a retenção de 7 dias para algumas horas — decisão nova, revisitando esta ADR.
- OpenAI BYOK (planejado) NÃO herda esta exceção: exigiria ADR própria.
