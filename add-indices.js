const fs = require('fs');

let file = 'tv-web/src/lib/catalog/db.ts';
let content = fs.readFileSync(file, 'utf8');

// Change version(4) to version(5) to safely add new indices
content = content.replace("    this.version(4).stores({\n      userStates: 'stableId, sourceId'\n    })", 
`    this.version(4).stores({
      userStates: 'stableId, sourceId'
    })
    this.version(5).stores({
      userStates: 'stableId, sourceId, isFavorite, lastWatched'
    })`);

fs.writeFileSync(file, content);
