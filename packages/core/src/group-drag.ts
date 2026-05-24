// GroupDragController — live-preview state machine for dragging multiple
// selected tiles as a unit. Works analogously to DragController but applies
// a uniform cell delta to the entire group and uses Grid.moveGroup for
// displacement logic.

import type { CellPos, Tile } from './types.js';
import type { Grid } from './grid.js';

type Snapshot = Map<string, Tile>;

export interface GroupDragUpdateResult {
  committed: boolean;
  indicatorDelta: { dcol: number; drow: number } | null;
  changed: boolean;
}

export class GroupDragController {
  private grid: Grid;
  private tileIds: string[] = [];
  private snapshot: Snapshot | null = null;
  private pickupCells = new Map<string, CellPos>();
  private lastDelta: { dcol: number; drow: number } | null = null;
  private lastCommittedDelta: { dcol: number; drow: number } | null = null;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  isActive(): boolean {
    return this.tileIds.length > 0;
  }

  draggedIds(): string[] {
    return this.tileIds;
  }

  pickupCell(id: string): CellPos | undefined {
    return this.pickupCells.get(id);
  }

  /**
   * Begin a group drag. Snapshots the grid so previews can be rewound.
   * Returns false if any tile doesn't exist.
   */
  start(ids: string[]): boolean {
    if (ids.length === 0) return false;
    this.pickupCells.clear();
    for (const id of ids) {
      const tile = this.grid.getTile(id);
      if (!tile) return false;
      this.pickupCells.set(id, { col: tile.col, row: tile.row });
    }
    this.tileIds = [...ids];
    this.snapshot = this.grid.snapshotTiles();
    this.lastDelta = { dcol: 0, drow: 0 };
    this.lastCommittedDelta = { dcol: 0, drow: 0 };
    return true;
  }

  /**
   * Update the candidate delta (col/row offset from pickup). If the delta
   * hasn't changed since last call, this is a no-op.
   */
  update(delta: { dcol: number; drow: number }): GroupDragUpdateResult {
    if (!this.snapshot || this.tileIds.length === 0) {
      return { committed: false, indicatorDelta: null, changed: false };
    }

    const same =
      this.lastDelta !== null &&
      this.lastDelta.dcol === delta.dcol &&
      this.lastDelta.drow === delta.drow;
    if (same) {
      return {
        committed: this.lastCommittedDelta !== null,
        indicatorDelta: this.lastCommittedDelta,
        changed: false,
      };
    }
    this.lastDelta = { dcol: delta.dcol, drow: delta.drow };

    // Rewind to pickup snapshot before attempting the new delta.
    this.grid.restoreTiles(this.snapshot);

    if (delta.dcol === 0 && delta.drow === 0) {
      this.lastCommittedDelta = { dcol: 0, drow: 0 };
      return { committed: true, indicatorDelta: this.lastCommittedDelta, changed: true };
    }

    const ok = this.grid.moveGroup(this.tileIds, delta);
    this.lastCommittedDelta = ok ? { dcol: delta.dcol, drow: delta.drow } : null;
    return {
      committed: ok,
      indicatorDelta: this.lastCommittedDelta,
      changed: true,
    };
  }

  end(): { committed: boolean } {
    const result = { committed: this.lastCommittedDelta !== null };
    if (!this.lastCommittedDelta && this.snapshot) {
      this.grid.restoreTiles(this.snapshot);
    }
    this.reset();
    return result;
  }

  cancel(): void {
    if (this.snapshot) this.grid.restoreTiles(this.snapshot);
    this.reset();
  }

  private reset(): void {
    this.tileIds = [];
    this.snapshot = null;
    this.pickupCells.clear();
    this.lastDelta = null;
    this.lastCommittedDelta = null;
  }
}
