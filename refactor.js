const fs = require('fs');
const path = require('path');

// 1. db.ts
const dbPath = path.resolve('tv-web/src/lib/catalog/db.ts');
let dbContent = fs.readFileSync(dbPath, 'utf8');

dbContent = dbContent.replace(/export interface ChannelRecord \{[\s\S]*?directUrl\?: string\n\}/, 
`export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface CatalogRecord {
  id?: number
  sourceId: string
  generation: number
  kind: CatalogItemKind
  name: string
  originalName: string
  group?: string
  groupOrder: number
  providerStreamId?: string
  providerCategoryId?: string
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  streamExtension?: string
  directUrl?: string
}`);

dbContent = dbContent.replace(/channels!: EntityTable<ChannelRecord, 'id'>/, `channels!: EntityTable<CatalogRecord, 'id'>`);
dbContent = dbContent.replace(/this\.version\(1\)\.stores\(\{[\s\S]*?importRuns: 'id, \[sourceId\+status\]',\n    \}\)/, 
`this.version(1).stores({
      sources: 'id',
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder]',
      importRuns: 'id, [sourceId+status]',
    })
    this.version(2).stores({
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder], [sourceId+generation+kind+groupOrder]'
    })`);
fs.writeFileSync(dbPath, dbContent);

// 2. classifier.ts
const clsPath = path.resolve('tv-web/src/lib/catalog/classifier.ts');
let clsContent = fs.readFileSync(clsPath, 'utf8');
clsContent = clsContent.replace(/export interface ClassifiedEntry \{[\s\S]*?\n\}/, 
`export interface ClassifiedEntry {
  kind: CatalogItemKind
  name: string
  originalName: string
  group?: string
  url?: string
  seriesKey?: string
  seriesName?: string
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  streamExtension?: string
  providerStreamId?: string
  providerCategoryId?: string
}`);
clsContent = clsContent.replace(/export type CatalogItemKind = [^\n]*\n/, "import type { CatalogItemKind } from './db'\n");
fs.writeFileSync(clsPath, clsContent);

// 3. catalogRepository.ts
const crPath = path.resolve('tv-web/src/lib/catalog/catalogRepository.ts');
let crContent = fs.readFileSync(crPath, 'utf8');
crContent = crContent.replace(/type ChannelRecord/g, 'type CatalogRecord, type CatalogItemKind');
crContent = crContent.replace(/ChannelRecord/g, 'CatalogRecord');

