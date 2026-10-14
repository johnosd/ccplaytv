# Lógica: cor ambiente da capa

## 1. Obtenção (hook `useCoverColor`)

`tv-web/src/features/vod/useCoverColor.ts` (novo):

```ts
export function useCoverColor(url: string | undefined): string | null
```

0. **Só capa "sem risco"** (emenda de 2026-10-05, FR-024): `isSafeCoverUrl(url, panelHosts)` — http(s), sem usuário/senha, sem query string, host fora de `usePanelHosts()` (hosts de `providerDns`/`m3uUrl` de todas as fontes; só o nome do host). Fora disso, ou com os hosts ainda carregando, `null` **sem requisição**. Motivo: com CORS recusado, o próprio navegador escreve a URL no console — e isso não pode ser calado por código.
1. Sem `url` ⇒ `null`.
2. Cache em memória do módulo: `Map<string, string | null>` (a mesma capa nunca é lida duas vezes por sessão; `null` também é cacheado — uma capa que não pode ser lida não é tentada de novo).
3. Leitura: `const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = url`. No `onload`: canvas **16×16**, `drawImage(img, 0, 0, 16, 16)`, `getImageData(0, 0, 16, 16).data` → `dominantColorFromPixels`. Tudo dentro de `try/catch`: imagem de outro domínio sem CORS lança `SecurityError` no `getImageData` ⇒ `null`. `onerror` ⇒ `null`.
4. Nunca bloqueia: o hero renderiza na hora com o fallback neutro; a cor entra quando chegar (sem animação obrigatória — uma transição curta de `background` com `--duration-standard` é opcional).
5. Cancelamento: ao desmontar ou trocar de `url`, ignorar o resultado tardio (flag `cancelled` no efeito).
6. **Nunca** logar, lançar ou mostrar a URL (pode conter credenciais do provedor) — nem em `console.*`, nem em mensagem de erro (FR-024).
7. Não é "consulta a serviço externo ao focar": roda uma vez ao abrir o detalhe, para a capa que a tela já exibe.

No jsdom o `onload` nunca dispara (não há carregamento de recurso), então os testes de tela não tocam no canvas.

## 2. Regra pura (`dominantColorFromPixels`, contrato travado)

Entrada: RGBA (`Uint8ClampedArray`, 4 bytes por pixel).

1. Pixel útil: `a >= 128`, `max(r,g,b) >= 24` (não é quase preto), `min(r,g,b) <= 232` (não é quase branco).
2. Se úteis < 10% do total ⇒ `null`.
3. Média simples de r, g, b dos úteis.
4. Converter para HSL. Se `s < 0.08` (cinza, sem matiz) ⇒ `null`.
5. `s' = max(s, 0.35)`; `l' = clamp(l, 0.28, 0.42)` — escura o bastante para o texto claro do hero (SC-001) e clara o bastante para o brilho aparecer.
6. Voltar para RGB e devolver `rgb(R, G, B)` com inteiros e **vírgula + espaço** (sintaxe aceita pelo piso `chrome108`; o contrato confere o formato).
