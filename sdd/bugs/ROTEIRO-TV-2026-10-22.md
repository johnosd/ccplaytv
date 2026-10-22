# Roteiro único de verificação na TV — 6 bugs numa instalação

**Criado em**: 2026-10-22 · **Para**: fechar de uma vez os bugs cuja correção **já está aplicada e com testes verdes**,
e que só esperam alguém confirmar o sintoma no aparelho.

Todos os seis estão em `partial`/`applied` por **um** motivo: "confirmar na TV". Nenhum tem código pendente. Em vez de
seis sessões, é um roteiro de ~10 minutos.

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

Com as respostas, eu fecho como `verified` o que passou, reabro com `sdd-bugfix` o que falhou — e cada `test.md`
recebe a evidência do que você viu, com data. Nenhum veredito muda sem a sua confirmação.
