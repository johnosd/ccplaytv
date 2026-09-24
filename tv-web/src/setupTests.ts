import '@testing-library/jest-dom/vitest'
// jsdom não implementa IndexedDB. Sem isto, toda a camada de
// armazenamento local (troca de geração, falha de escrita) só seria
// verificável à mão na TV — contrariando a prioridade de teste do projeto
// (research.md R6).
import 'fake-indexeddb/auto'

// jsdom não implementa `Element.scrollIntoView` (usado por
// `useScrollFocusedIntoView`, feature 009 — trilha de categorias sem
// virtualização, D-004). Sem isto, qualquer tela com trilha falha ao
// montar em teste. Um no-op basta: testes verificam índice/identidade do
// foco, nunca a posição real de rolagem — isso só a TV física confirma
// (FR-008/SC-002).
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
