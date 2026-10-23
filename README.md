# CCPlay TV

**Sua TV, suas listas, do seu jeito.**

CCPlay TV organiza listas IPTV M3U/M3U8 e Xtream em uma experiência feita para Smart TVs Samsung com Tizen. A pessoa importa a própria fonte, encontra canais, filmes e séries e controla tudo pelo controle remoto.

> O CCPlay TV não fornece, hospeda ou distribui listas, canais ou conteúdo digital. As fontes são sempre adicionadas pela própria pessoa.

## O que você encontra no produto

- **Suas listas em um só lugar:** importação por arquivo, URL ou credenciais Xtream, com categorias preservadas como o provedor as define.
- **TV ao vivo, filmes e séries:** catálogo local, favoritos, histórico, retomada, busca, EPG e reprodução direta na TV.
- **Experiência feita para o controle remoto:** foco visível, navegação por setas, retorno ao ponto anterior e interface adaptada à tela grande.
- **Metadados opcionais:** integração com TMDB por chave própria para capas, detalhes, elenco, semelhantes e trailers.
- **Portal opcional:** acesso pelo site para gerenciar a mesma TV e enviar para ela as chaves próprias de TMDB e de legendas (OpenSubtitles e SubDL), que a TV aplica ao apertar **Atualizar**, sem exigir uma conta pessoal para usar o aplicativo.

## Como começar

1. Instale o aplicativo na TV Samsung compatível.
2. Adicione uma lista por URL, arquivo M3U/M3U8 ou Xtream Codes.
3. Escolha sua lista e navegue por canais, filmes e séries.

O catálogo e a reprodução permanecem no aparelho. O portal complementa a experiência, mas não é necessário para importar uma lista ou assistir ao conteúdo.

## Portal, licença e backup

Em **Configurações → Portal & licença**, a TV exibe QR, ID e chave do dispositivo para acessar o portal. Ações raras — como recuperar acesso, gerar nova chave ou desvincular a TV — ficam em **Avançado**. O backup tem sua própria aba.

O fluxo de compra por Pix existe para desenvolvimento, teste e staging. A venda real permanece desligada até a conclusão dos gates de segurança, pagamento, restauração e validação em TV física.

## Situação do projeto

O CCPlay TV está em desenvolvimento ativo. O núcleo é **client-first**: importação, catálogo, preferências e reprodução rodam na TV com IndexedDB. O portal é complementar e só é consultado por ações explícitas da pessoa.

O status, as pendências e as evidências de cada feature ficam no [backlog](.planning/backlog.md) e em `sdd/specs/<feature>/plan.md`. Esses documentos são a fonte de verdade.

## Saiba mais

| Quero entender… | Consulte |
| --- | --- |
| Capacidades, limites e integrações do produto | [Guia de produto](docs/produto.md) |
| Arquitetura, comandos, testes e empacotamento | [Guia de desenvolvimento](docs/desenvolvimento.md) |
| Decisões técnicas do projeto | [ADRs](sdd/adr/) |
| Operação e dependências do portal | [Documentação do portal](docs/portal/) |
| Design para TV e acessibilidade | [Guia de práticas para TV](docs/guia-praticas-app-tv/README.md) |
| Estado de cada feature | [Backlog](.planning/backlog.md) |

## Desenvolvimento rápido

```bash
cd tv-web
npm install
npm run dev
```

Consulte o [guia de desenvolvimento](docs/desenvolvimento.md) antes de executar testes E2E, gerar o pacote Tizen ou instalar em uma TV física.

