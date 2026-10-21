/**
 * Sinal de "carga de lista em andamento" (feature 086, task T068).
 *
 * A medição na TV (R-014/R-015) mostrou que trabalho de segundo plano concorrendo com a carga por seção degrada as
 * duas pontas: a carga de séries foi de 3,2 s para 26,6 s e as leituras de categoria de ~0,2 s para ~10 s. O portão
 * de atividade do agendador (`prefetch/activityGate.ts`) só sabe de teclas — não sabe que uma carga está em curso.
 *
 * Não serve para coordenar transações (o IndexedDB faz isso): serve para que tarefas **adiáveis** se calem enquanto a
 * carga trabalha.
 */

let active = 0

/** Marca o início de uma carga. Devolve a função que marca o fim — chame-a sempre, inclusive em erro. */
export function beginSectionLoad(): () => void {
  active += 1
  let done = false
  return () => {
    if (done) return
    done = true
    active = Math.max(0, active - 1)
  }
}

/** Há carga de lista em andamento agora? Tarefa adiável deve esperar a próxima rodada. */
export function isSectionLoadActive(): boolean {
  return active > 0
}
