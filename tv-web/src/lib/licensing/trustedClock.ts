/** Relógio local conservador: high-watermark durável e avanço monotônico por sessão. */
export interface ClockCheckpoint { timeHighWatermark: number; signedServerTime: number }
export class TrustedClock {
  private high: number
  private server: number
  private anchor: number
  private monoAnchor: number
  private lastMono: number
  private wall: () => number
  private monotonic: () => number
  constructor(saved: ClockCheckpoint, wall: () => number = Date.now, monotonic: () => number = () => performance.now()) {
    this.wall = wall
    this.monotonic = monotonic
    if (![saved.timeHighWatermark, saved.signedServerTime].every(value => Number.isFinite(value) && value >= 0)) throw new Error('invalid_license_clock')
    this.high = saved.timeHighWatermark
    this.server = saved.signedServerTime
    this.anchor = Math.max(this.high, this.server)
    this.monoAnchor = this.lastMono = this.readMono()
  }
  private readMono() { const value = this.monotonic(); return Number.isFinite(value) && value >= 0 ? value : 0 }
  now(): number {
    const mono = this.readMono()
    // Reinício/reset da fonte monotônica não retrocede nem congela o avanço futuro.
    if (mono < this.lastMono) { this.anchor = this.high; this.monoAnchor = mono }
    this.lastMono = mono
    const wall = this.wall()
    this.high = Math.max(this.high, this.anchor + Math.max(0, mono - this.monoAnchor), Number.isFinite(wall) && wall >= 0 ? wall : 0)
    this.anchor = this.high
    this.monoAnchor = mono
    return this.high
  }
  acceptServerTime(serverTime: number) {
    if (!Number.isSafeInteger(serverTime) || serverTime < 0) throw new Error('invalid_license_clock')
    this.now()
    this.server = Math.max(this.server, serverTime)
    this.high = Math.max(this.high, this.server)
    this.anchor = this.high
    this.monoAnchor = this.lastMono = this.readMono()
  }
  checkpoint(): ClockCheckpoint { return { timeHighWatermark: this.now(), signedServerTime: this.server } }
}
