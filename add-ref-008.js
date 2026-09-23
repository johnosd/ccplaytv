const fs = require('fs');
let file = 'sdd/specs/008-user-state-repo/plan.md';
let content = fs.readFileSync(file, 'utf8');

const additionalContext = `
## Requisitos Derivados das Referências (docs/iptvnator, docs/guia-praticas-app-tv, docs/design)
A arquitetura do UserStateRepository deve se alinhar com as práticas recomendadas de TV:
1. **Favoritos Globais vs Locais**: (ref: docs/iptvnator/01-ui-ux.md) A taxonomia de estados suporta a distinção entre um favorito que pertence especificamente a uma fonte (sourceId) e um favorito global que consolida itens idênticos. O \`stableId\` que implementamos resolve a base, mas a API de leitura precisará permitir queries que cruzem fontes (usando índices Dexie) para a futura tela "Global Favorites".
2. **Restaurar Estado de Foco**: O guia pede para manter o índice focal no histórico de navegação. Esse estado de roteamento e UI efêmero não pertence ao Dexie (que foca em retenção de longo prazo), e sim à memória React/Norigin (que faremos no roteador na Feature 009/010).
3. **Empty States Controlados**: As leituras deste repositório sempre retornarão defaults seguros ou \`undefined\` previsíveis para forçar o render de \`EmptyState\` focável na UI, evitando travamentos do controle remoto.
`;

content = content.replace('## Decisões Invariantes', additionalContext + '\n## Decisões Invariantes');
fs.writeFileSync(file, content);

