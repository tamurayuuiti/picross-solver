// ============================================================================
// PicrossBoard.tsx
// 列ヒント（上）/ 行ヒント（左）/ 盤面（右下）をまとめた表示コンポーネント。
//
// 変更点（ヒントグリッド中間の罫線が二重描画されていた問題を修正）:
// - 前回の修正では、行ヒントの全セルに borderTopWidth（上辺）と
//   borderBottomWidth（下辺）の両方を設定していた。これにより、行iの
//   下辺と行i+1の上辺が「同じ境界線」を指すにもかかわらず、両方の
//   セルがそれぞれ実体のある罫線を描いてしまい、特に5マスごとの
//   太線部分で二重描画（実質的な太さの加算）が発生し、罫線がズレて
//   見える原因になっていた。
// - 修正方針: 1つの境界線は必ず「どちらか一方のセル」だけが描く、という
//   原則に統一する。
//   - 中間の境界（行ヒントの行i→行i+1, i = 0..rows-2）は、これまで通り
//     「行iの下辺」だけが担当する（borderWeightPxによる5マス区切り判定）。
//     行i+1側にはこの境界用の上辺は描かない。
//   - ヒントグリッド自身の最外周（行ヒントなら行0の上辺・行rows-1の下辺、
//     列ヒントなら列0の左辺・列cols-1の右辺）だけを特別扱いし、
//     「他のどのセルも担当していない辺」にのみ HINT_OUTER_BORDER_PX を追加する。
//     これなら中間の境界とは完全に独立しており、二重描画が起こらない。
//
// 既存の変更点（5マス区切り + 盤面外枠強化 + ヒントの一セルグリッド化 +
// 左上交点のグリッド化）:
// - 罫線太さの決定を isMajorLine / borderWeightPx という単一の純粋関数に
//   集約し、盤面・行ヒント・列ヒント・交点ブロックが同じ関数を同じ引数
//   （index, total）で呼ぶ。これにより太線の位置が構造的に一致する。
// - セルサイズ(CELL_PX)自体は変更しない。
// - 盤面本体の外枠は「外枠に接する辺だけ」を個別の borderColor で塗り分ける。
// - 左上の交点ブロックは1セルごとの格子として描画する（変更なし）。
//
// スクロール同期アーキテクチャ（既存・変更なし）:
// - 盤面・行ヒント・列ヒント・交点ブロックは単一のスクロールコンテナの中に
//   置かれ、列ヒント行はsticky top-0、行ヒント列はsticky left-0、
//   交点ブロックはsticky top-0 left-0。スクロール位置はReact stateで
//   一切管理しない。
//
// 大規模盤面（100×100以上）:
// - 固定DOM + sticky方式を維持。罫線計算はpure functionのO(1)呼び出しのみ
//   なので、セル数が増えてもレンダリングコスト増は従来と同等。
// ============================================================================

import type { CSSProperties } from 'react';
import type { CellValue, Grid, HintLines, SolvedGrid } from '../types';

// ----------------------------------------------------------------------------
// グリッド寸法・罫線太さ・罫線色の基準値
// （盤面・行ヒント・列ヒントが共有する唯一の参照元）
// ----------------------------------------------------------------------------

/** 盤面セル・ヒントセルが共有する唯一の基準サイズ（px）。ズレ防止のため一箇所で管理する。 */
const CELL_PX = 32;

/** 通常罫線の太さ（px） */
const MINOR_BORDER_PX = 1;

/** 5マス区切りの太線の太さ（px） */
const MAJOR_BORDER_PX = 2;

/** 盤面本体（セル領域）の外枠の太さ（px）。ヒントグリッドの内側に描く。 */
const BOARD_OUTER_BORDER_PX = 3;

/** ヒントグリッド自身の最外周（最上段上辺・最下段下辺・最左列左辺・最右列右辺）の太さ（px） */
const HINT_OUTER_BORDER_PX = 2;

/** 何マスごとに太線を引くか */
const MAJOR_INTERVAL = 5;

/** 通常罫線の色（盤面用） */
const BOARD_MINOR_BORDER_COLOR = '#94a3b8'; // slate-400相当
/** 盤面本体の外枠線の色 */
const BOARD_OUTER_BORDER_COLOR = '#475569'; // slate-600相当
/** ヒントグリッドの罫線色（主軸・直交軸とも共通、交点ブロックも同色） */
const HINT_BORDER_COLOR = '#cbd5e1'; // slate-300相当

