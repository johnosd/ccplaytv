import { resolveLocale } from '.'

// Conteúdo do FAQ do portal. Só fatos já decididos (specs 069/070, ADR-008/013/014);
// nada de preço, prazo ou canal de suporte que o produto não tenha.
export type FaqCategory = 'player' | 'lists' | 'license'
export type FaqAction = 'lists' | 'activate' | 'recover'
export interface FaqItem { id: string; category: FaqCategory; question: string; answer: string[]; action?: FaqAction }
interface FaqContent {
  title: string; intro: string; search: string; all: string; empty: string; clear: string; results: (count: number) => string
  categories: Record<FaqCategory, string>; actions: Record<FaqAction, string>
  stuckTitle: string; stuckHint: string; items: FaqItem[]
}

const pt: FaqContent = {
  title: 'Perguntas frequentes',
  intro: 'Tudo sobre o app, suas listas, a licença e o portal, em respostas curtas.',
  search: 'Buscar nas perguntas',
  all: 'Todas',
  empty: 'Nenhuma pergunta corresponde à sua busca.',
  clear: 'Limpar busca',
  results: count => count === 1 ? '1 pergunta' : count + ' perguntas',
  categories: { player: 'O app', lists: 'Listas e portal', license: 'Licença e pagamento' },
  actions: { lists: 'Ir para Listas', activate: 'Ir para Licença', recover: 'Recuperar acesso à TV' },
  stuckTitle: 'Ainda com dúvida?',
  stuckHint: 'Estes atalhos resolvem a maioria dos casos.',
  items: [
    { id: 'no-content', category: 'player', question: 'O CCPlayTV fornece canais ou listas?', answer: [
      'Não. O CCPlayTV é um player: ele organiza e reproduz a lista Xtream ou M3U que você contratou com o seu próprio provedor.',
      'O CCPlayTV não vende canais, listas nem assinaturas de IPTV.'] },
    { id: 'devices', category: 'player', question: 'Em quais aparelhos o app funciona?', answer: [
      'O app é feito para Smart TVs Samsung com Tizen.',
      'Este portal abre em qualquer navegador, no celular ou no computador, e serve para gerenciar a TV à distância.'] },
    { id: 'where-data', category: 'player', question: 'Onde ficam meu catálogo e meus vídeos?', answer: [
      'A importação, o catálogo e a reprodução acontecem na própria TV. O vídeo vem direto do seu provedor, sem passar pelos nossos servidores.',
      'O portal só guarda e entrega à TV os dados de conexão das listas que você cadastra aqui.'] },
    { id: 'formats', category: 'lists', question: 'Quais tipos de lista são aceitos?', answer: [
      'Xtream (servidor, usuário e senha) ou M3U por URL.',
      'Opcionalmente, você pode informar uma URL XMLTV de EPG e um ajuste de horário em horas.'] },
    { id: 'mac', category: 'lists', question: 'O que é o endereço MAC e onde encontro?', answer: [
      'É o identificador da sua TV no portal, no formato XX:XX:XX:XX:XX:XX. Ele aparece na tela Adicionar lista da TV, como ID do dispositivo, junto com a chave do dispositivo.',
      'Normalmente é o próprio endereço MAC de rede da TV, registrado no primeiro pareamento. Se ele não puder ser lido, a TV recebe um código fixo no mesmo formato, que funciona do mesmo jeito.',
      'Ele nunca muda: nem ao reinstalar o app, gerar uma nova chave ou trocar Wi‑Fi por cabo. Por isso, depois de uma troca de conexão, ele pode ser diferente do MAC mostrado nas configurações de rede da TV — use sempre o que aparece na tela Adicionar lista.',
      'O endereço MAC sozinho não dá acesso à TV: o portal também pede a chave do dispositivo.'] },
    { id: 'add-list', category: 'lists', question: 'Como adiciono uma lista pelo portal?', action: 'lists', answer: [
      'Na TV, abra a tela de adicionar lista: ela mostra um QR, o endereço MAC (ID do dispositivo) e a chave do dispositivo.',
      'Leia o QR com o celular ou digite o endereço MAC e a chave aqui no portal. Depois use “Adicionar lista”, preencha os dados e toque em “Enviar para a TV”.',
      'Depois de enviar, na TV aperte Atualizar: ela aplica a configuração e importa a lista.'] },
    { id: 'not-showing', category: 'lists', question: 'Minha lista não aparece na TV. O que faço?', answer: [
      'Veja o selo no cartão da lista: “Aguardando a TV” significa que a TV ainda não recebeu o pedido. Deixe a TV ligada, com o app aberto e conectado, e aperte Atualizar nela.',
      '“Erro” indica falha: toque em Reenviar ou edite a lista e confira os dados com o seu provedor. Não conseguimos corrigir links ou contas de terceiros. Para desistir de um envio que ainda aguarda a TV, use Cancelar envio.'] },
    { id: 'privacy', category: 'lists', question: 'Meus dados de acesso ficam seguros?', answer: [
      'Os dados que você cadastra no portal ficam guardados de forma cifrada enquanto a lista existir e só são entregues à sua TV.',
      'Eles nunca aparecem nos cards, em mensagens de erro ou em registros. Ao editar, o botão de olho mostra ou oculta os campos.',
      'Remover a lista apaga a configuração guardada no portal.'] },
    { id: 'trial', category: 'license', question: 'Quanto tempo dura o teste?', answer: [
      'Sete dias seguidos, contados do primeiro uso do app com internet. Fechar e reabrir o app não reinicia o prazo.'] },
    { id: 'price', category: 'license', question: 'Quanto custa e como pago?', action: 'activate', answer: [
      'R$ 35 por 12 meses, para uma TV. É uma compra avulsa, por Pix ou cartão no Mercado Pago, sem renovação automática.',
      'Na TV, aperte Comprar licença (no aviso de licença ou em Configurações → Portal & licença) para pagar com Pix direto no app do banco. Pelo portal, abra Licença e toque em Comprar licença (ou Renovar licença) para Pix ou cartão.',
      'Para renovar, basta comprar de novo quando quiser: os 12 meses se somam ao vencimento atual.'] },
    { id: 'activation-time', category: 'license', question: 'Paguei. Quando a licença aparece na TV?', answer: [
      'Assim que o Mercado Pago confirma o pagamento, a licença é liberada. Na TV, aperte Atualizar (na tela do Pix, no aviso de licença ou em Portal & licença) para recebê-la.',
      'Voltar à página ou guardar o comprovante não ativa a licença. Se o pagamento estiver pendente, não pague de novo: o mesmo pedido continua valendo.'] },
    { id: 'refund', category: 'license', question: 'Quem vende e como peço reembolso?', answer: [
      'A licença é vendida pelo CCPlayTV. Contato: ccplaytv@gmail.com.',
      'Você pode pedir o reembolso em até 7 dias depois da compra, pelo mesmo e-mail, informando o endereço MAC da TV. O pagamento é estornado pelo Mercado Pago e a licença daquela compra deixa de valer na TV no próximo Atualizar.'] },
    { id: 'transfer', category: 'license', question: 'Posso passar a licença para outra TV?', answer: [
      'Não. A licença vale para a TV cujo endereço MAC foi confirmado na compra. Cada TV precisa da sua própria licença.'] },
    { id: 'expired', category: 'license', question: 'O que acontece quando a licença vence?', action: 'activate', answer: [
      'Você não consegue abrir o catálogo de uma lista até renovar. Suas listas, configurações e dados locais continuam guardados, e a compra segue disponível na TV e no portal.',
      'Se uma lista já estiver aberta, ela continua funcionando até você sair dela ou fechar o app.'] },
    { id: 'recover', category: 'license', question: 'Reinstalei o app ou perdi o acesso. Como recupero?', action: 'recover', answer: [
      'Na TV, abra Portal & licença, entre em Avançado e escolha recuperar pelo site. Leia o QR temporário e informe o código de recuperação privado que você guardou.',
      'Para guardar o código antes de precisar: no portal, abra Ajustes → Código de recuperação e use Mostrar código de recuperação (a TV envia a cópia quando você aperta Atualizar nela). Anote ou fotografe e guarde em lugar seguro.',
      'O endereço MAC da TV ou o comprovante de pagamento não substituem esse código. Sem ele, a recuperação automática não é possível. O catálogo apagado da TV não é recuperado.'] },
    { id: 'tmdb', category: 'lists', question: 'Como coloco minha chave do TMDB?', answer: [
      'No portal, abra Ajustes → Chave TMDB, cole a chave que você criou na sua conta do TMDB e toque em Enviar para a TV. Na TV, abra Configurações → Integrações & BYOK e aperte Atualizar: ela testa a chave e o portal mostra “Aplicada na TV” ou “Recusada pelo TMDB”.',
      'A chave é enviada cifrada, apagada do serviço depois que a TV a aplica e nunca é mostrada de volta. Para trocar, envie outra; para tirar, use Remover chave.'] },
    { id: 'backup', category: 'lists', question: 'O que é o backup e como excluo?', answer: [
      'Quando você pede na TV, ela guarda uma cópia cifrada dos seus favoritos, histórico e progresso. O portal mostra só a data e as contagens.',
      'Em Ajustes → Backup você pode Excluir backup. Isso não apaga nada na TV, e a TV só volta a guardar um backup quando você pedir.'] },
  ],
}

