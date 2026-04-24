// Minimal event emitter — no dependencies.
export class Emitter {
    constructor() {
        this.listeners = new Set();
    }
    on(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    off(fn) {
        this.listeners.delete(fn);
    }
    emit(payload) {
        // Copy to array so listeners can safely unsubscribe during emit.
        for (const l of Array.from(this.listeners))
            l(payload);
    }
    clear() {
        this.listeners.clear();
    }
}
//# sourceMappingURL=events.js.map