import { describe, it, expect } from 'vitest'
import {
  RESUME_MIN_SECONDS,
  RESUME_MAX_RATIO,
  PROGRESS_WRITE_INTERVAL_SECONDS,
  isResumable,
  isPastEnd,
  shouldWriteProgress,
} from './resumePolicy'

describe('resumePolicy', () => {
  describe('isResumable', () => {
    it('é falso abaixo do limiar inicial', () => {
      expect(isResumable(RESUME_MIN_SECONDS - 1)).toBe(false)
    })

    it('é verdadeiro exatamente no limiar inicial', () => {
      expect(isResumable(RESUME_MIN_SECONDS)).toBe(true)
    })

    it('é verdadeiro acima do limiar inicial', () => {
      expect(isResumable(RESUME_MIN_SECONDS + 60)).toBe(true)
    })

    it('é falso quando não há progresso nenhum', () => {
      expect(isResumable(undefined)).toBe(false)
    })

    it('é falso em zero', () => {
      expect(isResumable(0)).toBe(false)
    })
  })

  describe('isPastEnd', () => {
    it('é falso com duração ausente — nada é estimado (FR-004)', () => {
      expect(isPastEnd(999_000, undefined)).toBe(false)
    })

    it('é falso com duração zero', () => {
      expect(isPastEnd(0, 0)).toBe(false)
    })

    it('é falso a 94% da duração', () => {
      const duration = 100_000
      expect(isPastEnd(duration * 0.94, duration)).toBe(false)
    })

    it('é verdadeiro exatamente no limiar de 95%', () => {
      const duration = 100_000
      expect(isPastEnd(duration * RESUME_MAX_RATIO, duration)).toBe(true)
    })

    it('é verdadeiro a 96% da duração', () => {
      const duration = 100_000
      expect(isPastEnd(duration * 0.96, duration)).toBe(true)
    })
  })

  describe('shouldWriteProgress', () => {
    const stepMs = PROGRESS_WRITE_INTERVAL_SECONDS * 1000

    it('é falso para um avanço menor que o intervalo', () => {
      expect(shouldWriteProgress(1000, 1000 + stepMs - 1)).toBe(false)
    })

    it('é verdadeiro exatamente no intervalo, avançando', () => {
      expect(shouldWriteProgress(1000 + stepMs, 1000)).toBe(true)
    })

    it('é verdadeiro para um RETROCESSO maior que o intervalo (Math.abs)', () => {
      // Quem retrocede 20 minutos precisa que a posição seja regravada antes
      // de voltar ao ponto de onde saiu — sem Math.abs isso não aconteceria.
      expect(shouldWriteProgress(1000, 1000 + 20 * 60 * 1000)).toBe(true)
    })

    it('é falso para um retrocesso menor que o intervalo', () => {
      expect(shouldWriteProgress(1000, 1000 + stepMs - 1)).toBe(false)
    })
  })
})
