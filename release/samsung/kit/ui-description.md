# Application UI Description — rascunho (CCPlayTV, variante base)

Rascunho do conteúdo a transcrever no **template oficial** da Samsung (Seller Office →
Application UI Description). `SAM-KIT-UIDESC` fica `Pending` até o template preenchido entrar no
kit e no manifest. Nada aqui contém credencial, URL de lista ou chave.

## Idiomas

Português (padrão), inglês e espanhol — seleção em Ajustes. Textos vindos da lista (nomes de
canal, categoria, título) aparecem como o provedor os declara, sem tradução.

## Teclas do controle remoto

| Tecla | Uso |
| --- | --- |
| Setas | Mover o foco entre cards, fileiras, categorias e botões |
| OK / Enter | Abrir o item focado; no canal ou episódio, iniciar a reprodução |
| Voltar (Return) | Voltar à tela anterior com o foco restaurado; na tela inicial, oferecer sair do app |
| Exit | Sair do app |
| Play/Pause, Stop, FF, REW | Controles do player conforme a mídia (sem avanço em TV ao vivo sem janela de DVR) |
| Channel Up / Down | Trocar de canal na TV ao vivo |

Mover o foco nunca inicia reprodução nem consulta externa; só OK reproduz.

## Telas e fluxo principal

1. **Splash** — abertura do app.
2. **Selecione ou adicione sua lista** — um card por playlist Xtream/M3U e o card "Adicionar lista".
3. **Conecte sua playlist** (condicional: sem lista ou ao escolher "Adicionar lista") — formulário
   com teclado na tela: tipo Xtream (servidor, usuário, senha) ou URL M3U. A importação da
   estrutura acontece na TV.
4. **Início** — barra superior persistente (Início, TV ao vivo, Filmes, Séries, Rádio, Buscar e a
   lista ativa, que leva à troca de lista) e fileiras Continuar assistindo, Minha Lista, Canais
   favoritos, Filmes adicionados e Séries adicionadas.
5. **TV ao vivo** — trilho de categorias da lista; ao entrar numa categoria, a grade de canais; OK
   abre o player em tela cheia; guia de programação quando a lista oferece.
6. **Filmes / Séries** — trilho de categorias, grade de títulos, tela de detalhe (temporadas e
   episódios nas séries); capas e sinopses do TMDB só com a chave TMDB da própria pessoa.
7. **Rádio** — estações públicas do diretório Radio Browser por país.
8. **Ajustes** (a partir da tela de listas) — idioma, chave TMDB, categorias ocultas e bloqueio
   por PIN, aba Playlists para gerenciar as listas.

## Fluxos condicionais

- **Sem lista**: o app abre direto no formulário de adicionar lista.
- **Categoria bloqueada**: pede o PIN da lista antes de mostrar o conteúdo.
- **Lista inválida ou provedor fora do ar**: mensagem de erro com ação focável (tentar de novo,
  editar a lista).
- **Portal, QR de pareamento e licença**: existem **só na variante comercial**, que não é a
  distribuída neste Tizen ID (`release/samsung/distribution.json`).