crContent = crContent.replace(
  /function query\(database: CatalogDb, sourceId: string, generation: number, groupOrder\?: number\) \{/g,
  `function query(database: CatalogDb, sourceId: string, generation: number, groupOrder?: number, kind?: CatalogItemKind) {
  if (kind) {
    const low = [sourceId, generation, kind, groupOrder ?? KEY_MIN]
    const high = [sourceId, generation, kind, groupOrder ?? KEY_MAX]
    return database.channels.where('[sourceId+generation+kind+groupOrder]').between(low, high, true, true)
  }`
);

crContent = crContent.replace(
  /export async function listChannels\([\s\S]*?database: CatalogDb = db,\n\): Promise<CatalogRecord\[\]> \{[\s\S]*?\}/,
  `export async function listChannels(
  sourceId: string,
  groupOrder: number,
  offset: number,
  limit: number,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  return query(database, sourceId, generation, groupOrder, kind).offset(offset).limit(limit).toArray()
}`
);

crContent = crContent.replace(
  /export async function listCategories\([\s\S]*?database: CatalogDb = db,\n\): Promise<CatalogCategory\[\]> \{/,
  `export async function listCategories(
  sourceId: string,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogCategory[]> {`
);

crContent = crContent.replace(
  /const keys = \(await query\(database, sourceId, generation\)\.uniqueKeys\(\)\) as unknown\[\]/g,
  `const keys = (await query(database, sourceId, generation, undefined, kind).uniqueKeys()) as unknown[]`
);
crContent = crContent.replace(
  /Number\(key\[2\]\)/g,
  `Number(key[kind ? 3 : 2])`
);
crContent = crContent.replace(
  /query\(database, sourceId, generation, order\)\.first\(\)/g,
  `query(database, sourceId, generation, order, kind).first()`
);
crContent = crContent.replace(
  /query\(database, sourceId, generation, order\)\.count\(\)/g,
  `query(database, sourceId, generation, order, kind).count()`
);
crContent = crContent.replace(
  /export async function countChannels\(\n  sourceId: string,\n  groupOrder\?: number,\n  database: CatalogDb = db,\n\): Promise<number> \{/g,
  `export async function countChannels(
  sourceId: string,
  groupOrder?: number,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<number> {`
);
crContent = crContent.replace(
  /query\(database, sourceId, generation, groupOrder\)\.count\(\)/g,
  `query(database, sourceId, generation, groupOrder, kind).count()`
);
fs.writeFileSync(crPath, crContent);

// 4. importPipeline.ts
const ipPath = path.resolve('tv-web/src/lib/catalog/importPipeline.ts');
let ipContent = fs.readFileSync(ipPath, 'utf8');
ipContent = ipContent.replace(/type ChannelRecord/g, 'type CatalogRecord');
ipContent = ipContent.replace(/ChannelRecord/g, 'CatalogRecord');
ipContent = ipContent.replace(/function toRecord\([\s\S]*?\{[\s\S]*?return \{[\s\S]*?\}\n\}/,
  `function toRecord(
  channel: MappedChannel,
  sourceId: string,
  generation: number,
  keepUrl: boolean,
): CatalogRecord {
  return {
    sourceId,
    generation,
    kind: channel.kind,
    name: channel.name,
    originalName: channel.originalName,
    group: channel.group,
    groupOrder: channel.groupOrder,
    providerStreamId: channel.providerStreamId,
    providerCategoryId: channel.providerCategoryId,
    seriesId: channel.seriesId,
    seasonNumber: channel.seasonNumber,
    episodeNumber: channel.episodeNumber,
    streamExtension: channel.streamExtension,
    directUrl: keepUrl ? channel.url : undefined,
  }
}`
);
fs.writeFileSync(ipPath, ipContent);

// 5. catalogRepository.test.ts
const crtPath = path.resolve('tv-web/src/lib/catalog/catalogRepository.test.ts');
let crtContent = fs.readFileSync(crtPath, 'utf8');
crtContent = crtContent.replace(/type ChannelRecord/g, 'type CatalogRecord');
crtContent = crtContent.replace(/ChannelRecord/g, 'CatalogRecord');
crtContent = crtContent.replace(/function channel\(generation: number, name: string, group: string, groupOrder: number\): CatalogRecord \{/g,
`function channel(generation: number, name: string, group: string, groupOrder: number): CatalogRecord {`);
crtContent = crtContent.replace(/providerStreamId: name,\n  \}/g, `providerStreamId: name,\n    kind: 'channel',\n  }`);
// Fix test method calls
crtContent = crtContent.replace(/listChannels\((.*?), (.*?), (.*?), (.*?), database\)/g, 'listChannels($1, $2, $3, $4, undefined, database)');
crtContent = crtContent.replace(/listCategories\((.*?), database\)/g, 'listCategories($1, undefined, database)');
crtContent = crtContent.replace(/countChannels\((.*?), (.*?), database\)/g, 'countChannels($1, $2, undefined, database)');
fs.writeFileSync(crtPath, crtContent);

// 6. importPipeline.test.ts
const iptPath = path.resolve('tv-web/src/lib/catalog/importPipeline.test.ts');
let iptContent = fs.readFileSync(iptPath, 'utf8');
iptContent = iptContent.replace(/type ChannelRecord/g, 'type CatalogRecord');
iptContent = iptContent.replace(/ChannelRecord/g, 'CatalogRecord');
iptContent = iptContent.replace(/listChannels\((.*?), (.*?), (.*?), (.*?), database\)/g, 'listChannels($1, $2, $3, $4, undefined, database)');
iptContent = iptContent.replace(/listCategories\((.*?), database\)/g, 'listCategories($1, undefined, database)');
iptContent = iptContent.replace(/countChannels\((.*?), (.*?), database\)/g, 'countChannels($1, $2, undefined, database)');
// Fix test batch items
iptContent = iptContent.replace(/groupOrder: 0,\n        \}/g, "groupOrder: 0,\n          kind: 'channel',\n        }");
fs.writeFileSync(iptPath, iptContent);
console.log('Transform complete.');

