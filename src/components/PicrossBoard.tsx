// ============================================================================
// PicrossBoard.tsx
// 列ヒント（上・下詰め）/ 行ヒント（左・右詰め）/ 盤面（右下）をまとめた
// 表示コンポーネント。
//
// 変更点（HintGrid統合によるリファクタリング）:
// - これまで独立コンポーネントだった HintGrid.tsx は、唯一の利用箇所である
//   「盤面に接続されたヒント表示・編集」専用に役割を絞り、このファイル内に
//   統合（インライン化）した。HintGrid.tsx は廃止。
// - renderHintLines（旧HintGridのレイアウト計算・編集ハンドラ）は、盤面の
//   行ヒント・列ヒント表示専用の内部実装としてこのファイルに閉じる。
//   外部から再利用される想定の汎用コンポーネントとしては公開しない。
// - ヒントのグリッド表示・編集はこの PicrossBoard のみが担う、という設計
//   意図を反映し、責務を一箇所に統一した。
//
// 盤面サイズは rowHints.length × colHints.length から決まる
// （呼び出し側が既にサイズに揃えてヒントを渡している前提）。
// ============================================================================

import type { CellValue, Grid, HintLines, SolvedGrid } from '../types';

const CELL_SIZE = 'w-7 h-7 sm:w-8 sm:h-8';
const HINT_CELL_SIZE = 'w-7 h-7 text-xs sm:w-8 sm:h-8 sm:text-sm';

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
  /** 行ヒントを盤面側で直接編集した結果を親に伝える */
  readonly onRowHintsChange: (lines: HintLines) => void;
  /** 列ヒントを盤面側で直接編集した結果を親に伝える */
  readonly onColHintsChange: (lines: HintLines) => void;
}

/**
 * 行ヒント・列ヒントを編集可能なグリッドとして描画する内部ヘルパー。
 * 旧 HintGrid.tsx の責務（パディング計算・行/列方向レイアウト・編集ハンドラ）
 * をそのまま引き継いだもので、盤面（PicrossBoard）専用の実装としてここに
 * 閉じる。
 */
function renderHintLines(
  lines: HintLines,
  orientation: 'row' | 'col',
  onChange: (lines: HintLines) => void
) {
  const maxLen = Math.max(1, ...lines.map((line) => line.length));

  const handleEdit = (lineIndex: number, posInLine: number, rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const next = lines.map((line, li) =>
      li === lineIndex ? line.map((v, pi) => (pi === posInLine ? parsed : v)) : line
    );
    onChange(next);
  };

  const renderCell = (value: number | null, lineIndex: number, posInLine: number, key: string) => {
    if (value === null) {
      return <div key={key} className={`${HINT_CELL_SIZE} border border-transparent`} />;
    }
    return (
      <input
        key={key}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => handleEdit(lineIndex, posInLine, e.target.value)}
        className={`${HINT_CELL_SIZE} border border-slate-300 bg-white text-center font-mono outline-none focus:border-slate-600`}
      />
    );
  };

  if (orientation === 'row') {
    return (
      <div className="flex flex-col">
        {lines.map((line, lineIndex) => {
          const padCount = maxLen - line.length;
          return (
            <div key={lineIndex} className="flex">
              {Array.from({ length: padCount }, (_, i) =>
                renderCell(null, lineIndex, -1, `${lineIndex}-pad-${i}`)
              )}
              {line.map((value, posInLine) =>
                renderCell(value, lineIndex, posInLine, `${lineIndex}-${posInLine}`)
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // orientation === 'col'
  return (
    <div className="flex">
      {lines.map((line, lineIndex) => {
        const padCount = maxLen - line.length;
        return (
          <div key={lineIndex} className="flex flex-col">
            {Array.from({ length: padCount }, (_, i) =>
              renderCell(null, lineIndex, -1, `${lineIndex}-pad-${i}`)
            )}
            {line.map((value, posInLine) =>
              renderCell(value, lineIndex, posInLine, `${lineIndex}-${posInLine}`)
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PicrossBoard({
  rowHints,
  colHints,
  grid,
  onRowHintsChange,
  onColHintsChange,
}: PicrossBoardProps) {
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
        {renderHintLines(colHints, 'col', onColHintsChange)}
      </div>
      <div className="overflow-auto">
        {renderHintLines(rowHints, 'row', onRowHintsChange)}
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