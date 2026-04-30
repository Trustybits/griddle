// DragController — live-preview state machine for drag-to-rearrange.
//
// Models the storyboard semantics: as the user drags a tile, the engine
// continuously runs the candidate move against a snapshot of the grid taken
// at pickup. Whenever the cursor crosses a cell boundary, any prior preview
// is rewound and the new candidate is attempted. The dragged tile and any
// displaced victims animate into their new positions via the adapter's FLIP
// loop while the drag is still in progress; on release the latest preview
// is committed. If the user releases over an invalid cell (out of bounds or
// rejected by the move engine), the snapshot is restored.
//
// This module is pure cell-space — pixel-to-cell conversion is the adapter's
// responsibility. That keeps the core engine free of any DOM concepts.

import type { CellPos, Tile } from './types.js';
import type { Grid } from './grid.js';

type Snapshot = Map<string, Tile>;

export interface DragUpdateResult {
  /** Whether the most recent candidate cell was successfully committed. */
  committed: boolean;
  /** Cell where the drop indicator should render (null if no valid target). */
  indicatorCell: CellPos | null;
  /** Did the candidate cell change since the previous update? */
  changed: boolean;
}

/**
 * Holds the snapshot/preview state for a single drag gesture. One controller
 * instance can be reused across drags — call `start()` to begin a new gesture
 * and `end()` or `cancel()` to finish.
 */
export class DragController {
  private grid: Grid;
  private tileId: string | null = null;
  private snapshot: Snapshot | null = null;
  private pickup: CellPos = { col: 0, row: 0 };
  private lastCandidate: CellPos | null = null;
  private lastCommitted: CellPos | null = null;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  /** True if a drag gesture is currently in progress. */
  isActive(): boolean {
    return this.tileId !== null;
  }

  /** ID of the tile currently being dragged, or null. */
  draggerId(): string | null {
    return this.tileId;
  }

  /** Cell where the drag was picked up (the dragger's pre-drag position). */
  pickupCell(): CellPos {
    return { col: this.pickup.col, row: this.pickup.row };
  }

  /**
   * Begin a drag gesture for `tileId`. Snapshots the grid so we can rewind on
   * each candidate change. Returns false if the tile doesn't exist.
   */
  start(tileId: string): boolean {
    const tile = this.grid.getTile(tileId);
    if (!tile) return false;
    this.tileId = tileId;
    this.snapshot = this.grid.snapshotTiles();
    this.pickup = { col: tile.col, row: tile.row };
    this.lastCandidate = { col: tile.col, row: tile.row };
    this.lastCommitted = { col: tile.col, row: tile.row };
    return true;
  }

  /**
   * The cursor is now over `candidate`. If it's the same cell as last update,
   * this is a no-op. If it changed, rewind any prior preview and attempt the
   * new candidate. Returns the resulting render hints.
   */
  update(candidate: CellPos): DragUpdateResult {
    if (!this.tileId || !this.snapshot) {
      return { committed: false, indicatorCell: null, changed: false };
    }

    const same =
      this.lastCandidate !== null &&
      this.lastCandidate.col === candidate.col &&
      this.lastCandidate.row === candidate.row;
    if (same) {
      return {
        committed: this.lastCommitted !== null,
        indicatorCell: this.lastCommitted,
        changed: false,
      };
    }
    this.lastCandidate = { col: candidate.col, row: candidate.row };

    // Always rewind to pickup state before attempting the new candidate, so
    // each preview is independent and we can't compound errors.
    this.grid.restoreTiles(this.snapshot);

    if (candidate.col === this.pickup.col && candidate.row === this.pickup.row) {
      // Back at pickup — nothing to commit, indicator at pickup.
      this.lastCommitted = { col: this.pickup.col, row: this.pickup.row };
      return { committed: true, indicatorCell: this.lastCommitted, changed: true };
    }

    const ok = this.grid.moveTile(this.tileId, candidate);
    this.lastCommitted = ok ? { col: candidate.col, row: candidate.row } : null;
    return {
      committed: ok,
      indicatorCell: this.lastCommitted,
      changed: true,
    };
  }

  /**
   * End the drag. The current preview state stays committed if it was a valid
   * move; otherwise the snapshot is restored. Returns the final state.
   */
  end(): { committed: boolean; finalCell: CellPos | null } {
    const result = {
      committed: this.lastCommitted !== null,
      finalCell: this.lastCommitted,
    };
    // If the last attempt was rejected, ensure we're back at the original state.
    if (!this.lastCommitted && this.snapshot) {
      this.grid.restoreTiles(this.snapshot);
    }
    this.tileId = null;
    this.snapshot = null;
    this.lastCandidate = null;
    this.lastCommitted = null;
    return result;
  }

  /** Abort the drag and restore the pre-drag grid state. */
  cancel(): void {
    if (this.snapshot) this.grid.restoreTiles(this.snapshot);
    this.tileId = null;
    this.snapshot = null;
    this.lastCandidate = null;
    this.lastCommitted = null;
  }
}
