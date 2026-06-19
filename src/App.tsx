// ============================================================================
// App.tsx
// Picross Solver MVP のエントリーポイント。
//
// 設計方針:
// - ロジックは useSolver に委譲し、ここではヒントテキストの入力・変換・
//   グリッド表示のみを行う。
// - parseHintsBlock はヒント検証（合計値不一致等）を行わない。
//   不正な入力は solvePicross 側の挙動に委ねる（MVPの範囲外）。
// ============================================================================

import { useMemo, useState } from 'react';
import { useSolver } from '@/hooks/useSolver';
import type { CellValue, Grid, LineHint, PicrossHints, SolvedGrid } from '@/types/index';

const DEFAULT_ROW_HINTS = '2\n2';
const DEFAULT_COL_HINTS = '2\n2';

// ----------------------------------------------------------------------------
// テキスト（1行1ヒント、カンマ/空白区切り）を LineHint[] に変換
// ----------------------------------------------------------------------------
function parseHintsBlock(text: string): LineHint[] {
  const rawLines = text.split('\n');
  // textarea の末尾改行由来の空行を1つだけ除去する
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }
  return rawLines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === '') return [] as LineHint;
    return trimmed
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map((s) => Number(s));
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return '待機中';
    case 'running':
      return '解析中...';
    case 'solved':
      return '解けました';
    case 'unsolvable':
      return '解なし';
    case 'contradiction':
      return 'ヒントに矛盾';
    case 'invalid-hints':
      return 'ヒントが不正';
    default:
      return status;
  }
}

function cellClass(value: CellValue): string {
  if (value === 1) return 'bg-slate-900';
  if (value === 0) return 'bg-white';
  return 'bg-slate-200';
}

export default function App() {
  const [rowHintsText, setRowHintsText] = useState(DEFAULT_ROW_HINTS);
  const [colHintsText, setColHintsText] = useState(DEFAULT_COL_HINTS);

  const { status, grid, message, count, solve, reset } = useSolver();

  const hints: PicrossHints = useMemo(
    () => ({
      rowHints: parseHintsBlock(rowHintsText),
      colHints: parseHintsBlock(colHintsText),
    }),
    [rowHintsText, colHintsText]
  );

  const handleSolve = () => {
    solve(hints);
  };

  const displayGrid: Grid | SolvedGrid | null = grid;

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-bold">Picross Solver (MVP)</h1>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">行ヒント（1行1行分）</label>
            <textarea
              className="h-32 w-full rounded border border-slate-300 p-2 font-mono text-sm"
              value={rowHintsText}
              onChange={(e) => setRowHintsText(e.target.value)}
              placeholder="例: 2,1"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">列ヒント（1行1列分）</label>
            <textarea
              className="h-32 w-full rounded border border-slate-300 p-2 font-mono text-sm"
              value={colHintsText}
              onChange={(e) => setColHintsText(e.target.value)}
              placeholder="例: 1,1"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            onClick={handleSolve}
          >
            解く
          </button>
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            onClick={reset}
          >
            リセット
          </button>
        </div>

        <div className="text-sm">
          <span className="font-medium">状態: </span>
          {statusLabel(status)}
          <span className="ml-4 text-slate-500">試行回数: {count}</span>
          {message && <p className="mt-1 text-red-600">{message}</p>}
        </div>

        {displayGrid && (
          <div className="inline-block border border-slate-400">
            {displayGrid.map((row, i) => (
              <div key={i} className="flex">
                {row.map((cell, j) => (
                  <div
                    key={j}
                    className={`h-8 w-8 border border-slate-300 ${cellClass(cell as CellValue)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}