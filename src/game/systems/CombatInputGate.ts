export class RisingEdgeInput {
  private held = false;
  private queued = false;
  private blockedUntilRelease = false;

  public update(isDown: boolean): boolean {
    if (!isDown) {
      this.held = false;
      this.blockedUntilRelease = false;
      return false;
    }
    if (this.blockedUntilRelease) return false;
    if (this.held) return false;
    this.held = true;
    return true;
  }

  /** Queue a physical key-down edge. Browser key-repeat never creates work. */
  public keyDown(repeat = false): void {
    if (repeat || this.held || this.blockedUntilRelease) return;
    this.held = true;
    this.queued = true;
  }

  public keyUp(): void { this.held = false; this.blockedUntilRelease = false; }

  /** Consume at most one attack request during the next game update. */
  public consume(): boolean {
    if (!this.queued) return false;
    this.queued = false;
    return true;
  }

  public suppressUntilRelease(currentlyDown = true): void {
    this.held = currentlyDown;
    this.queued = false;
    this.blockedUntilRelease = currentlyDown;
  }
  public reset(): void { this.held = false; this.queued = false; this.blockedUntilRelease = false; }
  public get isHeld(): boolean { return this.held && !this.blockedUntilRelease; }
}
