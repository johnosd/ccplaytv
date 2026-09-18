# Quickstart — 003-live-tv-avplay

## Pré-requisitos

- Postgres local: `docker compose up -d postgres` (raiz do repo).
- Backend: `cd api && uv run python main.py` (porta 3000).
- Frontend em dev: `cd tv-web && npm run dev` (porta 5173, já no CORS).
- **Pelo menos uma `Source` importada com canais publicados.** A feature 001
  já validou um import real de 311.367 entradas na TV física; reusar essa
  fonte é o caminho mais curto. Confirmar que há canais:
  `GET /catalog-items?source_id=<id>&kind=channel`.

## Checagens automatizadas

```powershell
cd api
uv run ruff check .
uv run pytest

cd ..\tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build
```

## Cenário A — catálogo real na tela (US1, verificável no navegador)

1. Abra o app, passe a Splash, entre numa lista cadastrada e escolha
   **Live TV**.
2. **Esperado**: a coluna de grupos mostra os grupos que vieram da fonte, na
   ordem em que a fonte os declarou — não "Notícias / Esportes / Filmes e
   Séries / Infantil / Documentário" do mock.
3. Mova o foco entre canais. **Esperado**: o painel direito atualiza nome e
   grupo do canal focado; **nenhuma requisição de reprodução** sai (confira na
   aba Network do DevTools — é o SC-006).
4. Se a fonte tiver algum canal sem URL, localize-o. **Esperado**: aparece na
   lista, focável, marcado como indisponível; Enter explica em vez de abrir o
   player (FR-012).
5. Abra um grupo com mais canais que o teto. **Esperado**: lista truncada com
   aviso visível (FR-014).
6. Se a fonte tiver canais sem grupo declarado: **esperado** grupo
   "Sem categoria", nunca um grupo inventado.

## Cenário B — reprodução no navegador de desenvolvimento (US2, parcial)

O adaptador `<video>` cobre o fluxo, não o codec. Um stream `.ts` bruto
provavelmente **não** toca no Chrome — isso é esperado e não reprova a
feature; serve para exercitar a máquina de estados e o caminho de erro.

1. Enter num canal. **Esperado**: a camada de player abre sobre a tela, com
   estado visível de preparando → carregando.
2. Pressione Voltar durante o "preparando". **Esperado**: a camada fecha, sem
   áudio residual e sem sessão pendente.
3. Enter de novo e deixe carregar. **Esperado**: ou toca, ou cai no estado de
   erro com "Tentar de novo" e "Voltar" focáveis.
4. A partir do erro, escolha "Voltar". **Esperado**: volta à lista **com o
   foco no canal que tentou abrir** e o mesmo grupo selecionado (FR-009).
5. Pressione Enter várias vezes seguidas no mesmo canal. **Esperado**: uma
   única sessão de reprodução.

## Cenário C — a porta V1 na TV física (US2, o aceite de verdade)

Este é o cenário que fecha a feature. Procedimento de empacotamento herdado
da feature 001 (ver `sdd/specs/001-importacao-fonte-m3u/plan.md` → Cuidados
para Retomada, R-013/R-014).

1. Descobrir o IP LAN do PC (`Get-NetIPAddress`, interface Wi-Fi).
2. `cd tv-web; $env:VITE_API_URL = "http://<IP-LAN>:3000"; npm run build:tizen`
   — **sem essa env var o build cai no fallback `127.0.0.1`, que na TV aponta
   para ela mesma**.
3. `tz.exe pack -w "<caminho>\CCPlayTv"` com o profile `ccplaytv-nosamsung`
   ativo (só autor + Distributor1; um certificado Samsung embutido faz o
   Apps2Samsung falhar ao re-assinar).
4. Instalar via `Apps2Samsung.exe`, aberto manualmente pelo usuário.
5. Confirmar que `api/.env` tem `HOST=0.0.0.0` e que a regra de firewall
   libera TCP 3000 para `LocalSubnet`.
6. Na TV: Live TV → selecionar um canal → **Enter**.

**Registrar como evidência, independente do resultado** (é a porta V1 da
ADR-006, "não executada" até aqui):

| Campo | Valor |
| --- | --- |
| Modelo / firmware | (ProductInfo ou menu da TV) |
| `navigator.userAgent` observado | |
| Canal usado (nome, sem URL) | |
| Contêiner/codec observado | |
| Resultado | tocou / não tocou / tocou sem áudio / … |
| Erro do AVPlay, se houver | código e mensagem |
| Sequência de comandos | |

**Se nenhum canal reproduzir**, a feature não é declarada concluída, mas o
resultado é válido: registrar a incompatibilidade como evidência e abrir a
discussão (formatos da fonte, `allowed_output_formats` — item 1 do backlog —
ou limites de codec do aparelho). A spec prevê isso explicitamente.

### Ferramentas auxiliares

Os servidores MCP `tizen-doctor-mcp` e `tizen-simulator-mcp` estão
configurados neste ambiente e podem encurtar o ciclo (validar ambiente,
empacotar, instalar, simular controle remoto). **O simulador não substitui o
Cenário C** — a Samsung é explícita em que o emulador não reproduz
integralmente o hardware, e é justamente o hardware que estamos medindo.

## Checklist cross-cutting (constitution)

- [ ] Nenhuma URL de stream, endereço de provedor ou credencial aparece em
      tela, no console do navegador ou em log do backend — num ciclo completo
      de sucesso **e** num de falha (SC-005).
- [ ] Todo estado da tela (carregando, vazio, grupo vazio, erro de carga,
      erro de reprodução, canal indisponível) tem pelo menos um elemento
      focável (SC-004).
- [ ] Todo o fluxo é alcançável só por setas + OK + Voltar, sem mouse.
- [ ] Voltar do player restaura o foco no canal de origem (SC-003).
- [ ] Mover o foco pela lista inteira de um grupo não dispara nenhuma
      requisição de reprodução (SC-006).
- [ ] Nenhum dado de `mockCatalog.ts` aparece no caminho de canais (SC-002).
