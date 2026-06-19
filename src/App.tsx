// ============================================================================
// App.tsx
// 盤面サイズ設定 + ヒント入力（行・列） + ソルバー表示パネル を統合する
// エントリーポイント。
//
// 単一の状態管理:
// - rowHints / colHints (HintLines) を唯一の真の状態として保持する。
// - サイズ変更時は resizeHintLines で既存ヒントを保持したまま配列を伸縮する。
// - テキスト入力（HintEditor）と盤面接続ヒント表示（SolverPanel→PicrossBoard）
//   は、ともに setRowHints / setColHints を呼ぶだけであり、別個のStateは
//   一切持たない（禁止事項どおり）。
// ============================================================================

import { useState } from 'react';
import type { HintLines } from './types';
import { HintEditor } from './components/HintEditor';
import { SolverPanel } from './components/SolverPanel';

const MIN_SIZE = 1;
const MAX_SIZE = 30;
const DEFAULT_ROWS = 5;
const DEFAULT_COLS = 5;

function createEmptyHintLines(length: number): HintLines {
  return Array.from({ length }, () => []);
}

function resizeHintLines(lines: HintLines, newLength: number): HintLines {
  const next = lines.slice(0, newLength);
  while (next.length < newLength) {
    next.push([]);
  }
  return next;
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)));
}

export default function App() {
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [rowHints, setRowHints] = useState<HintLines>(() => createEmptyHintLines(DEFAULT_ROWS));
  const [colHints, setColHints] = useState<HintLines>(() => createEmptyHintLines(DEFAULT_COLS));

  const handleRowsChange = (value: number) => {
    const next = clampSize(value);
    setRows(next);
    setRowHints((prev) => resizeHintLines(prev, next));
  };

  const handleColsChange = (value: number) => {
    const next = clampSize(value);
    setCols(next);
    setColHints((prev) => resizeHintLines(prev, next));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="text-xl font-bold">Picross Solver</h1>

        <section className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            行数
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={rows}
              onChange={(e) => handleRowsChange(Number(e.target.value))}
              className="w-20 rounded border border-slate-300 p-1"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            列数
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={cols}
              onChange={(e) => handleColsChange(Number(e.target.value))}
              className="w-20 rounded border border-slate-300 p-1"
            />
          </label>
        </section>

        <section className="flex flex-wrap gap-8">
          <HintEditor title="行ヒント" lines={rowHints} orientation="row" onChange={setRowHints} />
          <HintEditor title="列ヒント" lines={colHints} orientation="col" onChange={setColHints} />
        </section>

        <section>
          <SolverPanel
            rowHints={rowHints}
            colHints={colHints}
            onRowHintsChange={setRowHints}
            onColHintsChange={setColHints}
          />
        </section>
      </div>
    </div>
  );
}