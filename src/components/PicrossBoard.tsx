// ============================================================================
// PicrossBoard.tsx
// 列ヒント（上）/ 行ヒント（左）/ 盤面（右下）をまとめた表示コンポーネント。
//
// 変更点（スクロール同期アーキテクチャの刷新）:
// - 旧実装は「列ヒント」「行ヒント」「盤面」がそれぞれ個別の overflow-auto
//   を持っており、盤面をスクロールしてもヒント側が追従しなかった
//   （大規模盤面でズレる/対応が分からなくなる致命的な問題）。
// - 新実装では盤面・行ヒント・列ヒント・交点ブロックを「単一のスクロール
//   コンテナ」の中に置き、列ヒント行を sticky top-0、行ヒント列を
//   sticky left-0、交点ブロックを sticky top-0 left-0 にすることで、
//   ブラウザ標準のスクロール挙動だけでヒントと盤面の対応を維持する。
// - スクロール位置はReact stateで一切管理しない。再レンダリングは
//   発生しない（ヒント編集・解答更新時のみ更新される）。
//
// セルサイズ統一:
// - 盤面セルとヒントセルは CELL_PX という単一の基準（px）から導出する。
//   どちらも同じ px 値・同じ border 幅を使うため、行/列方向で
//   ヒントと盤面のグリッド線が必ず一致する。
//
// 大規模盤面（100×100以上）:
// - 要求の「代替条件」（明確な性能問題が発生する場合のみ Virtual Scroll /
//   Canvas を検討）に従い、まずは固定DOM + sticky 方式を採用する。
//   100×100程度ではDOM要素数・描画負荷は許容範囲内であり、ヒントとの
//   位置整合性を最優先する。
// ============================================================================

import type { CSSProperties } from 'react';
import type { CellValue, Grid, HintLines, SolvedGrid } from '../types';

/** 盤面セル・ヒントセルが共有する唯一の基準サイズ（px）。ズレ防止のため一箇所で管理する。 */
const CELL_PX = 32;
const CELL_BORDER_PX = 1;

const cellStyle: CSSProperties = {
  width: CELL_PX,
  height: CELL_PX,
  boxSizing: 'border-box',
  borderWidth: CELL_BORDER_PX,
  borderStyle: 'solid',
};

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

function handleEdit(
  lines: HintLines,
  lineIndex: number,
  posInLine: number,
  rawValue: string,
  onChange: (lines: HintLines) => void
) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return;
  const next = lines.map((line, li) =>
    li === lineIndex ? line.map((v, pi) => (pi === posInLine ? parsed : v)) : line
  );
  onChange(next);
}

/** 列ヒント（盤面の上、sticky top-0）を1列ずつ描画する。各列の幅は CELL_PX に統一される。 */
function ColHints({
  colHints,
  maxLen,
  onChange,
}: {
  colHints: HintLines;
  maxLen: number;
  onChange: (lines: HintLines) => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex bg-slate-50">
      {colHints.map((line, lineIndex) => {
        const padCount = maxLen - line.length;
        return (
          <div key={lineIndex} className="flex flex-col" style={{ width: CELL_PX }}>
            {Array.from({ length: padCount }, (_, i) => (
              <div key={`pad-${i}`} style={cellStyle} className="border-transparent" />
            ))}
            {line.map((value, posInLine) => (
              <input
                key={posInLine}
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) =>
                  handleEdit(colHints, lineIndex, posInLine, e.target.value, onChange)
                }
                style={cellStyle}
                className="border-slate-300 bg-white text-center font-mono text-xs outline-none focus:border-slate-600 sm:text-sm"
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** 行ヒント（盤面の左、sticky left-0）を1行ずつ描画する。各行の高さは CELL_PX に統一される。 */
function RowHints({
  rowHints,
  maxLen,
  onChange,
}: {
  rowHints: HintLines;
  maxLen: number;
  onChange: (lines: HintLines) => void;
}) {
  return (
    <div className="sticky left-0 z-10 flex flex-col bg-slate-50">
      {rowHints.map((line, lineIndex) => {
        const padCount = maxLen - line.length;
        return (
          <div key={lineIndex} className="flex" style={{ height: CELL_PX }}>
            {Array.from({ length: padCount }, (_, i) => (
              <div key={`pad-${i}`} style={cellStyle} className="border-transparent" />
            ))}
            {line.map((value, posInLine) => (
              <input
                key={posInLine}
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) =>
                  handleEdit(rowHints, lineIndex, posInLine, e.target.value, onChange)
                }
                style={cellStyle}
                className="border-slate-300 bg-white text-center font-mono text-xs outline-none focus:border-slate-600 sm:text-sm"
              />
            ))}
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

  const rowMaxLen = Math.max(1, ...rowHints.map((line) => line.length));
  const colMaxLen = Math.max(1, ...colHints.map((line) => line.length));

  const displayGrid: readonly (readonly CellValue[])[] =
    grid && grid.length === rows && (grid[0]?.length ?? 0) === cols
      ? (grid as readonly (readonly CellValue[])[])
      : Array.from({ length: rows }, () => Array.from({ length: cols }, () => -1 as CellValue));

  return (
    // 単一スクロールコンテナ: 盤面・行ヒント・列ヒント・交点はすべてこの中に存在する。
    // スクロールはブラウザ標準の挙動に委ね、Reactは関与しない。
    <div className="max-h-[70vh] max-w-full overflow-auto rounded border border-slate-400">
      <div className="inline-grid" style={{ gridTemplateColumns: 'auto 1fr' }}>
        {/* 左上交点: 行・列ヒント両方に対してstickyにすることで常に画面左上に固定される */}
        <div
          className="sticky top-0 left-0 z-30 bg-slate-50"
          style={{ width: rowMaxLen * CELL_PX, height: colMaxLen * CELL_PX }}
        />
        <ColHints colHints={colHints} maxLen={colMaxLen} onChange={onColHintsChange} />
        <RowHints rowHints={rowHints} maxLen={rowMaxLen} onChange={onRowHintsChange} />
        {/* 盤面本体: 固定DOM。スクロールによる再生成は行わない。 */}
        <div>
          {displayGrid.map((row, i) => (
            <div key={i} className="flex">
              {row.map((cell, j) => (
                <div
                  key={j}
                  style={cellStyle}
                  className={`border-slate-300 ${cellClass(cell)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}