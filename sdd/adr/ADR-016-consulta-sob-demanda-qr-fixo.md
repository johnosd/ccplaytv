# ADR-016: Consulta sob demanda, QR fixo e credenciais da TV no serviço

## Status

Aceita (2026-10-14). Emenda a ADR-013 (ciclo diário/consulta rápida, convite QR efêmero) e a ADR-014 (chave só na tela Adicionar, QR sem chave, valores só do portal para a TV). A ADR-015 (ID imutável) continua valendo integralmente.

## Data

2026-10-14

## Contexto

A 069 deu ao app um agente que consulta o serviço todo dia e a cada 10 s em telas de portal/adicionar, renova o convite do QR e consulta ao negar a entrada; o teste de 7 dias nasce no serviço. A 070 pôs a chave de 10 dígitos na tela Adicionar e manteve o QR como convite efêmero sem chave.

O usuário (2026-10-14) apontou três problemas de produto e custo:

- o bloqueio por fim de teste "não precisaria ficar batendo numa API" todos os dias — o app pode contar o teste sozinho e liberar depois da compra;
- ele quer botões **Atualizar** no lugar de requisições automáticas, em três fluxos: site → TV, TV → site e compra → liberar;
- o QR deve ser **fixo** e entrar direto no painel, e a TV deve mostrar a lista no site "com tudo" (nome, host, usuário, senha), sem tratar esses dados como segredo de UX.

Isso conflita com a constitution 1.10.0 em três pontos de "Segredos Fora dos Clientes e dos Logs" (credenciais IPTV ao serviço, chave dentro do QR, chave também no bloqueio). A feature 071 (`sdd/specs/071-consulta-sob-demanda-qr-fixo/`) detalha o desenho; a constitution foi emendada para 1.11.0 antes de qualquer código.

## Decisão

1. **Nada automático.** O app só fala com o serviço por ação da pessoa: apertar Atualizar, adicionar/editar/excluir lista, abrir pela primeira vez uma tela que precisa de ID/chave, ou ler o QR no site. Saem ciclo diário, janela rápida, `liveQuery` de abertura, renovação de convite e consulta ao negar entrada.
2. **Atualizar com escopo e pausa.** `refresh('lists')` = exclusões → envios → busca → publicação do snapshot; `refresh('license')` = só licença. Pausa de 10 s por escopo, medida pelo relógio injetado, sem requisição na repetição.
3. **Cadastro preguiçoso.** O `enroll` deixa de rodar no mount; ocorre uma vez, na primeira necessidade de ID/chave (Adicionar, bloqueio, Portal & licença) ou no primeiro Atualizar.
4. **Teste local de 7 dias.** Tabela `localTrial` criada na primeira abertura do build comercial, com marca d'água do relógio; decisão de acesso = licença assinada válida **ou** teste local vigente; `revoked` assinado vence. **Âncora**: `POST /devices/enroll` aceita `trialStartedAt`; o serviço grava `min(created_at, valor)` e devolve o início, que a TV reconcilia com `min`. Instalação já em uso herda o início do JWS de teste.
5. **QR fixo gerado na TV.** `<site>/#id=<ID>&key=<chave>`, desenhado localmente por `qrcode-generator`, sem requisição. A chave vai **só no fragmento**; o `portal-web` a consome, chama `POST /sessions/manual` e limpa o endereço com `replaceState` antes de renderizar. "Gerar nova chave" invalida QR e sessões.
6. **Chave também no bloqueio.** Visível em Adicionar lista e na tela de bloqueio; em Portal & licença continua só por ação explícita.
   **Atualização (ADR-019):** em Portal & licença, QR fixo, ID e chave passam a aparecer à vista ao abrir a tela; o código de recuperação (antes "código da licença"; desde a feature 076 dentro de Avançado) começa oculto e alterna por um olho (sem modal de aviso, sem limite de tempo), voltando a ocultar ao sair da tela ou em segundo plano. Ver ADR-019 para o raciocínio completo.
