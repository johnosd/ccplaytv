const fs = require('fs');
const path = require('path');
const file = path.resolve('.planning/backlog.md');
let content = fs.readFileSync(file, 'utf8');

// Mark Feature 006 as done
content = content.replace(/1\. \*\*Conector Xtream: fatia de VOD e sÃ©ries pelo mesmo protocolo\*\*/, "1. ~~**Conector Xtream: fatia de VOD e séries pelo mesmo protocolo**~~ [CONCLUÍDO - FEATURE 006]");

// Insert virtualization into Phase 1
const phase1Index = content.indexOf('### Fase 1 â€” MVP: do catÃ¡logo real atÃ© assistir');
if (phase1Index !== -1) {
  const insertText = `
### Fase 1 — MVP: do catálogo real até assistir

2.5. **Virtualização de Listas Longas (Filmes e Séries)**

   Com a introdução do VOD real (Feature 006), as telas de Filmes e Séries passaram a renderizar milhares de itens simultaneamente, causando lentidão na interface da TV (limitações do Chromium/Tizen).

   **Entregáveis**:
   - Implementar renderização virtualizada (ex: \`react-window\` ou virtualização customizada de grade para TV) nas telas \`MoviesScreen\` e \`SeriesScreen\`.
   - Garantir que a navegação pelo controle remoto (spatial navigation) funcione perfeitamente com os itens virtuais (foco no off-screen).
`;
  content = content.replace('### Fase 1 â€” MVP: do catÃ¡logo real atÃ© assistir', insertText);
}

fs.writeFileSync(file, content);

