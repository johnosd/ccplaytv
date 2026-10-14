import type { Dispatch, ReactElement } from 'react'
import type { SourceOut } from '../features/import/importApi'
import { ADD_LIST_FOCUS_ID } from '../features/profiles/ProfilesScreen'
import type { SettingsFocus } from '../features/settings/SettingsScreen'
import type { ListSettingsFocus } from '../features/settings/tabs/settingsTab'
import type { AppNavAction, AppScreen } from './appNav'
import { EpgSettingsScreen, ListSettingsScreen, SettingsScreen, TmdbKeyScreen } from './routeModules'

/**
 * Rotas de Configurações — globais, da lista (feature 067), EPG e chave do TMDB — fora do `App.tsx`, que está no teto
 * de linhas da catraca (`sdd/specs/067-configuracoes-lista-global/plan.md` R-002). Mesmo papel dos `case` do `App`:
 * só despacha ações; toda regra de pilha mora em `appNav.ts`.
 */
export interface SettingsRouteContext {
  dispatch: Dispatch<AppNavAction>
  goBack: () => void
  /** Lista ativa da sessão (`null` sem lista, ex.: "Gerenciar listas" da tela de perfis). */
  activeSource: SourceOut | null
}

/** Abre Configurações da lista a partir de `from` (perfis, Fontes IPTV, Live/Filmes/Séries). */
export function openListSettings(dispatch: Dispatch<AppNavAction>, sourceId: string, from: AppScreen, restore?: ListSettingsFocus): void {
  dispatch({ type: 'open', screen: { name: 'list-settings', sourceId, restore }, from })
}

/** `undefined` quando a tela não é de Configurações — o `App` segue com os outros `case`. */
export function renderSettingsRoute(screen: AppScreen, { dispatch, goBack, activeSource }: SettingsRouteContext): ReactElement | undefined {
  switch (screen.name) {
    case 'epg-settings':
      return <EpgSettingsScreen sourceId={screen.source.id} onBack={goBack} />

    case 'tmdb-key':
      return <TmdbKeyScreen onSaved={goBack} onBack={goBack} />

    case 'list-settings': {
      // Voltar de Editar/progresso/EPG reabre esta tela na mesma aba e ação (FR-009).
      const here = (restore: ListSettingsFocus): AppScreen => ({ name: 'list-settings', sourceId: screen.sourceId, restore })
      return (
        <ListSettingsScreen
          sourceId={screen.sourceId}
          activeSourceId={activeSource?.id ?? null}
          initialFocus={screen.restore}
          onEditSource={(source, from) => dispatch({ type: 'open', screen: { name: 'edit-source', source }, from: here(from) })}
          onResyncStarted={(jobId, from) => dispatch({ type: 'open', screen: { name: 'progress', jobId }, from: here(from) })}
          onOpenEpg={(source, from) => dispatch({ type: 'open', screen: { name: 'epg-settings', source }, from: here(from) })}
          onSourceDeleted={(sourceId, nextFocusId) => {
            const settingsRestore: SettingsFocus = nextFocusId
              ? { zone: 'sources', sourceId: nextFocusId, action: 'configure' }
              : { zone: 'sources-add' }
            dispatch({ type: 'list-settings-deleted', sourceId, profilesFocusId: nextFocusId ?? ADD_LIST_FOCUS_ID, settingsRestore })
          }}
          onBack={goBack}
        />
      )
    }

    case 'settings': {
      const from = (restore: SettingsFocus): AppScreen => ({ name: 'settings', restore, standalone: screen.standalone })
      return (
        <SettingsScreen
          activeSourceId={activeSource?.id ?? null}
          initialFocus={screen.restore}
          onAddSource={(restore) => dispatch({ type: 'open', screen: { name: 'add-source' }, from: from(restore) })}
          onEditSource={(source, restore) => dispatch({ type: 'open', screen: { name: 'edit-source', source }, from: from(restore) })}
          onResyncStarted={(jobId, restore) => dispatch({ type: 'open', screen: { name: 'progress', jobId }, from: from(restore) })}
          onOpenEpg={(source, restore) => dispatch({ type: 'open', screen: { name: 'epg-settings', source }, from: from(restore) })}
          onOpenTmdbKey={(restore) => dispatch({ type: 'open', screen: { name: 'tmdb-key' }, from: from(restore) })}
          onConfigureSource={(source, restore) => openListSettings(dispatch, source.id, from(restore))}
          onSourceDeleted={(sourceId) => dispatch({ type: 'source-removed', sourceId })}
          onBack={goBack}
          shell={
            !screen.standalone && activeSource
              ? {
                  sourceName: activeSource.display_name,
                  onGoHome: () => dispatch({ type: 'go-home' }),
                  onSwitchTop: (destination) => dispatch({ type: 'switch-top', screen: { name: destination } }),
                  onOpenProfiles: () => dispatch({ type: 'open-profiles' }),
                  onOpenSearch: () => dispatch({ type: 'switch-top', screen: { name: 'search' } }),
                }
              : undefined
          }
        />
      )
    }

    default:
      return undefined
  }
}
