const fs = require('fs');

let file = 'tv-web/src/lib/catalog/db.ts';
let content = fs.readFileSync(file, 'utf8');

const interfaceStr = `
export interface UserStateRecord {
  stableId: string
  sourceId: string
  isFavorite: boolean
  progressSeconds?: number
  lastWatched?: number
  createdAt: number
  updatedAt: number
}
`;

content = content.replace('export interface CatalogRecord {', interfaceStr + '\nexport interface CatalogRecord {');
content = content.replace('.version(2)', '.version(3)');
content = content.replace("importRuns: 'id, sourceId, providerMode, status',\n    })", "importRuns: 'id, sourceId, providerMode, status',\n      userStates: 'stableId, sourceId',\n    })");
content = content.replace("importRuns!: EntityTable<ImportRunRecord, 'id'>\n}", "importRuns!: EntityTable<ImportRunRecord, 'id'>\n  userStates!: EntityTable<UserStateRecord, 'stableId'>\n}");

fs.writeFileSync(file, content);
