export type Listener<T> = (payload: T) => void;
export declare class Emitter<T> {
    private listeners;
    on(fn: Listener<T>): () => void;
    off(fn: Listener<T>): void;
    emit(payload: T): void;
    clear(): void;
}
//# sourceMappingURL=events.d.ts.map