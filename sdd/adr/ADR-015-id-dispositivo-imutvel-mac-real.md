# ADR-015: ID do dispositivo imutável — MAC real congelado ou derivado do DUID

## Status

Aceita (2026-10-13). Emenda a ADR-014 no item 1 da Decisão (origem e estabilidade do ID do dispositivo) e na alternativa "ID sempre gerado". O restante da ADR-014 (chave de 10 dígitos, entrada manual, valores salvos no painel) continua valendo.

## Data

2026-10-13

## Contexto

A ADR-014 deu à TV um **ID do dispositivo** no formato `XX:XX:XX:XX:XX:XX`, mostrado na tela Adicionar da TV e usado, com a chave, para entrar no portal. Desde a revisão de UX de 2026-10-13 o portal o apresenta como **"Endereço MAC"** (login, cartão do dispositivo, Ativar e FAQ). A licença anual (069) e a gestão de listas pelo portal (070) são conferidas pela pessoa através desse ID — ela confirma "o endereço MAC da TV que receberá a licença" antes de pagar.

O usuário pediu que esse ID **seja único por TV e nunca mude**. A leitura do código em 2026-10-13 mostrou:

- O ID já é atribuído **uma vez** por registro de aparelho (`DeviceDocument.display_id`) e sobrevive à rotação de chave (`access_rotation.py` só o define quando está vazio). Reinstalar o app não cria outro registro: a mesma TV, pelo DUID, recebe `recovery_required` e a recuperação reaproveita o registro.
- A origem, porém, é frágil: o app pede `webapis.network.getMac()`, mas `CCPlayTv/config.xml` **não declara** o privilégio de rede e a medição na TV física (T003 da 070) não foi feita. É provável que a TV real esteja recebendo um ID **aleatório** — estável, mas diferente do MAC que aparece nas configurações de rede da própria TV, o que contradiz o rótulo "Endereço MAC".
- O aleatório também não é reproduzível: se os dados do serviço se perderem, um recadastro da mesma TV ganha outro ID.
- `getMac()` devolve o MAC da conexão ativa; Wi‑Fi e cabo têm MACs diferentes.

## Decisão

1. **Imutabilidade.** O ID atribuído no primeiro cadastro — ou no upgrade da 070 (D-004) para TVs anteriores — é gravado no registro do aparelho e **nunca é reatribuído**: rotação/"Gerar nova chave", recuperação, reinstalação, troca entre Wi‑Fi e cabo ou mudança posterior do MAC não o alteram. O serviço DEVE recusar qualquer escrita que troque um `display_id` já definido (invariante do repositório, coberta por teste).
2. **Origem, em ordem de preferência**, decidida só na primeira atribuição:
   1. **MAC real da TV** (`source = "mac"`), lido pela plataforma no primeiro pareamento — o da interface ativa naquele momento — e congelado. Requer declarar em `config.xml` o privilégio de rede exigido por `webapis.network.getMac()` (`http://developer.samsung.com/privilege/network.public`), **depois** que a sonda T003 confirmar na TV física que o valor é útil.
   2. **ID derivado do DUID** (`source = "derived"`) quando o MAC estiver indisponível, inválido (zerado, broadcast, multicast) ou já pertencer a outra TV: `HMAC(chave do serviço, "display_id_derived" ‖ identidade da plataforma ‖ n)`, primeiros 6 bytes, com o bit *localmente administrado* ligado e o de multicast desligado (`octeto0 = (b0 | 0x02) & 0xFE`), em `XX:XX:XX:XX:XX:XX`. `n` começa em 0 e só sobe se o candidato já estiver tomado — continua determinístico. O DUID nunca sai do serviço nem é reconstruível pelo ID.
3. **Sem sorteio.** A geração aleatória (`generate_display_id`, `source = "generated"`) deixa de ser usada em atribuições novas.
4. **Registros existentes não mudam.** TVs que já têm ID — inclusive `generated` — mantêm o que têm (a imutabilidade vale mais que a origem). Registros de teste/staging anteriores à abertura comercial podem ser apagados por operação documentada, para nascerem de novo pelas regras acima; em produção, nunca.
5. A chave da derivação é versionada e guardada como as demais chaves do serviço (backup e recuperação protegidos, ADR-013); trocá-la só afeta derivações futuras, nunca IDs já gravados.
6. A identidade interna (`deviceId`) continua sendo a referência da licença e das configurações; o ID exibido é o rótulo público, estável, que a pessoa usa para conferir a TV.

**Atualização (ADR-017):** depois de "Desvincular" na TV, a mesma TV volta ao mesmo registro (mesmo ID) provando a posse com o código de recuperação que ela guardava, sem cadastro novo; o ID continua imutável. Ver ADR-017.

## Alternativas Consideradas

### ID aleatório gravado (comportamento atual da ADR-014)

- Sorteado uma vez e guardado no registro.
- **Rejeitada:** não bate com o MAC real quando a leitura falha e não é reproduzível — perda de dados do serviço faz a mesma TV reaparecer com outro ID, quebrando a conferência da licença.

### Recusar o pareamento sem MAC válido

- O ID seria sempre o MAC real.
- **Rejeitada:** TVs em que a API não devolve MAC (privilégio negado, modelo diferente) ficariam sem portal e sem compra pelo site.

### Sempre o MAC da interface com fio

- Mais estável e o mais usado por lojas/revendas.
- **Rejeitada por ora:** não há evidência de que `getMac()` devolva o MAC do cabo com a TV em Wi‑Fi; congelar o do primeiro pareamento resolve a estabilidade sem depender disso. Reavaliar se a T003 mostrar uma API para a interface com fio.

### ID que acompanha o MAC atual

- O ID mudaria ao trocar Wi‑Fi/cabo, sempre "certo" em relação à conexão do momento.
- **Rejeitada:** contraria o pedido central — licença e login no portal deixariam de reconhecer a TV pelo ID que a pessoa anotou.

## Consequências

### Positivas

- O ID que a pessoa confere na compra e usa no portal é o mesmo para sempre naquela TV.
- Com o privilégio, ele é o MAC real que aparece nas configurações de rede — o rótulo "Endereço MAC" passa a ser verdadeiro.
- Sem MAC, a mesma TV recebe sempre o mesmo ID, até depois de perda de dados do serviço.

### Negativas

- Depois de trocar Wi‑Fi por cabo (ou vice-versa), o ID pode diferir do MAC da conexão atual; o FAQ do portal precisa dizer isso.
- Exige um privilégio novo no pacote, a confirmar na TV física e na certificação da Samsung.
- TVs já cadastradas com ID aleatório continuam com ele (aceito: imutabilidade acima da origem).
- A derivação passa a depender de mais uma chave do serviço, que precisa de backup e versionamento.

### Caminho de Migração / Evolução Futura

- Implementar na 070 (antes de T042/TV física): derivação e invariante de imutabilidade em `api/app/portal/display_id.py`/`enrollment.py`/repositório, testes em `api/tests/portal/test_pairing.py`, T003 na TV e só então o privilégio em `config.xml`; atualizar a pergunta "O que é o endereço MAC" em `portal-web/src/lib/i18n/faq.ts`.
- Revisitar se a T003 mostrar que `getMac()` não funciona no Tizen 9 (aí o derivado vira a origem normal e o rótulo "Endereço MAC" do portal deve voltar a "ID do dispositivo") ou se surgir uma API para o MAC da interface com fio.
