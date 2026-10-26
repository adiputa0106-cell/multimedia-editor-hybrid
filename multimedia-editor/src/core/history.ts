/**
 * History Manager — Undo/Redo untuk edit-state
 *
 * Menyimpan snapshot immutable dari edit-state.
 * Digunakan oleh Photo Editor dan nanti Video Editor.
 */

export class HistoryManager<T> {
  private history: T[] = [];
  private currentIndex: number = -1;
  private maxSize: number;

  constructor(initialState: T, maxSize: number = 50) {
    this.maxSize = maxSize;
    this.history = [structuredClone(initialState)];
    this.currentIndex = 0;
  }

  /** Push a new state, discarding any redo states */
  push(state: T): void {
    // Discard future states
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(structuredClone(state));

    // Enforce max size
    if (this.history.length > this.maxSize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  /** Undo — return previous state or null if at beginning */
  undo(): T | null {
    if (this.currentIndex <= 0) return null;
    this.currentIndex--;
    return structuredClone(this.history[this.currentIndex]);
  }

  /** Redo — return next state or null if at end */
  redo(): T | null {
    if (this.currentIndex >= this.history.length - 1) return null;
    this.currentIndex++;
    return structuredClone(this.history[this.currentIndex]);
  }

  /** Get current state */
  current(): T {
    return structuredClone(this.history[this.currentIndex]);
  }

  /** Can undo? */
  get canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /** Can redo? */
  get canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /** Reset to a new initial state */
  reset(state: T): void {
    this.history = [structuredClone(state)];
    this.currentIndex = 0;
  }
}
