# Assessment Problem: Rádio global por país

- **Slug**: radio-global-por-pais
- **Criado**: 2026-10-15
- **Explora**: ./explora.md

## Problem Statement

Quem usa o ccplayTv não tem como ouvir rádio pela TV: para ter música ou rádio
de fundo, precisa sair do app e usar outro. O app só toca o que a lista IPTV da
pessoa traz, e as rádios que algumas listas incluem não têm uma experiência
própria.

## Usuários / Partes Afetadas

- **Pessoa que assiste na TV** — quer usar a TV como rádio (ambiente, música,
  rádio da cidade ou de outro país) sem trocar de app nem depender da lista IPTV.
- **Dono do produto** — interesse direto na feature (vista no Open-Media-Explorer).
  É o único sinal de demanda hoje: não houve pedido de clientes ou revendedores, e
  não foi levantado se concorrentes oferecem isso.

## Goals

- Com uma lista ativa, a pessoa abre "Rádio" por um **item novo na topbar**,
  escolhe um **país** (todos os do diretório, ordenados pela quantidade de
  estações), vê as **estações** dele (as mais populares e não quebradas) e toca
  uma com OK. RETURN para a reprodução e volta com o foco restaurado por id.
- **Favoritos de estações**: guardar e reencontrar estações, com chave estável
  `radio-browser:<stationuuid>`, nunca a URL do stream.
- Funciona client-first (ADR-008): a TV consulta o diretório Radio Browser
  direto, sem backend (CORS verificado em 2026-10-15).
- Tela "tocando agora" para áudio (o plano de vídeo fica preto): nome, país e
  arte da estação. Nenhum dado inventado: sem frequência, sem dial cosmético.

## Non-Goals

- Dial skeuomórfico, frequência MHz ou "girar toca na hora" do OME (dado
  inventado / focar não toca — constitution).
- Rádio sem lista ativa (na tela de perfis ou antes de escolher lista).
- Reprodução em segundo plano enquanto se navega pelo app.
- Mostrar as rádios `radio="true"` da própria lista nesta tela (pode ser etapa futura).
- Busca de estação por nome, filtros por gênero/idioma, histórico de estações.
- TV ao vivo do iptv-org (a outra "banda" do Tuner do OME).
- Metadados "tocando agora" da música (ICY), gravação, equalizador.
- Backend/proxy para o diretório.

## Success Metrics

- **Toca na TV física**: na TV de referência (QN50Q60DAGXZD), ≥ 8 das 10
  estações mais populares do Brasil no Radio Browser (filtradas pelos codecs
  aceitos) tocam áudio no AVPlay.
- Fluxo país → estação → tocar → RETURN → outra estação inteiro só com D-pad,
  sem foco preso em carregando/vazio/erro, com o foco restaurado por id ao voltar
  (a ser checado no E2E e na passada `tizen-tv`).

## Cost of Inaction

Baixo e sem urgência. Nenhum usuário pediu; o app segue cumprindo o núcleo (listas
IPTV). Quem quer rádio usa outro app da TV. O custo é só a oportunidade de um
diferencial cujo valor não está medido.
