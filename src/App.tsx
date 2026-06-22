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
//
// デザイン改修（機能・状態管理は無変更）:
// - 各セクションを ui.tsx の Card / SectionHeading / Button に統一し、
//   「プリセット」「テンプレート」「ヒント入力」「プレビュー」がそれぞれ
//   独立したカードとして並ぶ、一貫した管理画面風のレイアウトに変更。
// - プレビューはカード化しつつ、見出しを補助情報らしい控えめな
//   トーンに留め、過度に目立たせない（要件どおり「主役は盤面」）。
// ============================================================================

import { useMemo, useState } from 'react';
import type { Grid, HintLines, SolvedGrid } from '@/types';
import { HintEditor } from '@/components/HintEditor';
import { SolverPanel } from '@/components/SolverPanel';
import { BoardPreview } from '@/components/BoardPreview';
import { PRESETS } from '@/presets';
import { validateHints } from '@/validation/hintValidation';
import { useErrorFocus } from '@/hooks/useErrorFocus';
import { Button, Card, SectionHeading } from '@/components/ui';

const DEFAULT_ROWS = 5;
const DEFAULT_COLS = 5;

function createEmptyHintLines(length: number): HintLines {
  return Array.from({ length }, () => []);
}

export default function App() {
  const [rowHints, setRowHints] = useState<HintLines>(() => createEmptyHintLines(DEFAULT_ROWS));
  const [colHints, setColHints] = useState<HintLines>(() => createEmptyHintLines(DEFAULT_COLS));
  const [currentGrid, setCurrentGrid] = useState<Grid | SolvedGrid | null>(null);

  // ヒント主導設計: ヒントの行数がそのまま盤面サイズになる
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
      <header className="flex-none border-b border-slate-200 bg-white px-6 py-3.5">
        <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">
          Picross Solver
        </h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-1 flex-none overflow-y-auto bg-slate-50 p-4 md:w-80 md:p-5">
          <div className="space-y-4">
            <Card>
              <SectionHeading>開発用プリセット</SectionHeading>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    variant="subtle-accent"
                    size="sm"
                    onClick={() => handleApplyPreset(preset.id)}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
            </Card>

            {/* 盤面サイズ入力を廃止し、初期サイズテンプレートに置き換え */}
            <Card>
              <SectionHeading description="空の盤面から作成を始めるための補助機能です。適用後もテキスト入力で自由に改行・行削除が可能です。">
                初期サイズテンプレート
              </SectionHeading>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20].map((size) => (
                  <Button key={size} variant="secondary" size="sm" onClick={() => handleApplyTemplate(size)}>
                    {size} × {size}
                  </Button>
                ))}
              </div>
            </Card>

            <Card>
              <SectionHeading>ヒント入力</SectionHeading>
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
            </Card>

            <Card>
              <SectionHeading>全体プレビュー</SectionHeading>
              <BoardPreview rows={rows} cols={cols} grid={currentGrid} />
            </Card>
          </div>
        </aside>

        <main className="order-2 min-h-0 min-w-0 flex-1 overflow-auto bg-slate-50 p-4 md:p-5">
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