# ADR-019: Portal & licença com QR, ID e chave à vista e código de recuperação atrás do olho

## Status

Aceita (2026-10-16). Emenda a ADR-016 (decisão 6: chave em Portal & licença "só por ação explícita") e, por consequência, o item (f) da exceção de "Segredos Fora dos Clientes e dos Logs" da constitution (1.13.0 → 1.14.0). ADR-014, ADR-015 e ADR-017 continuam valendo; as demais decisões da ADR-016 não mudam.

## Data

2026-10-16

## Contexto

A tela Configurações → Portal & licença acumulou ações de quatro features (069, 071, 072, 073) numa única fileira de 12 botões: Abrir portal (QR), Mostrar chave da TV, Revogar, Mostrar código da licença, Gerar novo código, Recuperar, Atualizar, Comprar/Renovar, mais quatro de backup e Desvincular (`tv-web/src/features/settings/PortalLicensePanel.tsx`). Ver a chave ou o código passa por um modal de aviso ("ambiente privado"), confirmação e fechamento automático em 60 s; ver o QR exige apertar "Abrir portal".

O usuário (2026-10-16) avaliou a tela como "confusa" e "bem ruim" de UI/UX e pediu:

- mostrar **já de cara** o QR, o ID do dispositivo (formato MAC) e a chave do dispositivo;
- deixar o **código da licença** atrás de um **ícone de olho** que mostra/oculta, sem fluxo de aviso;
- levar o **backup** para um item próprio do menu (isso é reorganização de UI, não decisão arquitetural; fica para a spec do redesenho).

Os dois primeiros pontos conflitam com a ADR-016 decisão 6 e com a constitution 1.13.0 item (f) ("fora de Adicionar lista e do bloqueio, continua só por ação explícita em Portal & licença"). O parágrafo de 069 ("device key e código da licença PODEM ser revelados somente por ação explícita na superfície protegida da TV") também é tocado quanto à chave.

Risco marginal avaliado: a chave **já** fica à vista o tempo todo em Adicionar lista (ADR-014) e na tela de bloqueio (ADR-016 decisão 6), e o QR fixo **já** a carrega no fragmento (R-004, risco aceito). Mostrá-la numa terceira tela, que a pessoa só alcança indo de propósito em Configurações, quase não amplia a exposição. O código da licença é diferente: é credencial de **recuperação** (troca de dono do registro, ADR-013/017), mais sensível que a chave, e por isso continua atrás de uma ação explícita, só que mais leve.

## Decisão

1. **QR, ID e chave à vista em Portal & licença.** Ao abrir a tela, ela mostra sem nenhuma ação o QR fixo (`<site>/#id=<ID>&key=<chave>`, gerado localmente, ADR-016 decisão 5), o ID do dispositivo e a chave de 10 dígitos. Se a TV ainda não tem cadastro, abrir esta tela é a "primeira necessidade de ID/chave" já prevista na ADR-016 decisão 3 (cadastro preguiçoso): uma requisição única, nunca repetida ao reabrir. Sem conexão/configuração, a tela mostra um estado acionável no lugar do QR, nunca um vazio sem foco.
2. **Código da licença atrás do olho.** O código começa **sempre oculto** (máscara) ao abrir a tela. SELECT no controle de olho alterna mostrar/ocultar **na própria tela**, sem modal de aviso e **sem limite de tempo**; uma linha curta fixa ao lado orienta guardar em local privado. Ele volta a ficar oculto quando a pessoa sai da tela, quando a página vai para segundo plano (`visibilitychange` oculto, `pagehide`) e quando o código é regenerado. Focar o olho não revela nada (focar seleciona, SELECT age).
3. **O resto das proibições não muda.** Chave e código continuam fora de cards comuns, perfis, avisos, histórico, erros, diagnóstico, logs, URL enviada ao servidor, analytics, checkout e exportação; o código continua fora do QR. "Gerar nova chave" continua invalidando QR e sessões, e passa a atualizar o QR exibido na mesma hora.
4. **Ações destrutivas continuam com confirmação.** Revogar/Gerar nova chave, Gerar novo código e Desvincular mantêm diálogo de confirmação — o que sai é só o diálogo de *revelar*.

