# Emenda proposta à constitution + ADR-022 (gate G-1)

Feature `091-chave-legenda-portal`. Texto **proposto** pelo `sdd-plan` em 2026-10-23; a task **T001** só o aplica em
`.planning/memory/constitution.md` (e cria `sdd/adr/ADR-022-…` por `sdd-adr`) depois de o usuário aprovar este texto (ou
uma versão editada por ele). A constitution não é editada por skill sem essa aprovação (seção Governança). Enquanto T001
não fechar, **nenhum código que envie a chave de legenda ao serviço** pode ser escrito (T005 em diante).

## Por que a emenda é necessária

A exceção **(l)** (BYOK de legendas, feature 090) diz: "Não herda a exceção (j) (envio pelo portal) nem a (g) (backup);
estender a elas exige decisão própria." A **ADR-020** diz o mesmo para novos BYOK (OpenAI "exigiria ADR própria"). O
pedido (digitar a chave no celular) é exatamente um envio pelo portal. A regra "chave do desenvolvedor ou compartilhada
continua proibida em qualquer cliente" **não muda**.

## Mudança de versão

`1.16.0 -> 1.17.0` (MINOR: expansão delimitada de "Segredos Fora dos Clientes e dos Logs", nova exceção (m)).

## Texto a inserir (em "Segredos…", depois do item (l))

> **Exceção de chave de legenda pelo portal (2026-10-23, feature 091/ADR-022)**, decisão explícita do usuário com risco
> aceito, no mesmo molde da (j):
> (m) a chave BYOK de legendas **da própria pessoa** (OpenSubtitles ou SubDL) PODE ser digitada no portal autenticado da
> TV dela e enviada, exclusivamente no corpo HTTPS, ao serviço. O serviço DEVE cifrá-la em repouso (contexto próprio por
> TV, **por fornecedor** e por operação), manter **uma só operação pendente por TV e por fornecedor**, NÃO PODE logá-la, e
> a entrega **somente** à sessão autenticada da **mesma TV**, que a busca apenas no **Atualizar** da pessoa (sem consulta
> automática, ADR-016). A TV DEVE validar o formato, testar a chave **no próprio fornecedor** e só então substituir a
> existente; responde apenas `applied`, `rejected` ou `retry` com motivo de lista fechada, **nunca** a chave, trecho
> dela ou texto livre de erro. O serviço DEVE apagar o envelope ao aplicar, recusar, substituir, remover, expirar (no
> máximo 7 dias) ou apagar o aparelho, e sujeitar a operação ao mesmo limite de tentativas e à mesma recusa uniforme das
> demais configurações. O navegador SÓ envia: NENHUMA resposta lhe devolve a chave (editar = enviar outra); o campo DEVE
> ser oculto por padrão e limpo após o envio. A chave NÃO PODE estar em URL, `Referer`, log, erro, analytics, cache,
> armazenamento do navegador, DOM depois do envio, checkout, backup ou exportação. Depois de aplicada, a chave continua
> sob a (l): vive só na TV e vai só ao fornecedor a que pertence. Chave do desenvolvedor ou compartilhada continua
> proibida em qualquer cliente; esta exceção NÃO se estende à chave padrão do ccplayTv (exceção (k)), nem à OpenAI.

E, na lista de exceções que aparece no cabeçalho de impacto de sincronização, acrescentar (m) ao lado de (j); e na
exceção (l), trocar "Não herda a exceção (j) (envio pelo portal) nem a (g) (backup)" por "O envio pelo portal é a exceção
(m); não herda a (g) (backup)".

## Relatório de Impacto de Sincronização (a inserir no topo do arquivo)

- Mudança de versão: 1.16.0 -> 1.17.0 (MINOR, expansão delimitada de "Segredos Fora dos Clientes e dos Logs", nova
  exceção (m)).
- Origem: feature 091 (gate G-1); a pessoa achou "muito difícil digitar" a chave de legenda com o controle da TV.
- Exceção delimitada: (m) a chave pessoal de legenda digitada no portal passa pelo serviço cifrada, uma pendente por TV e
  por fornecedor, entregue só à mesma TV no Atualizar.
- Continuam proibidos: chave do desenvolvedor/compartilhada em qualquer cliente; chave de legenda em log/URL/backup;
  OpenAI e outros BYOK (exigem decisão própria).
- Riscos aceitos pelo usuário: o serviço guarda, cifrada e por até 7 dias, uma chave pessoal de terceiro até a TV a
  aplicar; quem tem a sessão do portal pode trocar a chave sem confirmação na TV (mitigado: a TV só troca depois do
  teste no fornecedor, e o resultado fica visível no portal).
- Formalização normativa não comprova implementação, hardware ou lançamento.

## ADR-022 (esqueleto para o `sdd-adr`)

Título: "Chave de legenda digitada no portal, entregue à TV pelo serviço". Status: Proposta (aceita ao aprovar este
texto). Contexto: ADR-020 + exceção (l). Decisão: os 8 pontos da ADR-020 aplicados a duas chaves por TV (uma pendente por
fornecedor, rótulo de cifra por fornecedor, rotas `/integrations/subtitles/*`, snapshot opcional `integrations.subtitles`,
sem cancelar pendente). Alternativas: só digitar na TV (rejeitada pelo usuário); QR/código curto TV↔celular (rejeitada
pela ADR-020); estender a ADR-020 com uma nota (rejeitada: contraria a própria frase da ADR). Consequências: igual à ADR-020
(R-001/R-008) + TVs antigas aparecem como "Estado desconhecido". Emenda com nota em ADR-020 §8 e ADR-021 §8
(`**Atualização (ADR-022):**`), sem reescrever a história.