/**
 * 「このインデックスのセルの右側 / 下側」に太線を引くべきか。
 * index は 0-based のセル位置（行なら row index、列なら col index）。
 * total はそのライン上の総セル数（最後のセルには別レイヤーの外枠が
 * 担当するため太線は不要、という前提の関数）。
 *
 * 重要: 中間の境界線は必ず「片側のセルの右辺/下辺」だけが描く。
 * 反対側のセルが同じ境界に別の罫線を重ねて描いてはならない
 * （二重描画によるズレ・太さの加算を防ぐため）。
 */
function isMajorLine(index: number, total: number): boolean {
  const pos = index + 1; // 1-based の「これが何番目か」
  if (pos >= total) return false; // 最後は別レイヤーの外枠が担当するので太線不要
  return pos % MAJOR_INTERVAL === 0;
}

/** 罫線の太さ(px)を返す。border-right / border-bottom にそのまま使う。 */
function borderWeightPx(index: number, total: number): number {
  return isMajorLine(index, total) ? MAJOR_BORDER_PX : MINOR_BORDER_PX;
}

// ----------------------------------------------------------------------------
// セル描画ヘルパー
// ----------------------------------------------------------------------------

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

/**
 * 列ヒント（盤面の上、sticky top-0）を1列ずつ描画する。
 * - 右側の罫線: 中間の境界はすべて borderWeightPx(colIndex, cols) が担当
 *   （5マス区切り判定）。最右列（colIndex === cols - 1）だけは、本来
 *   borderWeightPxが0相当を返す位置なので、ここで HINT_OUTER_BORDER_PX を
 *   明示的に上書きする（他のセルがこの境界を描くことはないため、
 *   二重描画は発生しない）。
 * - 左側の罫線: 最左列（colIndex === 0）だけ HINT_OUTER_BORDER_PX を描く。
 *   それ以外の列の左辺は常に0（左側の境界は「ひとつ左のセルの右辺」が
 *   すでに描いているため、ここで重ねて描かない）。
 * - 下側の罫線: 常に通常太さ。1セルごとの格子状グリッドを維持する。
 */
