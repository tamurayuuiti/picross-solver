// ============================================================================
// BoardPreview.tsx
// 解答盤面（solverが保持する現在の盤面状態）を縮小表示する補助ビュー。
//
// 位置づけ:
// - 既存の PicrossBoard（メイン盤面）を置き換えるものではなく、サイドバー内に
//   常駐する補助プレビュー。状態は一切持たず、親から渡された grid/rows/cols を
//   そのまま描画するだけの純粋な表示コンポーネント。
// - solverロジック・state構造は無改修。SolverPanel が保持する grid をそのまま
//   渡してもらうだけで完結する。
//
// 描画方式の選定理由（Canvas を採用）:
// - 大規模盤面（100×100以上）では、DOM要素方式だと1万個以上のdiv/inputが
//   メイン盤面と合わせて二重に生成され、レイアウト計算・スタイル計算の
//   コストが線形以上に増える。Canvasは描画コマンドの発行コストのみで
//   済み、セル数が増えてもDOMノード数は1個（<canvas>本体）のまま。
// - サイドバー内の小さな表示枠という用途上、入力UI（編集可能セル等）は
//   不要で、純粋なラスタ描画で十分。Canvasの単純さが要件に合致する。
// - SVGも検討したが、セル数が多いとDOM相当のノード数（<rect>の数）に
//   なるため、ここでは選ばない。
//
// 自動セルサイズ調整:
// - プレビュー枠の最大幅/高さ（PREVIEW_MAX_PX）を固定し、rows/colsの大きい方
//   に合わせてセルサイズ（px/cell）を逆算する。最小0.5px相当まで許容し、
//   100×100以上でも枠内に収まるようにする。
//
// 将来拡張のためのフック:
// - onCellClick: プレビュー上のクリック位置を (row, col) として親に伝える
//   コールバック。今回は未使用（呼び出し側が渡さなければ何もしない）だが、
//   将来「クリックで位置ジャンプ」を実装する際、ここに座標変換ロジックが
//   既に用意されているため、親側の対応だけで拡張できる。
// - viewportRect: 現在メイン盤面でスクロール表示されている範囲を
//   { rowStart, rowEnd, colStart, colEnd } で受け取り、ハイライト枠を
//   描画するための差分実装ポイント。今回は未使用（undefinedなら何も描かない）。
// ============================================================================

import { useEffect, useRef } from 'react';
import type { CellValue, Grid, SolvedGrid } from '../types';

/** プレビュー全体の最大表示サイズ（px）。これを超えないようにセルサイズを逆算する。 */
const PREVIEW_MAX_PX = 240;

/** セルサイズの下限・上限（px）。極端なサイズになりすぎないためのガード。 */
const MIN_CELL_PX = 1;
const MAX_CELL_PX = 16;

const FILLED_COLOR = '#0f172a'; // slate-900相当
const EMPTY_COLOR = '#ffffff';
const UNKNOWN_COLOR = '#e2e8f0'; // slate-200相当
const BORDER_COLOR = '#94a3b8'; // slate-400相当

export interface PreviewViewportRect {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly colStart: number;
  readonly colEnd: number;
}

interface BoardPreviewProps {
  readonly rows: number;
  readonly cols: number;
  /** 現在の盤面状態（解答途中/完了/未解答いずれも反映する）。未指定時は空盤面として描画。 */
  readonly grid?: Grid | SolvedGrid | null;
  /** 将来拡張: プレビュー上のクリックで (row, col) を親に伝える。 */
  readonly onCellClick?: (row: number, col: number) => void;
  /** 将来拡張: メイン盤面の現在表示範囲をハイライトする。 */
  readonly viewportRect?: PreviewViewportRect;
}

function cellColor(value: CellValue): string {
  if (value === 1) return FILLED_COLOR;
  if (value === 0) return EMPTY_COLOR;
  return UNKNOWN_COLOR;
}

/** rows/cols から、PREVIEW_MAX_PX に収まる1セルあたりのpxを計算する。 */
function computeCellPx(rows: number, cols: number): number {
  const maxDim = Math.max(rows, cols, 1);
  const raw = PREVIEW_MAX_PX / maxDim;
  return Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, raw));
}

export function BoardPreview({ rows, cols, grid, onCellClick, viewportRect }: BoardPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cellPx = computeCellPx(rows, cols);
  const widthCss = Math.max(1, cols * cellPx);
  const heightCss = Math.max(1, rows * cellPx);

  const displayGrid: readonly (readonly CellValue[])[] =
    grid && grid.length === rows && (grid[0]?.length ?? 0) === cols
      ? (grid as readonly (readonly CellValue[])[])
      : Array.from({ length: rows }, () => Array.from({ length: cols }, () => -1 as CellValue));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 高DPI環境でも鮮明に描画するため、devicePixelRatio分だけ実ピクセルを増やす。
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(widthCss * dpr));
    const pixelHeight = Math.max(1, Math.round(heightCss * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, widthCss, heightCss);

    // セル描画。セルサイズが小さい場合は枠線を描かず塗り分けのみにする
    // （極小セルで枠線が支配的になりセル色が見えなくなるのを防ぐ）。
    const drawBorder = cellPx >= 4;
    for (let i = 0; i < rows; i++) {
      const row = displayGrid[i];
      for (let j = 0; j < cols; j++) {
        const value = row?.[j] ?? (-1 as CellValue);
        ctx.fillStyle = cellColor(value);
        ctx.fillRect(j * cellPx, i * cellPx, cellPx, cellPx);
      }
    }

    if (drawBorder) {
      ctx.strokeStyle = BORDER_COLOR;
      ctx.lineWidth = 1;
      for (let i = 0; i <= rows; i++) {
        const y = i * cellPx;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(widthCss, y);
        ctx.stroke();
      }
      for (let j = 0; j <= cols; j++) {
        const x = j * cellPx;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, heightCss);
        ctx.stroke();
      }
    }

    // 将来拡張: メイン盤面のビューポート範囲が渡されていればハイライト枠を描く。
    if (viewportRect) {
      const { rowStart, rowEnd, colStart, colEnd } = viewportRect;
      ctx.strokeStyle = '#2563eb'; // blue-600相当
      ctx.lineWidth = 2;
      ctx.strokeRect(
        colStart * cellPx,
        rowStart * cellPx,
        (colEnd - colStart) * cellPx,
        (rowEnd - rowStart) * cellPx
      );
    }

    ctx.restore();
  }, [displayGrid, rows, cols, cellPx, widthCss, heightCss, viewportRect]);

  // 将来拡張: クリック位置から (row, col) を逆算して親に伝える。
  const handleClick = onCellClick
    ? (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const col = Math.min(cols - 1, Math.max(0, Math.floor(x / cellPx)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor(y / cellPx)));
        onCellClick(row, col);
      }
    : undefined;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-600">全体プレビュー</h2>
      <div className="inline-block rounded border border-slate-300 bg-white p-1">
        <canvas
          ref={canvasRef}
          style={{ width: widthCss, height: heightCss, display: 'block' }}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}