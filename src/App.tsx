// ============================================================================
// App.tsx
// 盤面サイズ設定 + ヒント入力（行・列） + ソルバー表示パネル を統合する
// エントリーポイント。
//
// レイアウト方針:
// - 「ユーザーの操作フローと情報のグラデーション」を最優先する。
// - 狭い画面（モバイル等）では、設定・入力系（Aside）を上、メイン盤面（Main）を下
//   に配置する縦積み構成（orderで制御）。さらに大規模盤面でも潰れないよう
//   min-h-screen で全体を自然にスクロールさせる。
// - PC幅（md 以上）では、左サイドバー（操作系一式）+ 右メインエリア（盤面のみ）
//   の2カラム構成（md:h-screen で1画面に収める）。
//
// 全体プレビュー機能（BoardPreview, Canvas描画）の配置最適化:
// - 配置位置: サイドバー（Aside）の最下部（「ヒント入力」の直後、「メイン盤面」の直前）。
// - 理由は以下の通り：
//     1. 【入力エリアの集約】プリセット・サイズ・ヒントというユーザーが操作する
//        要素を上部にまとめることで、入力中の思考や視線を分断させない。
//     2. 【完璧なデータ導線】「入力一式」➔「縮小全体像（プレビュー）」➔「実物（メイン）」
//        というマクロからミクロへの自然な視線誘導（UX）が完成する。
//     3. 【モバイル環境の保護】スマホでのヒント入力時、キーボードが立ち上がっても
//        プレビューが入力フォームを押し下げて邪魔をすることがない。
//
// 単一の状態管理:
// - rowHints / colHints (HintLines) を唯一の真の状態として保持する。
// ============================================================================

import { useState } from 'react';
import type { Grid, HintLines, SolvedGrid } from '@/types';
import { HintEditor } from '@/components/HintEditor';
import { SolverPanel } from '@/components/SolverPanel';
import { BoardPreview } from '@/components/BoardPreview';
import { PRESETS } from '@/presets';

const MIN_SIZE = 1;
const MAX_SIZE = 100;
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
  // SolverPanel内部(useSolver)が保持するgridの「表示用ミラー」。
  const [currentGrid, setCurrentGrid] = useState<Grid | SolvedGrid | null>(null);

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

  const handleApplyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setRows(preset.rows);
    setCols(preset.cols);
    setRowHints(preset.rowHints.map((line) => [...line]));
    setColHints(preset.colHints.map((line) => [...line]));
  };

  return (
    <div className="flex min-h-screen md:h-screen flex-col bg-slate-50 text-slate-900">
      {/* ヘッダー: タイトルのみ */}
      <header className="flex-none border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <h1 className="text-xl font-bold">Picross Solver</h1>
      </header>

      {/* メインレイアウトコンテナ */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* サイドバー（操作系一式）
            モバイル: order-1 (上側) / PC: md:order-1 (左側固定幅) */}
        <aside className="order-1 flex-none overflow-y-auto border-slate-200 bg-white p-4 md:w-80 md:border-r md:p-6">
          <div className="space-y-6">
            {/* 1. 開発・テスト用プリセットUI */}
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

            {/* 2. グリッドサイズ設定 */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-600">盤面サイズ</h2>
              <div className="flex flex-wrap gap-4">
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
              </div>
            </section>

            {/* 3. ヒント入力 */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-600">ヒント入力</h2>
              <div className="flex flex-wrap gap-4">
                <HintEditor
                  title="行ヒント"
                  lines={rowHints}
                  orientation="row"
                  onChange={setRowHints}
                />
                <HintEditor
                  title="列ヒント"
                  lines={colHints}
                  orientation="col"
                  onChange={setColHints}
                />
              </div>
            </section>

            {/* 【最適化位置】4. 盤面全体プレビュー
                操作・入力の直後であり、メイン盤面の直前にあたる最高のポジション */}
            <section className="pt-2 border-t border-slate-100">
              <BoardPreview rows={rows} cols={cols} grid={currentGrid} />
            </section>
          </div>
        </aside>

        {/* メインエリア（盤面）
            モバイル: order-2 (下側) / PC: md:order-2 (右側広がるエリア) */}
        <main className="order-2 min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <SolverPanel
            rowHints={rowHints}
            colHints={colHints}
            onRowHintsChange={setRowHints}
            onColHintsChange={setColHints}
            onGridChange={setCurrentGrid}
          />
        </main>
      </div>
    </div>
  );
}