7. **Credenciais da TV ao serviço.** `POST /portal/v1/device/sources` (bearer da TV, lote ≤ 10) envia nome, tipo, host, usuário, senha e URL M3U; o serviço reutiliza `ConfigurationService` (cifra AES-GCM, versão imutável, CAS por revisão) com `applied_revision` direto, sem operação pendente; tombstone → `gone`; idempotente por digest. Fila durável `sourceUploads`; a primeira atualização sobe todas as listas, em lotes. Corpo nunca em log, erro, analytics ou cache.
8. **Sem detecção de estorno.** Revogação e estorno só chegam no Atualizar; a licença assinada vigente vale offline até vencer.

## Alternativas Consideradas

### Manter o ciclo diário e só espaçar o intervalo

- Menos requisições, mesmo desenho.
- **Rejeitada:** o usuário pediu "nada automático"; qualquer janela automática mantém custo, falhas silenciosas e a consulta ao abrir o app.

### Janela rápida automática limitada nas telas de portal

- Faria a lista aparecer sozinha após criar no site.
- **Rejeitada pelo usuário:** prefere botão com resultado visível; "só botão" também na tela de listas.

### QR só com ID, digitando a chave

- Não expõe a chave a quem fotografar o QR.
- **Rejeitada pelo usuário** depois do aviso de enumeração do ID (sozinho abriria o painel a qualquer um): quer entrar "sem nenhuma ação". Mitigação adotada na decisão 5.

### Manter o convite efêmero (`manage`) de uso único

- QR sem chave, expira; é o desenho da 070.
- **Rejeitada:** exige requisição para gerar/renovar o convite, contra a decisão 1, e o QR muda a cada leitura.

### Enviar ao site só nome/tipo/estado das listas

- Mantém credenciais só no aparelho (070).
- **Rejeitada pelo usuário:** o site deve ser visão completa e editável; "esses dados não são segredos" para UX. Mantêm-se cifragem em repouso e proibição de log (custo zero).

### Teste de 7 dias só no serviço (como na 069)

- Hoje o início nasce no primeiro `entitlement`.
- **Rejeitada pelo usuário:** exige chamada inicial e consulta para decidir o bloqueio.

### Botão "Ver ID e chave" no bloqueio

- Chave não ficaria sempre à vista.
- **Rejeitada pelo usuário:** atrito para quem precisa da chave na compra.

## Consequências

### Positivas

- Zero requisições com o app parado (SC-001); no máximo ~10 por mês em uso típico (SC-007), todas por ação da pessoa.
- Bloqueio e teste 100% locais e offline; a abertura nunca depende do serviço.
- QR fixo funciona sem rede e sem expiração; entrada no painel sem digitação.
- O site mostra e edita as listas da TV por completo.

### Negativas

- **R-003**: reinstalar antes do primeiro contato manual reinicia o teste local (âncora reduz o efeito).
- **R-004**: foto ou captura do QR dá acesso ao painel e às credenciais das listas, agora também no serviço; mitigado por fragmento fora de servidor/log, "Gerar nova chave", limites de tentativa e recusa uniforme.
- **R-005**: estorno/chargeback só aparece no Atualizar.
- Credenciais IPTV passam a existir cifradas no serviço para todas as listas, não só as criadas no portal; vazamento do serviço expõe mais dados (chaves separadas e recuperação protegida, ADR-013).
- A tela Adicionar mantém o rótulo "Recarregar" por causa do contrato 070 C1; mudar exige emenda aprovada.
- Dependência nova de QR no pacote (`tizen_web_project.yaml`).

### Caminho de Migração / Evolução Futura

- Revisitar o teste local se houver fraude relevante por reinstalação: voltar a ancorar no cadastro automático seria nova decisão (e nova consulta).
- Revisitar a detecção de estorno se a venda for ligada com volume (consulta opcional ao abrir, por decisão explícita).
- Se a lib de QR falhar na TV física, trocar por outra mantendo o formato da URL (`buildFixedQrUrl` é a fronteira).
- A venda continua desligada até os riscos R-022..R-026 da 069 serem executados; esta ADR não a reabre.


**Atualização (ADR-020, 2026-10-16):** a chave TMDB digitada no portal só chega à TV no passo integrations do Atualizar da pessoa; continua sem consulta automática ao serviço. Ver ADR-020.
