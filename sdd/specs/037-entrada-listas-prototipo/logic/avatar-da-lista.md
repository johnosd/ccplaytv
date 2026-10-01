# Lógica: avatar da lista (iniciais + par de cores estável)

Feature 037, FR-005 e Edge Cases "Iniciais". Implementação em
`tv-web/src/features/profiles/listAvatar.ts` (stub criado pelo `sdd-plan`),
contrato em `listAvatar.entrada-listas.contract.test.ts` (travado).

## Por que existe

O protótipo `profiles()` desenha cada cartão com um avatar de iniciais sobre um
gradiente (`--a1`/`--a2`). No app, perfil = lista (ADR-011 §2): não há avatar
escolhido pela pessoa, então ele é **derivado** da lista — nunca persistido,
nunca gravado no Dexie. A mesma lista precisa ter sempre as mesmas cores, entre
sessões e entre renders, senão o cartão "troca de cara" a cada abertura.

## `listInitials(displayName: string): string`

```text
nome = displayName.trim()
palavras = nome dividido por espaço em branco (\s+), sem vazias
se palavras.length >= 2:
    iniciais = primeiro code point de palavras[0] + primeiro code point de palavras[1]
senão se palavras.length == 1:
    iniciais = até os dois primeiros code points de palavras[0]
senão:
    iniciais = ''            // nome vazio não acontece (o cadastro exige nome), mas não quebra
retornar iniciais.toLocaleUpperCase('pt-BR')
```

- Code point, não unidade UTF-16: use `Array.from(palavra)` — um emoji ou
  caractere fora do BMP não pode ser partido ao meio.
- Nada de filtrar "só letras": `"123"` → `"12"`, `"Lista 2"` → `"L2"`. A regra
  é previsível e o contrato cobre os casos que importam.
- Exemplos travados: `Sala`→`SA`, `Minha Lista Principal`→`ML`,
  `"  família  "`→`FA`, `ótima lista`→`ÓL`, `123`→`12`, `X`→`X`.

## `listAvatarVariant(sourceId: string): number`

Hash estável do **id** da lista (nunca do nome — renomear não troca a cor; nunca
da URL — a constitution proíbe identidade por URL), reduzido ao número de pares.

```text
h = 0x811c9dc5                         // FNV-1a 32 bits
para cada unidade UTF-16 c de sourceId:
    h = h XOR c
    h = Math.imul(h, 0x01000193) >>> 0
retornar h % LIST_AVATAR_VARIANTS      // 0..5
```

- Determinística, sem estado, sem `Math.random`, sem data.
- `LIST_AVATAR_VARIANTS = 6` casa com os seis pares de tokens de cor (abaixo).
  Mudar um sem o outro quebra o CSS — mudar os dois juntos é permitido.

## Pares de cores (tokens, `tv-web/src/index.css`)

Seis pares `--list-avatar-N-from` / `--list-avatar-N-to` (N = 0..5), todos
**referenciando** as cores de marca que já existem (`--brand-1..5`) — nenhuma
cor nova, nenhum hex solto na tela (ADR-007: o gradiente de marca é reservado à
identidade, e o avatar da lista é identidade da lista):

| N | from | to |
|---|------|----|
| 0 | `--brand-1` | `--brand-2` |
| 1 | `--brand-2` | `--brand-3` |
| 2 | `--brand-4` | `--brand-5` |
| 3 | `--brand-5` | `--brand-1` |
| 4 | `--brand-3` | `--brand-4` |
| 5 | `--brand-1` | `--brand-5` |

O cartão aplica o par por classe (`.list-avatar--N`) ou por
`style={{ '--avatar-from': 'var(--list-avatar-N-from)', ... }}` — escolha do
executor; o que não pode é hex literal no TSX ou no CSS da tela.

O texto das iniciais fica sobre o gradiente em `--bg-base` (tinta escura), como
o triângulo da marca, para contraste nas seis combinações.
