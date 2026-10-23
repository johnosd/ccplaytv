/**
 * O padrão de produção das legendas externas (feature 090, `logic/legenda-externa.md` §5.1, D-009, §10). Só cria objetos:
 * não lê banco nem fala com a rede (D-012) — isso fica para a ação da pessoa e para o passo ocioso depois do `playing`.
 *
 * Dois caminhos por fornecedor: o serviço do ccplayTv (chave padrão, exige portal e licença) e a chave PESSOAL da pessoa
 * (BYOK, direto da TV; não depende de portal nem de licença).
 */
import { commercialBuild, licenseMonitor } from '../licensing/licenseRuntime'
import { getPortalConnection, portalSurfacesVisible } from '../portal/portalRuntime'
import { createPortalSubtitleService } from './portalSubtitleService'
import { markSubtitleKeyState, readChosenSubtitleKeys, setSubtitleKeyChosen } from './subtitleCredentials'
import { createSubtitleSearch } from './subtitleSearch'
import { createSubtitleStore } from './subtitleStore'
import { resolveSubtitleTarget } from './subtitleTarget'
import type { ExternalSubtitlesDeps, SubtitleProvider } from './types'

const PROVIDER_COUNT = 2

let cached: ExternalSubtitlesDeps | null | undefined

/**
 * `null` no build base de loja sem portal (feature 078): a opção não existe, nunca "em breve" — a menos que a pessoa
 * tenha cadastrado uma chave pessoal, e então só ela é usada (o alvo é resolvido como `null` sem chave nem portal).
 * A licença é a mesma decisão LOCAL da entrada de lista: build não comercial não exige.
 */
export function defaultExternalSubtitles(): ExternalSubtitlesDeps | null {
  if (cached !== undefined) return cached
  const connection = getPortalConnection()
  const portalVisible = connection !== undefined && portalSurfacesVisible()
  const portalAllowed = () => portalVisible && (!commercialBuild || licenseMonitor.check().allowed)
  /** Atualizada no passo ocioso (resolve do alvo): `access()` é síncrona e não lê banco. */
  let personalKeys = 0

  const service = createSubtitleSearch({
    portal: (providers) =>
      portalAllowed() && connection
        ? createPortalSubtitleService(connection, providers.length === PROVIDER_COUNT ? {} : { providers })
        : null,
    readKeys: () => readChosenSubtitleKeys(),
    markKey: (provider, state) => markSubtitleKeyState(provider, state),
  })

  cached = {
    service,
    store: createSubtitleStore(),
    resolveTarget: async (itemId) => {
      personalKeys = Object.keys(await readChosenSubtitleKeys().catch(() => ({}))).length
      if (!portalVisible && personalKeys === 0) return null
      return resolveSubtitleTarget(itemId)
    },
    access: () => (portalAllowed() || personalKeys > 0 ? 'allowed' : 'not_entitled'),
    ...(portalVisible
      ? {
          useDefault: async (providers: readonly SubtitleProvider[]) => {
            await Promise.all(providers.map((provider) => setSubtitleKeyChosen(provider, false)))
          },
        }
      : {}),
  }
  return cached
}
