import '@testing-library/jest-dom/vitest'
// jsdom não implementa IndexedDB. Sem isto, toda a camada de
// armazenamento local (troca de geração, falha de escrita) só seria
// verificável à mão na TV — contrariando a prioridade de teste do projeto
// (research.md R6).
import 'fake-indexeddb/auto'