const en: FaqContent = {
  title: 'Frequently asked questions',
  intro: 'Everything about the app, your lists, the license and the portal, in short answers.',
  search: 'Search the questions',
  all: 'All',
  empty: 'No question matches your search.',
  clear: 'Clear search',
  results: count => count === 1 ? '1 question' : count + ' questions',
  categories: { player: 'The app', lists: 'Lists and portal', license: 'License and payment' },
  actions: { lists: 'Go to Lists', activate: 'Go to License', recover: 'Recover TV access' },
  stuckTitle: 'Still have a question?',
  stuckHint: 'These shortcuts solve most cases.',
  items: [
    { id: 'no-content', category: 'player', question: 'Does CCPlayTV provide channels or lists?', answer: [
      'No. CCPlayTV is a player: it organizes and plays the Xtream or M3U list you got from your own provider.',
      'CCPlayTV does not sell channels, lists or IPTV subscriptions.'] },
    { id: 'devices', category: 'player', question: 'Which devices does the app run on?', answer: [
      'The app is built for Samsung Smart TVs running Tizen.',
      'This portal opens in any browser, on a phone or computer, so you can manage the TV remotely.'] },
    { id: 'where-data', category: 'player', question: 'Where are my catalog and videos?', answer: [
      'Import, catalog and playback all happen on the TV itself. Video comes straight from your provider and never goes through our servers.',
      'The portal only stores and delivers to the TV the connection details of the lists you add here.'] },
    { id: 'formats', category: 'lists', question: 'Which list types are supported?', answer: [
      'Xtream (host, user name and password) or an M3U URL.',
      'You can optionally add an XMLTV EPG URL and a time offset in hours.'] },
    { id: 'mac', category: 'lists', question: 'What is the MAC address and where do I find it?', answer: [
      'It identifies your TV in the portal, in the format XX:XX:XX:XX:XX:XX. It is shown on the TV’s Add list screen as Device ID, next to the device key.',
      'It is usually the TV’s own network MAC address, recorded at the first pairing. If that cannot be read, the TV gets a fixed code in the same format that works the same way.',
      'It never changes: not when you reinstall the app, generate a new key or switch between Wi‑Fi and cable. So after a connection change it may differ from the MAC shown in the TV’s network settings — always use the one on the Add list screen.',
      'The MAC address alone does not give access to the TV: the portal also asks for the device key.'] },
    { id: 'add-list', category: 'lists', question: 'How do I add a list from the portal?', action: 'lists', answer: [
      'On the TV, open the add-list screen: it shows a QR code, the MAC address (device ID) and the device key.',
      'Scan the QR with your phone or type the MAC address and key here. Then use “Add list”, fill in the details and choose “Send to TV”.',
      'After sending, press Refresh on the TV: it applies the configuration and imports the list.'] },
    { id: 'not-showing', category: 'lists', question: 'My list does not show on the TV. What should I do?', answer: [
      'Look at the badge on the list card: “Waiting for the TV” means the TV has not received the request yet. Keep the TV on, with the app open and online, and press Refresh on it.',
      '“Error” means it failed: choose Resend, or edit the list and check the details with your provider. We cannot fix third-party links or accounts. To give up on a send that is still waiting for the TV, use Cancel sending.'] },
    { id: 'privacy', category: 'lists', question: 'Are my access details safe?', answer: [
      'Details you add in the portal are stored encrypted while the list exists and are delivered only to your TV.',
      'They never appear on cards, in error messages or in logs. When editing, the eye button shows or hides the fields.',
      'Removing the list deletes the configuration saved in the portal.'] },
    { id: 'trial', category: 'license', question: 'How long is the trial?', answer: [
      'Seven consecutive days from the first time the app is used online. Closing and reopening the app does not restart it.'] },
    { id: 'price', category: 'license', question: 'How much is it and how do I pay?', action: 'activate', answer: [
      'R$35 for 12 months, for one TV. It is a one-time purchase by Pix or card on Mercado Pago, with no automatic renewal.',
      'On the TV, press Buy license (on the license notice or in Settings → Portal & license) to pay with Pix straight from your bank app. On the portal, open License and choose Buy license (or Renew license) for Pix or card.',
      'To renew, just buy again whenever you want: the 12 months are added to the current expiry date.'] },
    { id: 'activation-time', category: 'license', question: 'I paid. When does the license reach the TV?', answer: [
      'Once Mercado Pago confirms the payment, the license is released. On the TV, press Refresh (on the Pix screen, on the license notice or in Portal & license) to receive it.',
      'Going back to the page or keeping the receipt does not activate it. If the payment is pending, do not pay again: the same order still applies.'] },
    { id: 'refund', category: 'license', question: 'Who sells it and how do I ask for a refund?', answer: [
      'The license is sold by CCPlayTV. Contact: ccplaytv@gmail.com.',
      'You can ask for a refund within 7 days of the purchase at the same email, including the TV MAC address. The payment is refunded through Mercado Pago and that purchase’s license stops working on the TV at the next Refresh.'] },
    { id: 'transfer', category: 'license', question: 'Can I move my license to another TV?', answer: [
      'No. The license applies to the TV whose MAC address was confirmed at purchase. Each TV needs its own license.'] },
    { id: 'expired', category: 'license', question: 'What happens when the license expires?', action: 'activate', answer: [
      'You cannot open a list catalog until you renew. Your lists, settings and local data are kept, and purchase stays available on the TV and in the portal.',
      'A list that is already open keeps working until you leave it or close the app.'] },
    { id: 'recover', category: 'license', question: 'I reinstalled the app or lost access. How do I recover?', action: 'recover', answer: [
      'On the TV, open Portal & license, go to Advanced and choose recover on website. Scan the temporary QR and enter the private recovery code you saved.',
      'To keep the code before you need it: on the portal, open Settings → Recovery code and use Show recovery code (the TV sends a copy when you press Refresh on it). Write it down or take a photo and keep it safe.',
      'The TV MAC address or a payment receipt cannot replace this code. Without it, automatic recovery is not possible. A catalog deleted from the TV is not restored.'] },
    { id: 'tmdb', category: 'lists', question: 'How do I add my TMDB key?', answer: [
      'On the portal, open Settings → TMDB key, paste the key you created in your TMDB account and choose Send to the TV. On the TV, open Settings → Integrations and press Refresh: it tests the key and the portal shows “Applied on the TV” or “Rejected by TMDB”.',
      'The key is sent encrypted, deleted from the service once the TV applies it, and never shown back. To change it, send another; to clear it, use Remove key.'] },
    { id: 'backup', category: 'lists', question: 'What is the backup and how do I delete it?', answer: [
      'When you ask on the TV, it saves an encrypted copy of your favorites, history and progress. The portal shows only the date and the counts.',
      'In Settings → Backup you can Delete backup. This deletes nothing on the TV, and the TV only saves a backup again when you ask.'] },
  ],
}

