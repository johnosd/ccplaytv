// Feature 078: catálogo dos itens do gate de publicação no Samsung TV Seller Office.
// IDs estáveis (FR-014b). `SAM-*` = obrigatório Samsung (Launch Checklist oficial),
// nunca dispensável (FR-014a); `INT-*` = critério interno do projeto. `ref` aponta
// a origem: seção da página oficial ou L01–L10 de
// docs/guia-praticas-app-tv/10_checklist_de_lancamento.md. Ver logic/gate.md.

export const STATUS = Object.freeze({
  PASS: 'Pass',
  BLOCKED: 'Blocked',
  PENDING: 'Pending',
  NA: 'Not Applicable',
  WAIVED: 'Waived',
})

/**
 * @typedef {'Pass' | 'Blocked' | 'Pending' | 'Not Applicable' | 'Waived'} Status
 * @typedef {{ id: string, status: Status, detail: string, paths?: string[], owner?: string, justification?: string, nextAction?: string }} CheckResult
 * @typedef {{ id: string, klass: 'samsung' | 'internal', blocker: boolean, waivable: boolean, ref: string, title: string }} ChecklistItem
 */

const sam = (id, ref, title) => ({ id, klass: 'samsung', blocker: true, waivable: false, ref, title })
const int = (id, ref, title, { blocker = true, waivable = false } = {}) => ({ id, klass: 'internal', blocker, waivable, ref, title })

/** @type {readonly ChecklistItem[]} */
export const CHECKLIST = Object.freeze([
  sam('SAM-PKG-FILES', 'Packaging', 'Pacote contém config.xml, author-signature.xml e signature1.xml'),
  sam('SAM-PKG-MULTIARCH', 'Packaging', 'Multi-arquitetura (Not Applicable para .wgt Web)'),
  sam('SAM-CFG-TIZENID', 'Configuration/Tizen ID · L01', 'Tizen ID presente e igual ao da versão publicada'),
  sam('SAM-CFG-PACKAGEID', 'Configuration/Package ID · L01', 'Package ID único, sem caracteres especiais'),
  sam('SAM-CFG-VERSION', 'Configuration/Application Version · L01', 'Versão [0–255].[0–255].[0–65535], maior que a publicada'),
  sam('SAM-CFG-APIVERSION', 'Configuration/API Version · L04', 'required_version x.y coerente com o piso de runtime'),
  sam('SAM-CFG-TITLE', 'Configuration/Application Title · L05', 'name do pacote igual ao título do idioma padrão'),
  sam('SAM-CFG-SCREENSIZE', 'Configuration/Screensize · L03', 'Tamanho de tela na tag feature'),
  sam('SAM-PRV', 'Privileges · Privilege API · L03', 'Privilégios com nível, justificativa e regras nominais'),
  sam('SAM-SEC-AUTHOR', 'Application Package Security · L02', 'Mesma assinatura de autor da versão publicada'),
  sam('SAM-REG-PACKAGENAME', 'Configuration/Package ID', 'Nome do pacote sem colisão no Seller Office (manual)'),
  sam('SAM-REG-APPID', 'Configuration/Tizen ID', 'App ID do Seller Office registrado e vinculado ao Tizen ID'),
  sam('SAM-KIT-UIDESC', 'Others · L09', 'Application UI Description no template oficial'),
  sam('SAM-KIT-LOGO', 'Others · L08', 'Logo com transparência'),
  sam('SAM-KIT-ICONBG', 'Others · L08', 'Imagem de fundo do ícone'),
  sam('SAM-KIT-SHOTS', 'Others · L08', 'Quatro screenshots JPEG < 500 kB, 1280×720 ou 1920×1080'),
  sam('SAM-KIT-LISTING', 'Others · L05', 'Título e descrição em cada idioma suportado'),
  sam('SAM-KIT-PRIVACY', 'Others', 'URL pública HTTPS da política de privacidade'),
  sam('SAM-KIT-VOC', 'Others', 'E-mail de contato VOC'),
  sam('SAM-KIT-TESTACCESS', 'Others · L07', 'Conta/lista/licença de teste válida para revisão'),
  int('INT-CAND-TREE', 'FR-001', 'Árvore de trabalho limpa na revisão do candidato'),
  int('INT-CAND-HASH', 'FR-001 · SC-002', 'Candidato identificado por revisão, versão e hash'),
  int('INT-DIST-VARIANT', 'FR-002', 'Uma só variante distribuída por Tizen ID'),
  int('INT-PKG-INVENTORY', 'FR-004 · L10', 'Inventário emitido = declarado = empacotado'),
  int('INT-PKG-RELEASE', 'FR-003 · L10', 'Pacote de release, não de debug'),
  int('INT-SEC-CUSTODY', 'FR-007a · L02', 'Certificado de autor com identidade registrada e backup'),
  int('INT-KIT-SECRETS', 'FR-016 · L10', 'Kit e relatório sem segredos'),
  int('INT-EVD-STATIC', 'FR-013', 'Validação estática (lint, arquitetura)'),
  int('INT-EVD-BUILD', 'FR-013', 'Build e testes unitários'),
  int('INT-EVD-E2E', 'FR-013', 'Roteiro E2E no navegador'),
  int('INT-EVD-EMULATOR', 'FR-013', 'Roteiro no emulador Tizen', { waivable: true }),
  int('INT-EVD-TV', 'FR-013 · L06', 'Roteiro na TV física de referência'),
  int('INT-UPD-PRESERVE', 'FR-007 · L06', 'Atualização assinada preserva dados do usuário'),
])

/** @param {string} id */
export function checklistItem(id) {
  return CHECKLIST.find((item) => item.id === id)
}
