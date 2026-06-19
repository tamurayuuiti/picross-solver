// ============================================================================
// SolverPanel.tsx
// 既存の useSolver（→ solvePicross.ts）を駆動し、結果を PicrossBoard に
// 渡して表示するパネル。新ヒントUIから得た rowHints/colHints をそのまま
// solve() に渡すだけで接続する。solvePicross.ts / useSolver.ts は無改修。
// ============================================================================

import type { HintLines } from '../types';
import { useSolver } from '@/hooks/useSolver';
import { PicrossBoard } from './PicrossBoard';

interface SolverPanelProps {
  readonly rowHints: HintLines;
  readonly colHints: HintLines;
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

export function SolverPanel({ rowHints, colHints }: SolverPanelProps) {
  const { status, grid, message, count, solve, reset } = useSolver();

  const handleSolve = () => {
    solve({ rowHints, colHints });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="ml-2 text-sm">
          状態: {statusLabel(status)}
          <span className="ml-3 text-slate-500">試行回数: {count}</span>
        </span>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
      <PicrossBoard rowHints={rowHints} colHints={colHints} grid={grid} />
    </div>
  );
}