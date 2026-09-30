# Assessment Problem: EPG externo como fallback por canal

- **Slug**: epg-externo-como-fallback-por-canal
- **Criado**: 2026-09-29
- **Explora**: ./explora.md

## Problem Statement

A programação de TV (EPG) do app depende inteiramente do que a lista IPTV/provedor entrega, e no painel de referência isso cobre só ~10 de 954 canais. Sem alternativa, "Agora"/"A seguir" e o Guia completo ficam vazios para a maioria dos canais, e o resultado varia com a lista que a pessoa usa.

## Usuários / Partes Afetadas

- Pessoa que assiste Live TV com lista de provedor de EPG fraco — vê canais sem programação em quase toda a Live, no player, na Home e no Guia.
- Mantenedor do app — passa a manter uma tabela curada de mapeamento e a monitorar a fonte externa.

## Goals

- Aumentar a cobertura de canais BR com programação, usando o EPG externo apenas onde o provedor não tem dados (fallback por canal).
- Não depender do provedor para ter EPG dos canais BR mais comuns.
- Manter o casamento canal↔programa por mapeamento explícito (tabela curada estática), nunca por nome automático.
- Consumir apenas arquivos públicos de terceiros direto do app, sem servidor próprio.

## Non-Goals

- Backend próprio com servidor sempre no ar ou reativação de `api/`. (Atualizado em 2026-09-29: um job diário em free tier que só publica um arquivo estático **passou a ser aceito**, deixando de ser non-goal.)
- Casamento fuzzy automático por nome.
- Cobertura de canais fora do Brasil nesta primeira entrega.
- Tela de confirmação manual de mapeamento pela pessoa (fica para depois, se a tabela curada não bastar).
- Inventar programação onde nenhuma fonte tem dado (continua slot vazio).

## Success Metrics

- Cobertura: proporção de canais BR da lista de referência com pelo menos um programa na janela "agora" sobe de ~10 canais para um alvo a definir no `sdd-specify` (medir antes/depois com a mesma lista real).
- Zero casamentos errados conhecidos na amostra conferida (programa de outro canal).
- Sincronização do fallback concluída sem travar a navegação (mesmo critério de fluidez da SC-002 da feature 030).
- Falha da fonte externa nunca apaga a programação anterior nem quebra o EPG do provedor.

## Cost of Inaction

A Live TV segue com EPG vazio na maior parte dos canais para quem usa esse provedor; as features 030/031, já entregues, entregam pouco valor visível. A alternativa manual (digitar uma URL XMLTV em Configurações) continua existindo, mas sem mapeamento não casa com os ids da lista.
