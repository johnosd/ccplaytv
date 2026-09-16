# Research — 002-splash-home-perfis

## Geração do ícone do app (icon.png)

**Decisão**: gerar o PNG via um script PowerShell one-off usando
`System.Drawing`/GDI+ (`Add-Type -AssemblyName System.Drawing`), desenhando
o mesmo gradiente diagonal (`#FF2E87 → #FF7A3D 40% → #FFC93D 70% →
#1E9AB0 100%`) e triângulo de play usados na `SplashScreen.tsx`, com cantos
arredondados proporcionais ao ícone atual do projeto (117×117 — confirmado
via `[System.Drawing.Image]::FromFile` no `icon.png` já existente em
`CCPlayTv/`, herdado do `scaffold_tv_webapp`).

**Justificativa**: não há `PIL`/Pillow instalado neste ambiente Python, e
adicionar uma dependência nova (Node `canvas`/`sharp`, ou Pillow via pip) só
pra gerar um único asset estático não se justifica — `System.Drawing` já
está disponível no Windows sem instalação, e já foi usado nesta mesma
sessão pra inspecionar o ícone atual. O script roda uma vez, no momento do
`sdd-execute`; o resultado (`icon.png`) é o artefato versionado, o script em
si não precisa virar parte permanente do projeto.

**Alternativas consideradas**:
- Node.js + `sharp`/`canvas`: rejeitada — dependência nova (binário nativo)
  só pra um asset estático, risco de falha de instalação no Windows sem
  ferramentas de build.
- Pedir ao usuário um PNG já exportado do Claude Design: era a alternativa
  perguntada na entrevista do `sdd-specify` — o usuário escolheu
  explicitamente "eu gero programaticamente".
- SVG inline convertido via navegador (screenshot): mais frágil e manual
  que desenhar diretamente em pixels via GDI+.

## API de saída do app no Tizen

**Decisão**: `tizen.application.getCurrentApplication().exit()`, chamada
apenas quando `window.tizen?.application?.getCurrentApplication` existir
(guard de ambiente). Fora da TV (navegador de desenvolvimento), a ação só
fecha o diálogo de confirmação, sem efeito adicional — consistente com como
o projeto já trata diferenças TV-vs-navegador (ex.: teclado virtual,
`webapis.avplay` mencionados na ADR-001).

**Justificativa**: é a API padrão do W3C Widget/Tizen Web Device API pra
encerrar o processo do próprio widget; não existe equivalente em `window`
puro (fechar uma aba via JS só funciona pra abas abertas por `window.open`,
não pra um app Tizen instalado).

**Alternativas consideradas**: nenhuma — é a única API disponível pra essa
ação neste runtime.
