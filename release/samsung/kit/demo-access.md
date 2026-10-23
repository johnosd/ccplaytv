# Acesso de demonstração (DemoAccess) — sanitizado

Referência para o campo de acesso de teste do Seller Office (`SAM-KIT-TESTACCESS`). **Nenhum valor
de credencial entra aqui, no git ou em log** (FR-012, FR-016): só onde o segredo está e quem
responde por ele.

| Campo | Valor |
| --- | --- |
| Variante | commercial (R-015) |
| Licença do revisor | teste de 7 dias contado na própria TV a partir da instalação nova — sem voucher nem compra |
| Tipo de lista | lista M3U **pública** de teste, só com filmes abertos da Blender Foundation (Big Buck Bunny, Sintel, Tears of Steel; licença livre): `https://johnosd.github.io/ccplaytv/teste/lista.m3u` (arquivo `bridge/teste/lista.m3u`) |
| Onde está o segredo | não há segredo: a lista é pública e não tem usuário, senha nem chave de nenhum provedor |
| Dono | release |
| Validade | conferência válida até 2027-04-23; os streams são de terceiros (Mux, Unified Streaming e `download.blender.org`) e podem mudar, então **reconfira cada URL antes de enviar** |
| Escopo | só leitura de catálogo e reprodução; sem acesso ao painel do provedor |

reviewerAccess: local-trial-7d
validUntil: 2027-04-23

Quando a lista de teste existir, registre a validade numa linha `validUntil: AAAA-MM-DD` neste
arquivo, atualize o hash no `manifest.json` e mude o item para `Pass`. O gate bloqueia o item sem
`validUntil`, com a validade vencida, ou, no comercial, sem a linha `reviewerAccess: local-trial-7d`
(R-004). Os dados da lista vão só no campo do Seller Office e na cópia do pptx fora do git
(`ui-description.md`).

## Como o revisor usa a lista

1. Instalar e abrir o app: o teste gratuito de 7 dias começa sozinho, com todos os recursos.
2. Em "Adicionar lista" → "Lista M3U", informar o nome (por exemplo "Teste") e a URL `https://johnosd.github.io/ccplaytv/teste/lista.m3u`.
3. Depois da importação: **TV ao vivo** → "Teste Blender" (Big Buck Bunny e Tears of Steel em HLS) e **Filmes** → "Blender" (trailers de Sintel em MP4 e o filme Sintel em MKV). A seção Séries fica vazia de propósito.
4. Para a busca de legendas, abrir "Sintel (2010)" e usar o painel de áudio e legendas do player.

## Antes de enviar (checklist da release)

- [ ] `bridge/teste/lista.m3u` publicada (merge na `main` e deploy do Pages) e a URL acima responde 200.
- [ ] Cada stream da lista responde (`curl -r 0-4095 -L <url>`) — conferido pela última vez em 2026-10-23.
- [ ] Trocar o item `SAM-KIT-TESTACCESS` do `manifest.json` para `Pass` e recalcular o hash deste arquivo.

