import { createServer } from 'node:http'
if(process.argv.includes('--package')) { const staticServer=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=new URL('../../../../CCPlayTv'+(pathname==='/'?'/index.html':pathname),import.meta.url);res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>staticServer.listen(5176,'127.0.0.1',r));staticServer.unref()}
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '../../../../tv-web/node_modules/playwright/index.mjs'
import { cadastrarListaM3u } from '../../../../tv-web/e2e/lib/entrada.mjs'
import { openShowcase, focusFirstRealCategory } from '../../../../tv-web/e2e/lib/vod.mjs'
const env = Object.fromEntries((await readFile(new URL('../../../../.env', import.meta.url), 'utf8')).split(/\r?\n/).map(s => /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(s)).filter(Boolean).map(m => [m[1],m[2].trim().replace(/^["']|["']$/g,'')]))
const secretValues = [env.CCPLAY_PROBE_USER,env.CCPLAY_PROBE_PASS,env.CCPLAY_PROBE_DNS,env.CCPLAY_PROBE_M3U,env.CCPLAY_PROBE_EPG].filter(Boolean)
const safe = value => { let text=String(value); for(const secret of secretValues) text=text.split(secret).join('[redacted]'); return text.replace(/https?:\/\/[^\s"'<>]+/g,'[url]') }
const started = Date.now()
const browser = await chromium.launch({headless:true,args:process.argv.includes('--tizen') ? ['--allow-file-access-from-files'] : []})
const context = await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR'})
const page = await context.newPage()
if(process.argv.includes('--build-localhost')) await page.route('http://localhost:5173/**',async route=>{try{const pathname=new URL(route.request().url()).pathname; if(!/^\/(?:assets\/|index.html$|favicon.svg$|$)/.test(pathname)){await route.continue();return} const file=new URL('../../../../CCPlayTv'+(pathname==='/'?'/index.html':pathname),import.meta.url);await route.fulfill({status:200,contentType:pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.svg')?'image/svg+xml':'text/html',body:await readFile(file)})}catch{await route.fulfill({status:404,body:''})}})
const errors=[]
page.on('console', msg=> { if(msg.type()==='error') console.log('CONSOLE_ERROR',safe(msg.text())) })
page.on('requestfailed',request => { const action=new URL(request.url()).searchParams.get('action'); if(action==='get_series_info') console.log('SERIES_REQUEST_FAILED',safe(request.failure()?.errorText)) })
page.on('pageerror',error=>{ errors.push(safe(error.message)); console.log('PAGEERROR',safe(error.message),safe(error.stack)) })
try {
 await page.goto(process.argv.includes('--tizen') ? new URL('../../../../CCPlayTv/index.html',import.meta.url).href : process.argv.includes('--package') ? 'http://127.0.0.1:5176' : 'http://localhost:5173')
 await page.locator('.add-card').waitFor({timeout:20000})
 console.log('IMPORT_START')
 await cadastrarListaM3u(page,{nome:'Diagnóstico séries',url:env.CCPLAY_PROBE_M3U})
 const progressTimer=setInterval(async()=>{console.log('IMPORT_PROGRESS',Math.round((Date.now()-started)/1000),safe((await page.locator('body').innerText().catch(()=>'' )).slice(-400)))},20000)
 await Promise.race([page.getByText(/Concluída/).waitFor({timeout:90000}),page.getByText(/Status: Falhou/).waitFor({timeout:90000}).then(()=>{throw new Error('Importação falhou; verificar estado sanitizado')})]).finally(()=>clearInterval(progressTimer))
 console.log('IMPORT_OK')
 await page.getByRole('button',{name:'Voltar',exact:true}).click()
 await page.locator('.source-card-wrap').first().click()
 await page.locator('.home-screen, .home-body, .home-hero, .home').first().waitFor({timeout:30000}).catch(()=>{})
 await openShowcase(page,'series')
 await focusFirstRealCategory(page)
 await page.keyboard.press('Enter')
 await page.locator('.vod-grid .poster-box.tv-focus').waitFor({timeout:60000})
 console.log('SERIES_GRID_OK')
 const sample=Number(process.argv.find(x=>x.startsWith('--sample='))?.split('=')[1]??0)
 for(let i=0;i<1;i++) {
 const cards=page.locator('.content-card')
 for(let step=0;step<sample;step++) await page.keyboard.press('ArrowRight')
 await page.keyboard.press('Enter')
 await page.waitForSelector('.vod-detail, .live-state, .route-state, .route-error', {timeout:30000}).catch(()=>{})
 await page.waitForTimeout(3000)
 console.log('DETAIL',i+1,JSON.stringify(await page.evaluate(()=>({detail:!!document.querySelector('.vod-detail'),episodes:document.querySelectorAll('.vod-episode-row').length,error:!!document.querySelector('.route-error, .error-state'),state:document.querySelector('.live-state')?.textContent?.slice(0,180)}))))
 await page.screenshot({path:new URL('./'+(process.argv.includes('--tizen')?'tizen-':'dev-')+'serie-real-'+(i+1)+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')})
 if(errors.length || !(await page.locator('.vod-detail').count())) break

 }
 console.log('ERROR_COUNT',errors.length)
} catch(error) { console.log('REPRO_ERROR',safe(error.message)); console.log('SCREEN_STATE',safe((await page.locator('body').innerText().catch(()=>'' )).slice(0,1500))); process.exitCode=1 }
finally { await browser.close() }
