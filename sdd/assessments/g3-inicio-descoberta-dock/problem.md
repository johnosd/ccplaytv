# Assessment Problem: G3 — Início, descoberta e dock

- **Slug**: g3-inicio-descoberta-dock
- **Criado**: 2026-10-06
- **Explora**: ./explora.md

## Problem Statement

A pessoa quer medir a conexão da própria TV para ajudar a investigar travamentos, mas o app só oferece um placeholder de teste de velocidade. Não há lacuna concreta de descoberta relatada após 057/060, nem demanda atual por clima.

## Usuários / Partes Afetadas

- Pessoa assistindo IPTV na TV — quer obter evidência da conexão no mesmo aparelho em que o problema ocorre; medir outro dispositivo não caracteriza aquela conexão.
- Pessoa escolhendo filmes/séries — já dispõe da descoberta existente; o usuário não relatou necessidade adicional neste momento.

## Goals

- Separar o diagnóstico de conexão das frentes de IA e clima, permitindo especificação independente do item 54.
- Oferecer medição real e voluntária na TV, com limites de tráfego/tempo, cancelamento e indicação do destino medido.
- Apresentar o resultado como evidência para investigação, sem atribuir automaticamente o travamento à rede ou ao provedor.

## Non-Goals

- Construir curadoria adicional (30), chat (31) ou clima (fatia do 54) no horizonte atual.
- Garantir reprodução, corrigir AVPlay/codec ou diagnosticar definitivamente o servidor IPTV.
- Testar URLs de stream, enviar credenciais, criar backend obrigatório ou monitorar a conexão continuamente.
- Transformar exemplos visuais do DS em percentuais de qualidade ou garantias inventadas.

## Success Metrics

Critérios propostos para a spec, sem alegação de medição ou aceite nesta avaliação:

- Zero requisições de teste ao montar a tela ou mover foco; início apenas após ação explícita.
- Toda métrica exibida deriva de amostras reais, com unidade e destino medido; métrica indisponível não recebe valor fictício.
- Toda execução respeita limites de bytes e duração definidos antes da implementação; cancelar/RETURN encerra o trabalho e restaura o foco de origem.
- Estados inicial, execução, resultado, erro e cancelamento têm saída acessível por controle remoto.
- Uma execução no app empacotado na TV comprova acesso ao endpoint e obtenção de medições; a validade da medição não é inferida dos E2E desktop.
- Nenhuma requisição ou resultado enviado ao serviço contém credencial, URL da fonte/stream ou catálogo.

## Cost of Inaction

Sem o teste, o usuário precisa recorrer a outro recurso/aplicativo para medir a rede na TV. ASSUMPTION: frequência e custo dessa troca não foram medidos; não se afirma urgência ou perda de reprodução. O custo atual de não adicionar IA/clima é baixo para o usuário, que não confirmou necessidade dessas frentes.
