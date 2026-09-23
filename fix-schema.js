const fs = require('fs');

let file = 'tv-web/src/lib/catalog/db.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/ \}\)\n  \}\n\}/g, "\n    })\n    this.version(4).stores({\n      userStates: 'stableId, sourceId'\n    })\n  }\n}");

content = content.replace("importRuns!: EntityTable<ImportRunRecord, 'id'>\n\n", "importRuns!: EntityTable<ImportRunRecord, 'id'>\n  userStates!: EntityTable<UserStateRecord, 'stableId'>\n\n");

fs.writeFileSync(file, content);