## Alternativas Consideradas

### Manter "só por ação explícita" e só reorganizar os botões

- Agruparia os 12 botões sem mudar regra nenhuma.
- **Rejeitada pelo usuário:** o problema central é o número de passos para ver ID/chave/QR, que a pessoa precisa toda vez que vai ao site; mantê-los atrás de botão + modal preserva a confusão.

### Olho que se oculta sozinho após 60 s

- Reduz o tempo de exposição do código caso a pessoa esqueça a tela aberta.
- **Rejeitada pelo usuário:** prefere que o olho só alterne; ocultar ao sair da tela e em segundo plano já cobre o caso de "esqueci aberto" quando a TV é desligada ou troca de app.

### Olho com aviso de "ambiente privado" antes de revelar

- Equivale ao fluxo atual, só trocando o botão por ícone.
- **Rejeitada pelo usuário:** mantém o passo extra que torna a tela confusa; o aviso vira uma linha fixa de texto, sem bloquear.

### Mostrar também o código da licença à vista

- Zero passos para quem precisa recuperar o acesso.
- **Rejeitada:** o código transfere o registro para quem o tiver; deixá-lo visível na mesma tela que o QR juntaria numa foto tudo o que dá controle total da TV no serviço. Não foi pedido.

### Esconder a chave em texto e deixar só o QR

- Menos dado sensível em texto.
- **Rejeitada:** o QR já contém a chave; esconder o texto não protege nada e obriga quem não usa câmera a ir para Adicionar lista para digitar.

## Consequências

### Positivas

- Ver ID, chave e QR passa de 2–3 interações (botão, aviso, confirmar) para zero; o código da licença, de 3 para 1.
- Some o modal de revelar (`PortalPrivateDialog` nos tipos `key`/`code`), simplificando foco e testes.
- Consistência: a chave aparece da mesma forma em Adicionar lista, bloqueio e Portal & licença.

### Negativas

- **R-004 ampliado (pouco):** uma terceira tela exibe a chave e o QR de forma contínua; foto/captura dela dá acesso ao painel e às credenciais das listas. Mitigação inalterada: "Gerar nova chave", limites de tentativa, recusa uniforme, fragmento fora de servidor/log.
- **Código sem prazo de exposição:** revelado, fica na tela até a pessoa ocultar, sair ou a TV ir para segundo plano. Risco aceito pelo usuário em troca de menos passos.
- Abrir Portal & licença pela primeira vez numa TV sem cadastro passa a disparar o `enroll` sem um botão intermediário. Já era permitido pela ADR-016 decisão 3, mas agora acontece sempre que a tela é aberta sem cadastro (continua uma única vez por TV).
- Os testes de contrato travados de 069/071/073 que exercitam "Mostrar chave"/"Mostrar código"/"Abrir portal" precisam de emenda aprovada na spec do redesenho.

### Caminho de Migração / Evolução Futura

- Se aparecer abuso por captura de tela (ex.: relatos de painel invadido), reintroduzir a ocultação por tempo no código ou um olho também na chave — decisão nova, revisitando esta ADR.
- O redesenho da tela (agrupamento das ações, item "Backup" próprio no menu de Configurações, hierarquia visual V14) é escopo de feature (`sdd-specify`), não desta ADR.
## Atualização (feature 076, 2026-10-16)

- **Nome:** o "código da licença" deste documento é o **código de recuperação** (credencial de reserva do vínculo da TV com o portal; nunca foi uma licença comprada). O texto acima mantém o termo original por ser histórico.
- **Lugar:** o olho sai da tela principal e vai para a subtela **Avançado** da mesma aba, junto de Gerar nova chave e código, Recuperar pelo site e Desvincular esta TV (cada uma com texto de "para que serve / quando usar"). A tela principal só mostra uma linha lembrando de guardar o código.
- **Regra de exibição inalterada:** oculto por padrão, SELECT no olho, sem modal e sem prazo, oculto ao sair da subtela/aba, em segundo plano ou ao regenerar; focar não revela. QR, ID e chave seguem à vista (decisão 1). Constitution 1.14.1 (esclarecimento, PATCH).
