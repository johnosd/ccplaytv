# T053 — OpenSubtitles direto da TV (prova na TV física)

- **Data**: 2026-10-23. **Aparelho**: Samsung QN50Q60DAGXZD (TV de referência), origem `file://`.
- **Classificação**: **gate** (decide se o BYOK do OpenSubtitles entra).
- **Como**: sonda descartável `ccpSondaV2.Capacidades` (sondas da 082, testes `osCors` e `osReal` em `app2/tests.js`),
  coletor local só para o IP da TV. A etapa 2 usou a chave de **desenvolvimento** do OpenSubtitles, entregue por um
  servidor temporário só ao IP da TV (em memória, nunca gravada nem impressa); gastou 1 download da cota. Sonda
  desinstalada, coletor e servidor parados; `applist` ficou só com o CCPlayTV. Origem dos números:
  `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda-tv2.jsonl` (duas últimas linhas).

## Etapa 1 — `osCors` (chave falsa; só prova o CORS)

| Passo | Resultado na TV |
| --- | --- |
| GET sem cabeçalho custom | 200 |
| GET com `Api-Key` (preflight) | **200** |
| GET com `Api-Key` + `X-User-Agent` | **200** |
| `POST /download` com `Api-Key` + `X-User-Agent` | chegou ao servidor (503 com chave falsa; **sem bloqueio de CORS**) |
| Controle SubDL (chave falsa) | 403 (chegou ao servidor) |

## Etapa 2 — `osReal` (chave de desenvolvimento)

| Passo | Resultado na TV |
| --- | --- |
| Busca (`languages=en`, título de domínio público) | **200**, 18 resultados |
| `POST /download` com `Api-Key` + `X-User-Agent` | **200**, com `link` (host `www.opensubtitles.com`), cota restante 98 |
| GET do `link` | **200**, 78 152 bytes |

## Leitura honesta

- **Contradiz o PC**: no Chromium 153 do PC (Playwright, `file://`) o preflight do OpenSubtitles é recusado
  (`cors-direto-pc.json`); na TV (Chromium 120 do Tizen 9) ele passa. Vale o aparelho — é o que o app usa. O ensaio no PC
  não aprova nem reprova (regra da sonda).
- O `X-User-Agent` entrou no cliente direto porque o navegador não deixa definir `User-Agent`; o teste de fallback sem ele
  não rodou (o primeiro passo já deu 200).
- A prova foi **uma rodada** com o firmware atual. O app real usa o mesmo motor e a mesma origem; se um firmware futuro
  voltar a recusar o preflight, o efeito é um aviso no diálogo ("indisponível") e o fornecedor continua pelo padrão do
  ccplayTv, nunca um travamento.
- Não prova aceitação do BYOK pelo OpenSubtitles em app distribuído (gate G-4, outro assunto).
