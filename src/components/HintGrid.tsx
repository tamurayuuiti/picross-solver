// ============================================================================
// HintGrid.tsx
// ヒント数値をグリッド状に表示する。行ヒント/列ヒントの「編集モード」と
// 盤面横に表示する「読み取り専用モード」の両方で使う共通コンポーネント。
//
// 設計方針:
// - editable=true でも、追加できるのは「既存セルの値の変更」のみ。
//   ヒント数の増減（配列の長さ変更）はテキスト入力側の責務とする。
// - パディング（空白）セルは常に非編集・非表示値。
// ============================================================================

import type { HintLines } from '../types';

const CELL_SIZE = 'w-7 h-7 text-xs sm:w-8 sm:h-8 sm:text-sm';

interface HintGridProps {
  readonly lines: HintLines;
  /** 'row': ラインを横一列・右詰め（盤面左の行ヒント用）。 */
  /** 'col': ラインを縦一列・下詰め（盤面上の列ヒント用）。 */
  readonly orientation: 'row' | 'col';
  readonly editable?: boolean;
  readonly onChange?: (lines: HintLines) => void;
}

export function HintGrid({ lines, orientation, editable = false, onChange }: HintGridProps) {
  const maxLen = Math.max(1, ...lines.map((line) => line.length));

  const handleEdit = (lineIndex: number, posInLine: number, rawValue: string) => {
    if (!onChange) return;
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const next = lines.map((line, li) =>
      li === lineIndex ? line.map((v, pi) => (pi === posInLine ? parsed : v)) : line
    );
    onChange(next);
  };

  const renderCell = (
    value: number | null,
    lineIndex: number,
    posInLine: number,
    key: string
  ) => {
    if (value === null) {
      return <div key={key} className={`${CELL_SIZE} border border-transparent`} />;
    }
    if (editable) {
      return (
        <input
          key={key}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => handleEdit(lineIndex, posInLine, e.target.value)}
          className={`${CELL_SIZE} border border-slate-300 bg-white text-center font-mono outline-none focus:border-slate-600`}
        />
      );
    }
    return (
      <div
        key={key}
        className={`${CELL_SIZE} flex items-center justify-center border border-slate-300 bg-slate-100 font-mono`}
      >
        {value}
      </div>
    );
  };

  if (orientation === 'row') {
    return (
      <div className="flex flex-col">
        {lines.map((line, lineIndex) => {
          const padCount = maxLen - line.length;
          return (
            <div key={lineIndex} className="flex">
              {Array.from({ length: padCount }, (_, i) =>
                renderCell(null, lineIndex, -1, `${lineIndex}-pad-${i}`)
              )}
              {line.map((value, posInLine) =>
                renderCell(value, lineIndex, posInLine, `${lineIndex}-${posInLine}`)
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // orientation === 'col'
  return (
    <div className="flex">
      {lines.map((line, lineIndex) => {
        const padCount = maxLen - line.length;
        return (
          <div key={lineIndex} className="flex flex-col">
            {Array.from({ length: padCount }, (_, i) =>
              renderCell(null, lineIndex, -1, `${lineIndex}-pad-${i}`)
            )}
            {line.map((value, posInLine) =>
              renderCell(value, lineIndex, posInLine, `${lineIndex}-${posInLine}`)
            )}
          </div>
        );
      })}
    </div>
  );
}