import { defineArea } from './area'

/**
 * Portal & licença → Avançado (feature 076): textos de "para que serve / quando usar" de cada item e o lembrete da
 * tela principal. Área própria porque `portal.ts` está no teto de linhas do ratchet. "Código de recuperação" nunca é
 * chamado de licença: ele não é uma licença comprada (D-008).
 */
export const portalAdvanced = defineArea(
  {
    'portal.advanced': 'Avançado',
    'portal.advanced.intro': 'Ações raras: a maioria das pessoas nunca precisa delas.',
    'portal.advanced.codeText': 'É a sua senha de reserva — não é uma licença comprada. Guarde fora da TV (papel ou foto no celular): se você formatar a TV ou reinstalar o app, é ele que permite recuperar a sua licença e o seu backup.',
    'portal.advanced.rotateText': 'Troca a chave, o QR e o código de recuperação. Use se alguém viu a sua chave ou para desconectar o site: as sessões abertas no site são encerradas. Listas, favoritos e licença continuam.',
    'portal.advanced.recoverText': 'Use quando esta TV perdeu o acesso ao portal (por exemplo, depois de reinstalar o app). Mostra um QR temporário: leia no celular, informe o código de recuperação e confirme o ID. Nada é apagado.',
    'portal.advanced.unlinkText': 'Solta o vínculo desta TV com o portal, sem apagar listas e dados. Depois, Vincular de novo volta ao mesmo cadastro (mesmo ID), com chave nova.',
    'portal.advanced.needsPairing': 'Disponível depois que esta TV for vinculada ao portal.',
    'portal.codeReminder': 'Guarde seu código de recuperação em Avançado.',
  },
  {
    'portal.advanced': 'Advanced',
    'portal.advanced.intro': 'Rarely needed actions: most people never need them.',
    'portal.advanced.codeText': 'It is your backup password — it is not a purchased license. Keep it outside the TV (on paper or as a phone photo): if you reset the TV or reinstall the app, it lets you recover your license and your backup.',
    'portal.advanced.rotateText': 'Changes the key, the QR and the recovery code. Use it if someone saw your key or to disconnect the website: sessions open on the website are ended. Lists, favorites and license stay.',
    'portal.advanced.recoverText': 'Use it when this TV lost access to the portal (for example, after reinstalling the app). It shows a temporary QR: scan it on your phone, enter the recovery code and confirm the ID. Nothing is deleted.',
    'portal.advanced.unlinkText': 'Releases this TV from the portal without deleting lists or data. Afterwards, Link again returns to the same registration (same ID), with a new key.',
    'portal.advanced.needsPairing': 'Available once this TV is linked to the portal.',
    'portal.codeReminder': 'Keep your recovery code safe in Advanced.',
  },
  {
    'portal.advanced': 'Avanzado',
    'portal.advanced.intro': 'Acciones poco frecuentes: la mayoría de las personas nunca las necesita.',
    'portal.advanced.codeText': 'Es tu contraseña de reserva — no es una licencia comprada. Guárdalo fuera de la TV (en papel o en una foto del móvil): si restableces la TV o reinstalas la app, te permite recuperar tu licencia y tu copia de seguridad.',
    'portal.advanced.rotateText': 'Cambia la clave, el QR y el código de recuperación. Úsalo si alguien vio tu clave o para desconectar el sitio: las sesiones abiertas en el sitio se cierran. Listas, favoritos y licencia continúan.',
    'portal.advanced.recoverText': 'Úsalo cuando esta TV perdió el acceso al portal (por ejemplo, tras reinstalar la app). Muestra un QR temporal: léelo con el móvil, introduce el código de recuperación y confirma el ID. No se borra nada.',
    'portal.advanced.unlinkText': 'Suelta el vínculo de esta TV con el portal sin borrar listas ni datos. Después, Vincular de nuevo vuelve al mismo registro (mismo ID), con una clave nueva.',
    'portal.advanced.needsPairing': 'Disponible cuando esta TV esté vinculada al portal.',
    'portal.codeReminder': 'Guarda tu código de recuperación en Avanzado.',
  },
)
