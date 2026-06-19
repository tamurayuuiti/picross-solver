// ============================================================================
// PicrossBoard.tsx
// 列ヒント（上・下詰め）/ 行ヒント（左・右詰め）/ 盤面（右下）をまとめた
// 表示コンポーネント。既存の盤面描画ロジックをここに移植し、
// rowHints/colHints/grid の変化に追従できるよう再設計した。
//
// 盤面サイズは rowHints.length × colHints.length から決まる
// （呼び出し側が既にサイズに揃えてヒントを渡している前提）。
// ============================================================================

import type { CellValue, Grid, HintLines, SolvedGrid } from '../types';
import { HintGrid } from './HintGrid';

const CELL_SIZE = 'w-7 h-7 sm:w-8 sm:h-8';

function cellClass(value: CellValue): string {
  if (value === 1) return 'bg-slate-900';
  if (value === 0) return 'bg-white';
  return 'bg-slate-200';
}

interface PicrossBoardProps {
  readonly rowHints: HintLines;
  readonly colHints: HintLines;
  /** ソルバー出力の盤面。未指定/サイズ不一致時は空盤面を表示する。 */
  readonly grid?: Grid | SolvedGrid | null;
}

export function PicrossBoard({ rowHints, colHints, grid }: PicrossBoardProps) {
  const rows = rowHints.length;
  const cols = colHints.length;

  const displayGrid: readonly (readonly CellValue[])[] =
    grid && grid.length === rows && (grid[0]?.length ?? 0) === cols
      ? (grid as readonly (readonly CellValue[])[])
      : Array.from({ length: rows }, () => Array.from({ length: cols }, () => -1 as CellValue));

  return (
    <div
      className="inline-grid"
      style={{ gridTemplateColumns: 'auto 1fr', gridTemplateRows: 'auto 1fr' }}
    >
      <div />
      <div className="overflow-auto">
        <HintGrid lines={colHints} orientation="col" editable={false} />
      </div>
      <div className="overflow-auto">
        <HintGrid lines={rowHints} orientation="row" editable={false} />
      </div>
      <div className="border border-slate-400">
        {displayGrid.map((row, i) => (
          <div key={i} className="flex">
            {row.map((cell, j) => (
              <div key={j} className={`${CELL_SIZE} border border-slate-300 ${cellClass(cell)}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}