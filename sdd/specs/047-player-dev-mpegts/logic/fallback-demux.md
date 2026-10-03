# Lógica — fallback de demux no `htmlVideoAdapter` (047)

Regras que o executor não pode reinterpretar. Os testes de contrato (travados) provam o comportamento; este arquivo explica o porquê.

## 1. Decisão pura (`shouldFallbackToDemux`)

```ts
function shouldFallbackToDemux({ url, mediaErrorCode, alreadyTried, available }: FallbackInput): boolean {
  if (!available || alreadyTried) return false      // D-002/D-003: uma tentativa; sem demux = como hoje
  if (mediaErrorCode !== 4) return false             // só "formato não suportado"; rede (2) e decodificação (3) não
  return isMpegTsUrl(url)                            // FR-009: o resto segue o caminho de hoje
}

function isMpegTsUrl(url: string): boolean {
  try { return new URL(url).pathname.toLowerCase().endsWith('.ts') } catch { return false }
}
```

`isMpegTsUrl` lê o **pathname** (query e fragmento não contam) e nunca devolve nem registra a URL.

## 2. Ciclo no adaptador

```text
open(url):
  demuxTried = false; demux = null; closed = false
  cria <video> (listeners de hoje) e atribui src (caminho nativo)

evento 'error' do <video>:
  if shouldFallbackToDemux({ url, mediaErrorCode: video.error?.code ?? null, alreadyTried: demuxTried, available: startDemux !== null }):
      demuxTried = true
      NÃO chama callbacks.onError
      startDemux(video, url, { onFailure: handleDemuxFailure }).then(handle => {
          if (closed || element !== video) handle.destroy()   // close() chegou antes do anexo terminar
          else demux = handle
      }).catch(() => handleDemuxFailure())                     // falha ao carregar a lib / anexar
  else:
      callbacks.onError({ code: null })                        // exatamente como hoje

handleDemuxFailure():
  if (closed) return                                           // falha tardia depois do close: ninguém ouve
  demux?.destroy(); demux = null
  callbacks.onError({ code: null })                            // uma vez só; nunca o erro bruto

close():
  closed = true
  demux?.destroy(); demux = null
  detach()                                                     // remove src, load(), remove o nó
```

- Um segundo `error` nativo depois de `demuxTried` cai no ramo `else` de `shouldFallbackToDemux` (`alreadyTried`), mas **só reporta se ainda não reportou** — guarde um `errorReported` para o teste "uma única falha" (contrato 2).
- `destroy()` do handle é idempotente; chamar duas vezes não pode lançar.
- O estado do player continua vindo dos eventos de sempre (`waiting`/`playing`/`pause`): o demux só alimenta o mesmo `<video>`.

## 3. Starter padrão (`defaultDemuxStarter`)

```text
if (!import.meta.env.DEV) return null            // produção: ramo eliminado no build (D-003)
if (typeof MediaSource === 'undefined') return null   // jsdom/TV: comportamento de antes
return async (video, url, { onFailure }) => {
  const { default: mpegts } = await import('mpegts.js')   // DENTRO da guarda acima
  if (!mpegts.isSupported()) throw new Error('unsupported')   // vira handleDemuxFailure via .catch
  desligar o log da lib (D-006)
  const player = mpegts.createPlayer({ type: 'mpegts', isLive: true, url })
  player.attachMediaElement(video)
  player.on(mpegts.Events.ERROR, () => onFailure())     // sem repassar argumentos
  player.load(); void player.play()
  return { destroy() { try { player.pause(); player.unload(); player.detachMediaElement(); player.destroy() } catch {} } }
}
```

Nada do erro da biblioteca (mensagem, `detail`, URL) sai deste módulo.

## 4. Fora do escopo desta lógica

HLS, VOD, qualidade/faixas de áudio via demux, qualquer prova de AVPlay.