function ColHints({
  colHints,
  maxLen,
  cols,
  onChange,
}: {
  colHints: HintLines;
  maxLen: number;
  cols: number;
  onChange: (lines: HintLines) => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex bg-slate-50">
      {colHints.map((line, lineIndex) => {
        const padCount = maxLen - line.length;
        const isFirst = lineIndex === 0;
        const isLast = lineIndex === cols - 1;
        const rightWidth = isLast ? HINT_OUTER_BORDER_PX : borderWeightPx(lineIndex, cols);
        const leftWidth = isFirst ? HINT_OUTER_BORDER_PX : 0;
        const baseStyle: CSSProperties = {
          width: CELL_PX,
          height: CELL_PX,
          boxSizing: 'border-box',
          borderStyle: 'solid',
          borderRightWidth: rightWidth,
          borderLeftWidth: leftWidth,
          borderBottomWidth: MINOR_BORDER_PX,
          borderColor: HINT_BORDER_COLOR,
        };
        return (
          <div key={lineIndex} className="flex flex-col" style={{ width: CELL_PX }}>
            {Array.from({ length: padCount }, (_, i) => (
              <div key={`pad-${i}`} style={baseStyle} />
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
                style={baseStyle}
                className="bg-white text-center font-mono text-xs outline-none focus:border-slate-600 sm:text-sm"
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 行ヒント（盤面の左、sticky left-0）を1行ずつ描画する。
 * - 下側の罫線: 中間の境界はすべて borderWeightPx(rowIndex, rows) が担当
 *   （5マス区切り判定）。最下段行（rowIndex === rows - 1）だけは、本来
 *   borderWeightPxが0相当を返す位置なので、ここで HINT_OUTER_BORDER_PX を
 *   明示的に上書きする（他のセルがこの境界を描くことはないため、
 *   二重描画は発生しない）。
 * - 上側の罫線: 最上段行（rowIndex === 0）だけ HINT_OUTER_BORDER_PX を描く。
 *   それ以外の行の上辺は常に0（上側の境界は「ひとつ上のセルの下辺」が
 *   すでに描いているため、ここで重ねて描かない）。
 * - 右側の罫線: 常に通常太さ。1セルごとの格子状グリッドを維持する。
 */
function RowHints({
  rowHints,
  maxLen,
  rows,
  onChange,
}: {
  rowHints: HintLines;
  maxLen: number;
  rows: number;
  onChange: (lines: HintLines) => void;
}) {
  return (
    <div className="sticky left-0 z-10 flex flex-col bg-slate-50">
      {rowHints.map((line, lineIndex) => {
        const padCount = maxLen - line.length;
        const isFirst = lineIndex === 0;
        const isLast = lineIndex === rows - 1;
        const bottomWidth = isLast ? HINT_OUTER_BORDER_PX : borderWeightPx(lineIndex, rows);
        const topWidth = isFirst ? HINT_OUTER_BORDER_PX : 0;
        const baseStyle: CSSProperties = {
          width: CELL_PX,
          height: CELL_PX,
          boxSizing: 'border-box',
          borderStyle: 'solid',
          borderBottomWidth: bottomWidth,
          borderTopWidth: topWidth,
          borderRightWidth: MINOR_BORDER_PX,
          borderColor: HINT_BORDER_COLOR,
        };
        return (
          <div key={lineIndex} className="flex" style={{ height: CELL_PX }}>
            {Array.from({ length: padCount }, (_, i) => (
              <div key={`pad-${i}`} style={baseStyle} />
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
                style={baseStyle}
                className="bg-white text-center font-mono text-xs outline-none focus:border-slate-600 sm:text-sm"
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 左上の交点ブロック（盤面の左上、sticky top-0 left-0）。
 * 行ヒントの最大桁数(rowMaxLen) × 列ヒントの最大桁数(colMaxLen) の
 * セルを実際に敷き並べ、ColHints/RowHintsと同じ罫線ルールで描画する。
 * borderWeightPx のみを使用し、ヒントグリッド最外周用の特別扱いは行わない
 * （要求どおり、交点ブロック内部のグリッドとヒント自身の外周は
 * 別物として扱う。変更なし）。
 */
function CornerGrid({ rowMaxLen, colMaxLen }: { rowMaxLen: number; colMaxLen: number }) {
  return (
    <div className="sticky top-0 left-0 z-30 bg-slate-50">
      {Array.from({ length: colMaxLen }, (_, r) => {
        const bottomWidth = borderWeightPx(r, colMaxLen);
        return (
          <div key={r} className="flex" style={{ height: CELL_PX }}>
            {Array.from({ length: rowMaxLen }, (_, c) => {
              const rightWidth = borderWeightPx(c, rowMaxLen);
              return (
                <div
                  key={c}
                  style={{
                    width: CELL_PX,
                    height: CELL_PX,
                    boxSizing: 'border-box',
                    borderStyle: 'solid',
                    borderRightWidth: rightWidth,
                    borderBottomWidth: bottomWidth,
                    borderColor: HINT_BORDER_COLOR,
                  }}
                />
              );
            })}
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
    <div className="max-h-[70vh] max-w-full overflow-auto rounded border border-slate-300 bg-white">
      <div className="inline-grid" style={{ gridTemplateColumns: 'auto 1fr' }}>
        {/* 左上交点: 行ヒント上辺・列ヒント左辺が連続するよう、1セルごとの
            グリッドとして描画する（罫線なしの空白divではない）。 */}
        <CornerGrid rowMaxLen={rowMaxLen} colMaxLen={colMaxLen} />
        <ColHints colHints={colHints} maxLen={colMaxLen} cols={cols} onChange={onColHintsChange} />
        <RowHints rowHints={rowHints} maxLen={rowMaxLen} rows={rows} onChange={onRowHintsChange} />
        {/* 盤面本体: 固定DOM。罫線太さはborderWeightPxで行・列ヒントと同一判定。
            外枠に接する辺だけ borderColor を個別指定し、それ以外の辺は
            通常色のままにする（className一括指定はしない）。 */}
        <div>
          {displayGrid.map((row, i) => {
            const bottomWidth = borderWeightPx(i, rows);
            const isTopRow = i === 0;
            const isBottomRow = i === rows - 1;
            return (
              <div key={i} className="flex">
                {row.map((cell, j) => {
                  const isLeftCol = j === 0;
                  const isRightCol = j === cols - 1;
                  const style: CSSProperties = {
                    width: CELL_PX,
                    height: CELL_PX,
                    boxSizing: 'border-box',
                    borderStyle: 'solid',
                    borderRightWidth: isRightCol
                      ? BOARD_OUTER_BORDER_PX
                      : borderWeightPx(j, cols),
                    borderBottomWidth: isBottomRow
                      ? BOARD_OUTER_BORDER_PX
                      : bottomWidth,
                    borderLeftWidth: isLeftCol ? BOARD_OUTER_BORDER_PX : 0,
                    borderTopWidth: isTopRow ? BOARD_OUTER_BORDER_PX : 0,
                    // 辺ごとに色を個別指定する。外枠に接する辺のみ外枠色、
                    // それ以外の辺は通常色。className一括指定にすると
                    // セル全体が同じ色になってしまうため、必ずstyleで分離する。
                    borderRightColor: isRightCol
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                    borderBottomColor: isBottomRow
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                    borderLeftColor: isLeftCol
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                    borderTopColor: isTopRow
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                  };
                  return <div key={j} style={style} className={cellClass(cell)} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}