/** Política de retomada: a definição vive em `lib/catalog/resumePolicy.ts` (feature 063, D-006); aqui só a reexportação, porque a trava da 019 e os importadores do player usam este caminho. */
export {
  MOVIE_WATCHED_RATIO,
  PROGRESS_WRITE_INTERVAL_SECONDS,
  RESUME_MAX_RATIO,
  RESUME_MIN_SECONDS,
  isPastEnd,
  isResumable,
  shouldWriteProgress,
} from '../catalog/resumePolicy'
