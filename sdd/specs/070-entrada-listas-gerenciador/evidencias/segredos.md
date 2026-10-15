# Evidência de segredos — feature 070

Data: 2026-10-13  
Escopo: T037 / SC-006, somente fixtures fictícias.

## Resultado

Revisão estática e testes focados confirmam que os valores sensíveis usados nos
testes não são exibidos em cards, alertas, URL, QR, cabeçalhos ou logs. Os
marcadores abaixo são deliberadamente fictícios e não são credenciais reais:

- `senha-marcador-070`, `marcador-070` e `fixture-password`;
- `fake-private-password`, `fake-secret` e `fake-device-key`;
- domínios `.invalid` (`provider.invalid`, `painel.invalid`, `epg.invalid`).

## Evidência reproduzível

1. `api/tests/portal/test_configuration_values.py`: a sessão sem autenticação
   recebe 401; a sessão válida recebe apenas a allowlist do tipo; a resposta
   usa `Cache-Control: no-store`; fonte inexistente/excluída e outra TV não
   recebem valores; `caplog` não contém o usuário ou marcador de senha.
2. `portal-web/e2e/configuracao.spec.ts`: após envio, corpo da página não
   contém senha, URL, chave do dispositivo ou segredo M3U; na edição os valores
   aparecem somente porque a decisão 1.10.0/ADR-014 autoriza essa tela, e o
   olho alterna o atributo `type` sem copiar o valor para a URL.
3. `portal-web/e2e/gerenciador.spec.ts`: o cabeçalho mostra somente ID/status/
   licença; a rota `values` é interceptada com fixture e nenhuma credencial é
   colocada no cabeçalho ou nos cards.
4. `tv-web/e2e/entrada-listas-gerenciador.mjs`: a URL enviada usa apenas o
   marcador `segredo-fixture`; o corpo visível da TV e do portal é verificado
   para garantir sua ausência. O QR é validado como imagem de convite, sem
   inserir ID, chave ou URL de provedor.

## Gates executados

- API `tests/portal`: 120 passed; Ruff: PASS.
- Portal unit/lint/build: 6/6, PASS, PASS; E2E: 14 passed.
- E2E integrado 070: PASS, incluindo a checagem de ausência do marcador.

Nenhum valor de `docs/m3u/dados.md`, `.env` ou serviço real foi lido ou copiado.
