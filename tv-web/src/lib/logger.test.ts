import { describe, it, expect } from 'vitest'
import { sanitize, sanitizeError } from './logger'

describe('logger / sanitizer', () => {
  it('redacts query parameters', () => {
    const input = 'Request failed for http://api.com/player_api.php?username=myuser&password=mypassword&action=get_live'
    const expected = 'Request failed for http://api.com/player_api.php?username=***&password=***&action=get_live'
    expect(sanitize(input)).toBe(expected)
  })

  it('redacts xtream streaming paths', () => {
    const input = 'Error playing http://stream.com:8080/movie/myuser/mypass/12345.mp4'
    const expected = 'Error playing http://stream.com:8080/movie/***/***/12345.mp4'
    expect(sanitize(input)).toBe(expected)
  })

  it('sanitizes Error instances', () => {
    const err = new Error('Failed at /live/user1/pass1/99.ts')
    err.stack = 'Error: Failed at /live/user1/pass1/99.ts\n  at foo.js:1'
    
    const sanitized = sanitizeError(err) as Error
    expect(sanitized.message).toBe('Failed at /live/***/***/99.ts')
    expect(sanitized.stack).toContain('/live/***/***/99.ts')
  })

  it('sanitizes objects', () => {
    const obj = { url: 'http://foo.com?username=secret&password=123' }
    const sanitized = sanitizeError(obj) as any
    expect(sanitized.url).toBe('http://foo.com?username=***&password=***')
  })
})

