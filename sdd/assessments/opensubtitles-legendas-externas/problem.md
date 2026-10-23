> **Revisão vigente (2026-10-21, ADR-021):** o usuário substituiu BYOK exclusivo por chave padrão mantida no serviço do ccplayTv e credencial pessoal opcional, com caminho direto quando permitido. O texto abaixo preserva a avaliação original. A interpretação e o scorecard atuais estão em [reavaliacao-chave-padrao.md](./reavaliacao-chave-padrao.md); o veredito permanece `needs-clarification`, com pendências revisadas.

# Assessment Problem: Legendas externas OpenSubtitles com BYOK

- **Slug**: opensubtitles-legendas-externas
- **Criado**: 2026-10-21
- **Explora**: ./explora.md
- **Entrada adicional**: respostas estruturadas do usuário nesta conversa, posteriores à captura de Explora.

## Problem Statement

O usuário encontra filmes e episódios cuja legenda disponível não atende à necessidade de compreensão. Precisa obter uma opção adequada em português brasileiro, inglês ou espanhol dentro do ccplayTv, sem abandonar a reprodução ou depender de uma chave compartilhada do desenvolvedor.

## Usuários / Partes Afetadas

- **Usuário do ccplayTv** — confirmou que a falta já acontece em seu uso de filmes/séries; busca idiomas pt-BR, en e es.
- **Outros usuários com a mesma necessidade** — público potencial, ainda não dimensionado. ASSUMPTION: a frequência justifica o recurso como diferencial do produto; não há pesquisa quantitativa de demanda.
- **Desenvolvedor/operação** — precisa manter o modelo escolhido de chave própria de cada pessoa, sem embuti-la no pacote.
- **OpenSubtitles** — precisa aceitar o modelo de integração do aplicativo distribuído; funcionamento técnico de uma chave não comprova essa aceitação.

## Decisões do Usuário

| Questão | Resposta explícita | Consequência |
| --- | --- | --- |
| Problema a priorizar | Opção 1: obter legendas, ampliando os idiomas para pt-BR, en e es | Recurso para filme/episódio sem legenda adequada; não foi escolhida automação em todo play |
| Evidência de necessidade | Já acontece no seu uso | Dor pessoal confirmada; tamanho de mercado não inferido |
| Modelo de chave | Seguir o exemplo da chave TMDB | BYOK como requisito; nenhuma aceitação presumida de servidor/plano pago |
| Conflito com orientação do fornecedor | Manter BYOK e condicionar o avanço à aceitação pelo OpenSubtitles | Validação externa obrigatória antes de comprometer a feature |

A manifestação “seguir o TMDB” foi esclarecida: não significa colocar a chave do desenvolvedor no frontend. A própria pessoa fornece sua chave. A autorização para ler OPEN_SUBTITLES_API_KEY no .env abrange apenas a prova desta avaliação.

## Goals

- Avaliar uma forma opcional de obter legendas em pt-BR, en e es para filmes e episódios já disponíveis na lista.
- Preservar BYOK, com a chave da própria pessoa, se o fornecedor aceitar esse uso no ccplayTv distribuído.
- Permitir escolha consciente de versão/idioma e desativação; manter reprodução, retomada e legenda embutida utilizáveis.
- Reduzir dependência de legendas oferecidas pelo stream, sem prometer correspondência ou sincronismo perfeitos por título.
- Confirmar viabilidade por etapas: API no PC → contrato do fornecedor → reprodução/sincronismo no aparelho.
- Manter dados IPTV fora do serviço de legendas e manter o vídeo em Direct Play.

## Non-Goals

- Implementar a feature, criar spec/plano numerado ou alterar o player nesta avaliação.
- Embutir chave compartilhada, ofuscar segredo no pacote ou introduzir variável pública VITE para essa chave.
- Exigir serviço do ccplayTv para a proposta BYOK ou presumir contratação de um plano.
- Pesquisar ao focar cards, baixar em lote, procurar legendas automaticamente em todo play ou atrasar o início do vídeo.
- Transcrever áudio, traduzir com IA, enviar vídeo ou ler o stream apenas para calcular moviehash.
- Garantir que qualquer resultado pelo ID da obra corresponda à edição exata do vídeo.
- Importar o proxy/armazenamento do xstream-player ou prometer suporte no Tizen a partir de testes no PC.

## Success Metrics

Estas métricas descrevem o que a solução precisará comprovar; resultados parciais são explicitados, sem inventar cobertura de catálogo ou prazo de implementação.

| Métrica verificável | Evidência / alvo de validação | Estado |
| --- | --- | --- |
| API com os três idiomas | Buscar filme e episódio em pt-BR, en e es; registrar status e contagens | 6/6 combinações com HTTP 200, em duas obras públicas |
| Download válido como arquivo | Uma solicitação e um arquivo obtidos com HTTP 200 e timestamps presentes | Aprovado no PC para pt-BR; demais idiomas sem download solicitado |
| BYOK aceito para aplicativo distribuído | Confirmação aplicável do fornecedor sobre cada usuário cadastrar e usar a própria chave no ccplayTv | Não obtida; bloqueia go |
| Eficácia na dor real | Medir quantidade e proporção de títulos problemáticos do usuário que passam a ter legenda utilizável, com conferência de sincronismo | Sem amostra de streams reais; sem percentual de sucesso prometido |
| Fluxo completo no aparelho | Buscar/selecionar/desativar; validar pausa, retorno, seek e retomada com a versão do vídeo correta | Não executado; gate de entrega futuro |
| Ausência de segredo compartilhado no cliente | Zero chave do desenvolvedor no pacote, variáveis públicas, logs e erros | Restrição obrigatória; não há implementação |
| Privacidade do provedor | Zero URL de playback, host/credencial IPTV ou arquivo de vídeo enviados ao OpenSubtitles | Atendido no experimento; obrigatório no produto |
| Trabalho sob ação da pessoa | Zero consulta ao focar; nenhum download repetido enquanto o arquivo válido estiver no cache | Alvo de implementação; não executado |
| Degradação controlada | Indisponibilidade/cota/erro de legenda não impede o uso normal do player | Alvo de implementação; não executado |
| Orçamento de cache | Medir bytes e limitar/recolher cache de legenda sem apagar favoritos/histórico/progresso | Alvo de implementação; não executado |

A API retornou remaining=99 após o único download: é uma leitura daquele contexto, não uma franquia universal nem confirmação de custo em produção.

## Cost of Inaction

A pessoa continua dependente da legenda oferecida pelo stream ou de um fluxo externo para os títulos afetados. O problema de compreensão permanece; não há evidência que permita quantificar abandono, receita perdida ou prioridade acima dos gates existentes do aplicativo.

Adiar a feature até esclarecer o modelo BYOK evita criar uma integração que funciona tecnicamente, mas não é aceita pelo fornecedor. O custo dessa espera é deixar sem solução os casos atuais; a existência do recurso pode continuar sendo investigada sem mudar a arquitetura.

## Evidências Complementares

- [Explora](./explora.md): bases, limitações e referências oficiais.
- [API pt-BR e download no PC](./evidencias/api-real-pc-download.json).
- [Buscas em inglês e espanhol](./evidencias/api-idiomas-pc.json): filme en 67 resultados (50 nesta página), episódio en 16; filme es 62 (50 nesta página), episódio es 26. Nenhum download adicional.
- Testes não acessaram catálogo/provedor do usuário, não enviaram dados IPTV e não validaram AVPlay.
