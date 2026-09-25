export class TokenBucket {
  constructor({ rate, burst, now = () => Date.now() }) {
    this.rate = rate;
    this.burst = burst;
    this.now = now;
    this.tokens = burst;
    this.updatedAt = now();
  }

  take() {
    const current = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((current - this.updatedAt) / 1000) * this.rate);
    this.updatedAt = current;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterMs: Math.ceil(((1 - this.tokens) / this.rate) * 1000) };
  }
}
