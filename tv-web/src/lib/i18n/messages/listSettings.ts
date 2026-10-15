import { defineArea } from './area'

/**
 * Configurações da lista e o aviso de escopo das Configurações globais (feature 067). Área própria porque
 * `settings.ts` está no teto de linhas da catraca. Nomes de lista vêm da lista e nunca são traduzidos (FR-027).
 */
export const listSettings = defineArea(
  {
    'listSettings.title': 'Configurações da lista',
    'listSettings.scope': 'Estas configurações valem só para esta lista.',
    'listSettings.globalScope': 'Estas configurações valem para todas as listas.',
    'listSettings.tab.account': 'Conta & lista',
    'listSettings.tab.epg': 'EPG',
    'listSettings.tab.parental': 'Categorias & controle parental',
    'listSettings.tab.history': 'Histórico',
    'listSettings.configure': 'Configurar',
    'listSettings.epg.open': 'Configurar EPG',
    'listSettings.epg.hint': 'A programação vem do endereço XMLTV da lista ou de um endereço que você informar.',
    'listSettings.missing.title': 'Lista não encontrada',
    'listSettings.missing.description': 'Esta lista não está mais cadastrada no aparelho.',
    'listSettings.loading': 'Carregando a lista…',
  },
  {
    'listSettings.title': 'List settings',
    'listSettings.scope': 'These settings apply to this list only.',
    'listSettings.globalScope': 'These settings apply to all lists.',
    'listSettings.tab.account': 'Account & list',
    'listSettings.tab.epg': 'EPG',
    'listSettings.tab.parental': 'Categories & parental control',
    'listSettings.tab.history': 'History',
    'listSettings.configure': 'Configure',
    'listSettings.epg.open': 'Set up EPG',
    'listSettings.epg.hint': "The guide comes from the list's XMLTV address or from an address you provide.",
    'listSettings.missing.title': 'List not found',
    'listSettings.missing.description': 'This list is no longer saved on this device.',
    'listSettings.loading': 'Loading the list…',
  },
  {
    'listSettings.title': 'Ajustes de la lista',
    'listSettings.scope': 'Estos ajustes valen solo para esta lista.',
    'listSettings.globalScope': 'Estos ajustes valen para todas las listas.',
    'listSettings.tab.account': 'Cuenta y lista',
    'listSettings.tab.epg': 'EPG',
    'listSettings.tab.parental': 'Categorías y control parental',
    'listSettings.tab.history': 'Historial',
    'listSettings.configure': 'Configurar',
    'listSettings.epg.open': 'Configurar EPG',
    'listSettings.epg.hint': 'La guía viene de la dirección XMLTV de la lista o de una dirección que indiques.',
    'listSettings.missing.title': 'Lista no encontrada',
    'listSettings.missing.description': 'Esta lista ya no está guardada en el dispositivo.',
    'listSettings.loading': 'Cargando la lista…',
  },
)
