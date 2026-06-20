// ============================================================================
// App.tsx
// 盤面サイズ設定 + ヒント入力（行・列） + ソルバー表示パネル を統合する
// エントリーポイント。
//
// レイアウト変更（過去の対応・変更なし）:
// - 「盤面が主役」という前提のもと、PC幅では左サイドバー（操作系一式）+
//   右メインエリア（盤面のみ）の2カラム構成。
// - サイドバー内は「プリセット/サイズ設定 → ヒント入力 → Solve操作」という
//   作業順序に従って縦に並べる。SolverPanel が持つ「解く/リセットボタン +
//   ステータス表示 + PicrossBoard」のうち、ボタン・ステータス部分は
//   サイドバー側に、PicrossBoard部分はメインエリア側に視覚的に配置されるよう
//   親側のレイアウト(flex)で制御する。SolverPanel/PicrossBoard 自体の内部
//   構造・ロジックは無改修。
// - 狭い画面（モバイル等）では縦積みに切り替え、盤面をヒント入力よりも
//   前面（上）に出し、結果確認を優先する。
//
// 今回の変更点（全体プレビュー機能の追加）:
// - 大規模盤面（50×50〜100×100以上）でも盤面全体を一目で把握できるよう、
//   縦スクロールが不要な縮小プレビュー（BoardPreview, Canvas描画）を
//   サイドバーに追加した。
// - 配置位置: 「プリセット選択」の直後、「盤面サイズ設定」「ヒント入力」の
//   前。理由は以下の通り：
//     - プリセット読み込み直後に現在の盤面状態を確認できる
//     - サイズ変更・ヒント編集の結果をスクロールせず確認しながら作業できる
//     - メイン盤面（右側、PicrossBoard）の表示領域は一切圧迫しない
//   既存方針書にある「実際の配置位置は固定しない、レイアウト全体を見て
//   自然な場所を判断する」という指示に従い、操作の起点となる場所
//   （プリセット直後）に置くのが最も自然と判断した。
// - データソース: SolverPanel が内部で保持する useSolver の grid を、
//   新設の onGridChange コールバックで App.tsx 側に伝播してもらい、
//   currentGrid という新しい state として保持する。これは「新しい
//   真の状態」ではなく、SolverPanel 内部に既に存在する値を表示目的で
//   ミラーしているだけであり、rowHints/colHints という既存の単一状態
//   管理方針は変更していない。
// - solverロジック（solvePicross.ts/useSolver.ts）は無改修。
//
// 単一の状態管理（rowHints/colHints部分は変更なし）:
// - rowHints / colHints (HintLines) を唯一の真の状態として保持する。
// - サイズ変更時は resizeHintLines で既存ヒントを保持したまま配列を伸縮する。
// - テキスト入力（HintEditor）と盤面接続ヒント表示（SolverPanel→PicrossBoard）
//   は、ともに setRowHints / setColHints を呼ぶだけであり、別個のStateは
//   一切持たない（禁止事項どおり）。
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
  // 全体プレビュー（BoardPreview）にのみ使用し、ソルバーの動作には影響しない。
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
    // プリセットの読み取り専用配列を直接セットすると、後でUIから編集した際に
    // 参照エラーや意図せぬミューテーションが起きるため、コピーを生成する
    setRowHints(preset.rowHints.map((line) => [...line]));
    setColHints(preset.colHints.map((line) => [...line]));
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      {/* ヘッダー: タイトルのみ。常に画面最上部に固定的に存在する帯。 */}
      <header className="flex-none border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <h1 className="text-xl font-bold">Picross Solver</h1>
      </header>

      {/* メインレイアウト: モバイルは縦積み（盤面を先頭に表示）、
          md以上は「左サイドバー（操作系） + 右メインエリア（盤面）」の
          2カラム構成に切り替える。 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 盤面エリア（モバイルでは先頭=上、md以上では右側に来るよう order を反転） */}
        <main className="order-1 min-h-0 min-w-0 flex-1 overflow-auto p-4 md:order-2 md:p-6">
          <SolverPanel
            rowHints={rowHints}
            colHints={colHints}
            onRowHintsChange={setRowHints}
            onColHintsChange={setColHints}
            onGridChange={setCurrentGrid}
          />
        </main>

        {/* サイドバー（操作系一式）: モバイルでは盤面の下、md以上では左側固定幅。
            縦方向は内部でスクロール可能にし、画面高を超えても操作系が
            破綻しないようにする。 */}
        <aside className="order-2 flex-none overflow-y-auto border-slate-200 bg-white p-4 md:order-1 md:w-80 md:border-r md:p-6">
          <div className="space-y-6">
            {/* 開発・テスト用プリセットUI */}
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

            {/* 盤面全体プレビュー: 大規模盤面でもスクロール不要で全体像を
                把握できる補助ビュー。主役はあくまで右側のメイン盤面。 */}
            <section>
              <BoardPreview rows={rows} cols={cols} grid={currentGrid} />
            </section>

            {/* グリッドサイズ設定 */}
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

            {/* 行ヒント・列ヒントのテキスト入力。
                盤面側でも直接編集できるため、ここは初期投入・一括編集用の
                補助的な入力手段として、サイドバー内に小さくまとめる。 */}
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
          </div>
        </aside>
      </div>
    </div>
  );
}