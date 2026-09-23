const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/lib/catalog/xtreamConnector.test.ts');
let content = fs.readFileSync(file, 'utf8');

const importRegex = /import \{([\s\S]*?)\} from '\.\/xtreamConnector'/;
content = content.replace(importRegex, (match, p1) => {
  return `import {${p1}, acquireXtreamVod, acquireXtreamSeries, fetchSeriesInfo, buildVodUrl} from './xtreamConnector'`;
});

const newTests = `
  describe('VOD and Series Extension', () => {
    it('acquireXtreamVod should map VOD entries correctly', async () => {
      fetchMock.mockResponse((req) => {
        const url = new URL(req.url)
        if (url.searchParams.get('action') === 'get_vod_categories') {
          return Promise.resolve(JSON.stringify([{ category_id: '10', category_name: 'Action Movies' }]))
        }
        if (url.searchParams.get('action') === 'get_vod_streams') {
          return Promise.resolve(JSON.stringify([
            { stream_id: 100, name: ' Die Hard ', category_id: '10', container_extension: 'mkv' }
          ]))
        }
        return Promise.reject(new Error('Unknown action'))
      })

      const status = { authorized: true, expired: false, allowedFormats: ['m3u8'] }
      const vods = await acquireXtreamVod('http://mock', 'user', 'pass')

      expect(vods).toHaveLength(1)
      expect(vods[0]).toEqual({
        kind: 'movie',
        name: 'Die Hard',
        originalName: 'Die Hard',
        group: 'Action Movies',
        groupOrder: 0,
        url: 'http://mock/movie/user/pass/100.mkv',
        providerStreamId: '100',
        providerCategoryId: '10',
        streamExtension: 'mkv',
      })
    })

    it('acquireXtreamSeries should map Series entries correctly', async () => {
      fetchMock.mockResponse((req) => {
        const url = new URL(req.url)
        if (url.searchParams.get('action') === 'get_series_categories') {
          return Promise.resolve(JSON.stringify([{ category_id: '20', category_name: 'Comedy Series' }]))
        }
        if (url.searchParams.get('action') === 'get_series') {
          return Promise.resolve(JSON.stringify([
            { series_id: 200, name: ' The Office ', category_id: '20' }
          ]))
        }
        return Promise.reject(new Error('Unknown action'))
      })

      const series = await acquireXtreamSeries('http://mock', 'user', 'pass')

      expect(series).toHaveLength(1)
      expect(series[0]).toEqual({
        kind: 'series',
        name: 'The Office',
        originalName: 'The Office',
        group: 'Comedy Series',
        groupOrder: 0,
        providerCategoryId: '20',
        seriesId: '200',
      })
    })

    it('fetchSeriesInfo should map episodes properly', async () => {
      fetchMock.mockResponse((req) => {
        const url = new URL(req.url)
        if (url.searchParams.get('action') === 'get_series_info' && url.searchParams.get('series_id') === '200') {
          return Promise.resolve(JSON.stringify({
            episodes: {
              "1": [
                { id: "1001", episode_num: 1, title: "Pilot", container_extension: "mp4" }
              ],
              "2": [
                { id: "1002", episode_num: 1, title: "The Dundies", container_extension: "mkv" }
              ]
            }
          }))
        }
        return Promise.reject(new Error('Unknown action'))
      })

      const episodes = await fetchSeriesInfo('http://mock', 'user', 'pass', '200')
      expect(episodes).toHaveLength(2)

      expect(episodes[0]).toMatchObject({
        kind: 'episode',
        name: 'Pilot',
        url: 'http://mock/series/user/pass/1001.mp4',
        seriesId: '200',
        seasonNumber: 1,
        episodeNumber: 1
      })

      expect(episodes[1]).toMatchObject({
        kind: 'episode',
        name: 'The Dundies',
        url: 'http://mock/series/user/pass/1002.mkv',
        seriesId: '200',
        seasonNumber: 2,
        episodeNumber: 1
      })
    })
  })
`;

fs.writeFileSync(file, content.replace(/}\)\n$/, '})\n' + newTests));

