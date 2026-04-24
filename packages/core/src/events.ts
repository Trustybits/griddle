// Minimal event emitter — no dependencies.

export type Listener<T> = (payload: T) => void;

export class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  on(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  off(fn: Listener<T>): void {
    this.listeners.delete(fn);
  }

  emit(payload: T): void {
    // Copy to array so listeners can safely unsubscribe during emit.
    for (const l of Array.from(this.listeners)) l(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