const es: FaqContent = {
  title: 'Preguntas frecuentes',
  intro: 'Todo sobre la app, tus listas, la licencia y el portal, en respuestas cortas.',
  search: 'Buscar en las preguntas',
  all: 'Todas',
  empty: 'Ninguna pregunta coincide con tu búsqueda.',
  clear: 'Borrar búsqueda',
  results: count => count === 1 ? '1 pregunta' : count + ' preguntas',
  categories: { player: 'La app', lists: 'Listas y portal', license: 'Licencia y pago' },
  actions: { lists: 'Ir a Listas', activate: 'Ir a Licencia', recover: 'Recuperar acceso al televisor' },
  stuckTitle: '¿Todavía tienes dudas?',
  stuckHint: 'Estos accesos directos resuelven la mayoría de los casos.',
  items: [
    { id: 'no-content', category: 'player', question: '¿CCPlayTV ofrece canales o listas?', answer: [
      'No. CCPlayTV es un reproductor: organiza y reproduce la lista Xtream o M3U que contrataste con tu propio proveedor.',
      'CCPlayTV no vende canales, listas ni suscripciones de IPTV.'] },
    { id: 'devices', category: 'player', question: '¿En qué dispositivos funciona la app?', answer: [
      'La app está hecha para Smart TV Samsung con Tizen.',
      'Este portal se abre en cualquier navegador, en el móvil o en el ordenador, para gestionar el televisor a distancia.'] },
    { id: 'where-data', category: 'player', question: '¿Dónde quedan mi catálogo y mis vídeos?', answer: [
      'La importación, el catálogo y la reproducción ocurren en el propio televisor. El vídeo llega directo de tu proveedor, sin pasar por nuestros servidores.',
      'El portal solo guarda y entrega al televisor los datos de conexión de las listas que añades aquí.'] },
    { id: 'formats', category: 'lists', question: '¿Qué tipos de lista se aceptan?', answer: [
      'Xtream (servidor, usuario y contraseña) o M3U por URL.',
      'Opcionalmente puedes indicar una URL XMLTV de EPG y un ajuste horario en horas.'] },
    { id: 'mac', category: 'lists', question: '¿Qué es la dirección MAC y dónde la encuentro?', answer: [
      'Identifica tu televisor en el portal, con el formato XX:XX:XX:XX:XX:XX. Aparece en la pantalla Añadir lista del televisor como ID del dispositivo, junto a la clave del dispositivo.',
      'Normalmente es la propia dirección MAC de red del televisor, registrada en el primer emparejamiento. Si no se puede leer, el televisor recibe un código fijo con el mismo formato que funciona igual.',
      'Nunca cambia: ni al reinstalar la app, generar una clave nueva o pasar de Wi‑Fi a cable. Por eso, tras un cambio de conexión, puede ser distinta de la MAC que aparece en los ajustes de red del televisor; usa siempre la de la pantalla Añadir lista.',
      'La dirección MAC por sí sola no da acceso al televisor: el portal también pide la clave del dispositivo.'] },
    { id: 'add-list', category: 'lists', question: '¿Cómo añado una lista desde el portal?', action: 'lists', answer: [
      'En el televisor, abre la pantalla de añadir lista: muestra un QR, la dirección MAC (ID del dispositivo) y la clave del dispositivo.',
      'Lee el QR con el móvil o escribe la dirección MAC y la clave aquí. Luego usa “Añadir lista”, completa los datos y elige “Enviar al televisor”.',
      'Después de enviar, pulsa Actualizar en el televisor: aplica la configuración e importa la lista.'] },
    { id: 'not-showing', category: 'lists', question: 'Mi lista no aparece en el televisor. ¿Qué hago?', answer: [
      'Mira la etiqueta de la tarjeta de la lista: “Esperando a la TV” significa que el televisor aún no recibió la solicitud. Deja el televisor encendido, con la app abierta y conectada, y pulsa Actualizar en él.',
      '“Error” indica un fallo: elige Reenviar o edita la lista y revisa los datos con tu proveedor. No podemos corregir enlaces ni cuentas de terceros. Para desistir de un envío que aún espera al televisor, usa Cancelar envío.'] },
    { id: 'privacy', category: 'lists', question: '¿Mis datos de acceso están seguros?', answer: [
      'Los datos que añades en el portal se guardan cifrados mientras la lista exista y solo se entregan a tu televisor.',
      'Nunca aparecen en las tarjetas, en mensajes de error ni en registros. Al editar, el botón del ojo muestra u oculta los campos.',
      'Eliminar la lista borra la configuración guardada en el portal.'] },
    { id: 'trial', category: 'license', question: '¿Cuánto dura la prueba?', answer: [
      'Siete días seguidos desde el primer uso de la app con internet. Cerrar y volver a abrir la app no reinicia el plazo.'] },
    { id: 'price', category: 'license', question: '¿Cuánto cuesta y cómo pago?', action: 'activate', answer: [
      'R$35 por 12 meses, para un televisor. Es una compra única, por Pix o tarjeta en Mercado Pago, sin renovación automática.',
      'En el televisor, pulsa Comprar licencia (en el aviso de licencia o en Ajustes → Portal y licencia) para pagar con Pix directo en la app del banco. En el portal, abre Licencia y elige Comprar licencia (o Renovar licencia) para Pix o tarjeta.',
      'Para renovar, basta con comprar de nuevo cuando quieras: los 12 meses se suman al vencimiento actual.'] },
    { id: 'activation-time', category: 'license', question: 'Ya pagué. ¿Cuándo llega la licencia al televisor?', answer: [
      'En cuanto Mercado Pago confirma el pago, la licencia se libera. En el televisor, pulsa Actualizar (en la pantalla del Pix, en el aviso de licencia o en Portal y licencia) para recibirla.',
      'Volver a la página o guardar el comprobante no la activa. Si el pago está pendiente, no pagues de nuevo: la misma solicitud sigue valiendo.'] },
    { id: 'refund', category: 'license', question: '¿Quién vende y cómo pido un reembolso?', answer: [
      'La licencia la vende CCPlayTV. Contacto: ccplaytv@gmail.com.',
      'Puedes pedir el reembolso hasta 7 días después de la compra en el mismo correo, indicando la dirección MAC del televisor. El pago se devuelve por Mercado Pago y la licencia de esa compra deja de valer en el televisor en la próxima Actualización.'] },
    { id: 'transfer', category: 'license', question: '¿Puedo pasar la licencia a otro televisor?', answer: [
      'No. La licencia vale para el televisor cuya dirección MAC se confirmó en la compra. Cada televisor necesita su propia licencia.'] },
    { id: 'expired', category: 'license', question: '¿Qué pasa cuando vence la licencia?', action: 'activate', answer: [
      'No puedes abrir el catálogo de una lista hasta renovar. Tus listas, ajustes y datos locales se conservan, y la compra sigue disponible en el televisor y en el portal.',
      'Una lista que ya esté abierta sigue funcionando hasta que salgas de ella o cierres la app.'] },
    { id: 'recover', category: 'license', question: 'Reinstalé la app o perdí el acceso. ¿Cómo lo recupero?', action: 'recover', answer: [
      'En el televisor, abre Portal y licencia, entra en Avanzado y elige recuperar en el sitio. Lee el QR temporal e introduce el código de recuperación privado que guardaste.',
      'Para guardar el código antes de necesitarlo: en el portal, abre Ajustes → Código de recuperación y usa Mostrar código de recuperación (el televisor envía una copia cuando pulsas Actualizar en él). Anótalo o fotografíalo y guárdalo en un lugar seguro.',
      'La dirección MAC del televisor o el comprobante de pago no sustituyen ese código. Sin él, la recuperación automática no es posible. El catálogo borrado del televisor no se recupera.'] },
    { id: 'tmdb', category: 'lists', question: '¿Cómo agrego mi clave de TMDB?', answer: [
      'En el portal, abre Ajustes → Clave TMDB, pega la clave que creaste en tu cuenta de TMDB y elige Enviar a la TV. En el televisor, abre Ajustes → Integraciones y pulsa Actualizar: prueba la clave y el portal muestra “Aplicada en la TV” o “Rechazada por TMDB”.',
      'La clave se envía cifrada, se borra del servicio cuando el televisor la aplica y nunca se muestra de vuelta. Para cambiarla, envía otra; para quitarla, usa Quitar clave.'] },
    { id: 'backup', category: 'lists', question: '¿Qué es la copia de seguridad y cómo la borro?', answer: [
      'Cuando lo pides en el televisor, guarda una copia cifrada de tus favoritos, historial y progreso. El portal muestra solo la fecha y los recuentos.',
      'En Ajustes → Copia de seguridad puedes Borrar copia. Esto no borra nada en el televisor, y este solo vuelve a guardar una copia cuando lo pidas.'] },
  ],
}

export function faqContent(language = navigator.language): FaqContent {
  return { pt, en, es }[resolveLocale(language)]
}
