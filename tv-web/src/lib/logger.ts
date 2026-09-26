export function sanitize(text: string): string {
  if (typeof text !== 'string') return text;
  
  let sanitized = text;
  // Redact query params username and password
  sanitized = sanitized.replace(/([?&](?:username|password)=)([^&\s'"]+)/gi, '$1***');
  
  // Redact xtream streaming paths: /movie/user/pass/ID.ext -> /movie/***/pass/ID.ext etc
  sanitized = sanitized.replace(/(\/(?:movie|series|live)\/)([^/]+)\/([^/]+)(\/[^\s'"]+)/gi, '$1***/***$4');
  
  return sanitized;
}

export function sanitizeError(error: unknown): unknown {
  if (error instanceof Error) {
    const sanitizedError = new Error(sanitize(error.message));
    sanitizedError.name = error.name;
    if (error.stack) {
      sanitizedError.stack = sanitize(error.stack);
    }
    return sanitizedError;
  }
  
  if (typeof error === 'string') {
    return sanitize(error);
  }
  
  if (error !== null && typeof error === 'object') {
    try {
      const json = JSON.stringify(error);
      return JSON.parse(sanitize(json));
    } catch {
      return error; // Circular JSON or other
    }
  }
  
  return error;
}

export const logger = {
  log: (...args: unknown[]) => console.log(...args.map(sanitizeError)),
  warn: (...args: unknown[]) => console.warn(...args.map(sanitizeError)),
  error: (...args: unknown[]) => console.error(...args.map(sanitizeError)),
};

