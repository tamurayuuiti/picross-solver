// ============================================================================
// App.tsx
// 盤面サイズ設定 + ヒント入力（行・列） + ソルバー表示パネル を統合する
// エントリーポイント。
//
// 設計変更（ヒント主導）:
// - rowHints / colHints (HintLines) を唯一の真の状態（Single Source of Truth）
//   として保持します。
// - 盤面サイズ（rows / cols）は独立したStateを持たず、HintLinesのlengthから
//   自動的に算出されます。
// - サイズ入力UIを撤廃し、代わりに「初期サイズテンプレート」機能を追加しました。
// ============================================================================

import { useMemo, useState } from 'react';
import type { Grid, HintLines, SolvedGrid } from '@/types';
import { HintEditor } from '@/components/HintEditor';
import { SolverPanel } from '@/components/SolverPanel';
import { BoardPreview } from '@/components/BoardPreview';
import { PRESETS } from '@/presets';
import { validateHints } from '@/validation/hintValidation';
import { useErrorFocus } from '@/hooks/useErrorFocus';

const DEFAULT_ROWS = 5;
const DEFAULT_COLS = 5;

function createEmptyHintLines(length: number): HintLines {
  return Array.from({ length }, () => []);
}

export default function App() {
  const [rowHints, setRowHints] = useState<HintLines>(() => createEmptyHintLines(DEFAULT_ROWS));
  const [colHints, setColHints] = useState<HintLines>(() => createEmptyHintLines(DEFAULT_COLS));
  const [currentGrid, setCurrentGrid] = useState<Grid | SolvedGrid | null>(null);

  // 【ヒント主導設計】ヒントの行数がそのまま盤面サイズになる
  const rows = rowHints.length;
  const cols = colHints.length;

  const { focus, requestFocus } = useErrorFocus();

  const validation = useMemo(
    () => validateHints(rowHints, colHints),
    [rowHints, colHints]
  );

  const handleApplyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setRowHints(preset.rowHints.map((line) => [...line]));
    setColHints(preset.colHints.map((line) => [...line]));
  };

  const handleApplyTemplate = (size: number) => {
    setRowHints(createEmptyHintLines(size));
    setColHints(createEmptyHintLines(size));
  };

  return (
    <div className="flex min-h-screen md:h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex-none border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <h1 className="text-xl font-bold">Picross Solver</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-1 flex-none overflow-y-auto border-slate-200 bg-white p-4 md:w-80 md:border-r md:p-6">
          <div className="space-y-6">
            <section className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold text-slate-600">開発用プリセット</h2>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset.id)}
                    className="rounded bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 active:bg-indigo-200"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </section>

            {/* 盤面サイズ入力を廃止し、初期サイズテンプレートに置き換え */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-600">初期サイズテンプレート</h2>
              <p className="text-xs text-slate-500">
                空の盤面から作成を始めるための補助機能です。<br />
                適用後もテキスト入力で自由に改行・行削除が可能です。
              </p>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20].map((size) => (
                  <button
                    key={size}
                    onClick={() => handleApplyTemplate(size)}
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                  >
                    {size} × {size}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-600">ヒント入力</h2>
              <div className="flex flex-wrap gap-4">
                <HintEditor
                  title="行ヒント"
                  lines={rowHints}
                  orientation="row"
                  onChange={setRowHints}
                  cellErrors={validation.rowCellErrors}
                  lineErrors={validation.lineErrors}
                  onRequestFocus={(target) => requestFocus(target, 'validation')}
                />
                <HintEditor
                  title="列ヒント"
                  lines={colHints}
                  orientation="col"
                  onChange={setColHints}
                  cellErrors={validation.colCellErrors}
                  lineErrors={validation.lineErrors}
                  onRequestFocus={(target) => requestFocus(target, 'validation')}
                />
              </div>
            </section>

            <section className="pt-2 border-t border-slate-100">
              <BoardPreview rows={rows} cols={cols} grid={currentGrid} />
            </section>
          </div>
        </aside>

        <main className="order-2 min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <SolverPanel
            rowHints={rowHints}
            colHints={colHints}
            onRowHintsChange={setRowHints}
            onColHintsChange={setColHints}
            onGridChange={setCurrentGrid}
            validation={validation}
            focus={focus}
            onRequestFocus={requestFocus}
          />
        </main>
      </div>
    </div>
  );
}