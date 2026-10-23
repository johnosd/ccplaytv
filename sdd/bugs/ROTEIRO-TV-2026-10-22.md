# Roteiro único de verificação na TV — 6 bugs numa instalação

**Criado em**: 2026-10-22 · **Para**: fechar de uma vez os bugs cuja correção **já está aplicada e com testes verdes**,
e que só esperam alguém confirmar o sintoma no aparelho.

Na criação deste roteiro, os seis aguardavam confirmação na TV. **Validação concluída em 2026-10-22**:
o usuário informou "Todos os itens foram validados com sucesso" e autorizou o fechamento. Os seis passaram a
`verified`, com o relato físico registrado em cada `test.md`. O roteiro abaixo é preservado como histórico.

| Item | Cenário | Resultado na TV |
| --- | --- | --- |
| 1 | Foco e rolagem dos episódios | Aprovado pelo usuário |
| 2 | CH+/CH− e RETURN no player | Aprovado pelo usuário |
| 3 | Live sem "Carregando" indevido durante reprodução | Aprovado pelo usuário |
| 4 | Setas horizontais entre botões do trailer | Aprovado pelo usuário |
| 5 | Renovação Xtream após mais de 10 min, com navegação usável | Aprovado pelo usuário |
| 6 | Tempo percebido do guia EPG | Aprovado pelo usuário, sem medição em segundos |

O item 7 era apenas uma observação opcional em uso normal. Ele não reproduz armazenamento cheio nem substitui
a medição com a sonda; `armazenamento-app-cheio-na-tv-impede` continua pendente da fase Test.

## Antes de começar

- Pacote **normal** (sem instrumentação) instalado com `deploy-tv.ps1 -SkipBuild`, que preserva os dados.
- A lista real ativa, com catálogo já obtido.
- **Nada é desinstalado**, e os dados da TV não são apagados.

Para cada item: o que fazer, e **o que eu preciso saber**. Resposta curta serve — "passou" / "não passou" + o que viu.
Se qualquer um falhar, ele volta para `sdd-bugfix` com a evidência, e não é fechado.

---

## 1. Foco ao descer pelos episódios da série

**Bug**: `foco-some-ao-descer-na-lista` · **Correção**: a linha focada entra na janela virtual e rola junto.

**Faça**: abra uma série com **muitos episódios** (20+) → desça com `↓` até o fim da lista, sem pressa, e depois suba.

**Preciso saber**: o anel de foco ficou **visível em todas as linhas**, sem sumir nem "pular"? A lista acompanhou? E a
rolagem pareceu fluida ou engasgada?

---

## 2. CH+ / CH− trocando de canal no player

**Bug**: `ch-mais-menos-nao-trocam-canal` · **Correção**: aplicada, testes verdes.

**Faça**: abra a TV ao vivo, reproduza um canal **do meio da lista** (não o primeiro nem o último), feche os painéis
(nenhuma camada aberta) e aperte **CH+** e depois **CH−**. Depois aperte **RETURN**.

**Preciso saber**: CH+ foi para o canal seguinte e CH− voltou? O RETURN fez o que você esperava (sair do player)?

---

## 3. Live TV "Carregando" durante a reprodução

**Bug**: `live-tv-carregando-durante-reproducao` · **Correção**: aplicada junto com a do item 4.

**Faça**: reproduza um canal e **deixe tocando 1–2 minutos** sem mexer.

**Preciso saber**: apareceu "Carregando" sobre a imagem **enquanto o vídeo estava rodando normalmente**? (era o
sintoma). Se apareceu, em que momento?

---

## 4. Setas horizontais no trailer

**Bug**: `trailer-setas-horizontais-avancam-video-vez` · **Correção**: aplicada.

**Faça**: abra o detalhe de um filme que **tenha trailer**, inicie o trailer e aperte `←` e `→`.

**Preciso saber**: as setas navegaram **entre os botões** (correto) ou avançaram/voltaram o vídeo (o sintoma)?

---

## 5. Lista Xtream trazendo itens novos ao abrir

**Bug**: `lista-xtream-nao-atualiza-novos-filmes` · **Correção**: renovação ao abrir, se passaram mais de 10 min.

**Faça**: feche o app por completo, espere **mais de 10 minutos**, e abra de novo. Navegue por Filmes e Séries por
1–2 minutos enquanto a renovação acontece em segundo plano.

**Preciso saber**: a navegação ficou **usável** durante a renovação, ou travou/engasgou de forma perceptível? Apareceu
algum aviso de armazenamento? (esta é a ressalva: a renovação passou a acontecer com muito mais frequência que antes,
e o custo na TV nunca foi observado.)

---

## 6. Guia do EPG — tempo até aparecer

**Bug**: `guide-epg-demorando-carregar-na-tela` · **Correção**: menos transações de escrita. Você já **aceitou com
ressalva**; isto só confirma o tempo percebido.

**Faça**: abra o guia de programação a partir da TV ao vivo.

**Preciso saber**: a demora até a grade aparecer continua **materialmente perceptível**, ou está aceitável? Um palpite
de segundos basta.

---

## 7. (Opcional, se der tempo) Armazenamento do app cheio

**Bug**: `armazenamento-app-cheio-na-tv-impede` · **Estado**: correção `applied`, falta a **fase Test** inteira.

Este é o único dos sete que precisa de **medição**, não só de olhar — e provavelmente não fecha nesta rodada. Se a TV
estiver com o armazenamento folgado, não há como reproduzir o cenário (app cheio impedindo gravar a licença e
desvincular). Me diga apenas se **aparece algum aviso de armazenamento** em uso normal; se aparecer, eu monto a
medição com a sonda.

---

## Depois

Os seis cenários foram encerrados como `verified` após a confirmação do usuário em 2026-10-22. Cada `test.md`
registra a data, o cenário aprovado e a origem da evidência. Não houve nova execução automatizada nesta atualização.
