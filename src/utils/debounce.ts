export class AdaptiveDebouncer {
  private timeoutId: NodeJS.Timeout | null = null;
  private executionTimes: number[] = [];
  private currentDelay: number;
  private baseDelay: number;

  constructor(baseDelay: number = 300) {
    this.baseDelay = baseDelay;
    this.currentDelay = baseDelay;
  }

  public setBaseDelay(baseDelay: number) {
    this.baseDelay = baseDelay;
    this.currentDelay = baseDelay;
    this.executionTimes = [];
  }

  public getCurrentDelay(): number {
    return this.currentDelay;
  }

  public debounce(callback: (...args: any[]) => void | Promise<void>, ...args: any[]) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(async () => {
      const start = Date.now();
      try {
        await callback(...args);
      } finally {
        const duration = Date.now() - start;
        this.recordExecutionTime(duration);
      }
    }, this.currentDelay);
  }

  private recordExecutionTime(duration: number) {
    this.executionTimes.push(duration);
    if (this.executionTimes.length > 3) {
      this.executionTimes.shift();
    }

    if (this.executionTimes.length === 3) {
      const allSlow = this.executionTimes.every(t => t > 100);
      const allFast = this.executionTimes.every(t => t <= 50);

      if (allSlow && this.currentDelay === this.baseDelay) {
        this.currentDelay = Math.min(this.baseDelay * 2, 1000);
      } else if (allFast && this.currentDelay !== this.baseDelay) {
        this.currentDelay = this.baseDelay;
      }
    }
  }

  public cancel() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
