// ============================================================================
// HintEditor.tsx
// 行ヒント/列ヒントの「テキスト入力」のみを担うコンポーネント。
//
// 変更点（HintGrid廃止に伴う責務整理）:
// - これまでテキスト入力欄の横に HintGrid（読み取り専用プレビュー）を
//   表示していたが、「ヒントのグリッド表示・編集は盤面接続ヒント
//   （PicrossBoard）のみが担う」という設計方針に従い、このプレビューを
//   完全に削除した。
// - HintGrid への依存（import）も完全に排除。HintEditor はテキスト入力
//   とそのパース・シリアライズのみに専念する、純粋なテキスト編集UIとなった。
//
// 単一の状態管理方針（変更なし）:
// - 真の状態（lines: HintLines）は親（App.tsx）が保持し、ここでは props
//   としてのみ受け取る。テキスト入力欄の文字列は lines の「表示用バッファ」
//   であり、別Stateとして扱わない。
// - テキスト側の編集は parseHintText で lines に変換し、親へ伝える。
// - 盤面側（PicrossBoard）でのグリッド編集により lines が変化した場合も、
//   親から渡された lines が自分のテキスト由来の lines と一致しないときは
//   テキスト表示をその lines に再同期する。これにより、テキスト⇔盤面の
//   双方向同期が成立する（状態は App.tsx の単一ソースのまま）。
// ============================================================================

import { useEffect, useState } from 'react';
import type { HintCellError, HintLineError, HintLines } from '@/types';
import { findLineError, validateRawHintText } from '@/validation/hintValidation';

interface HintEditorProps {
  readonly title: string;
  readonly lines: HintLines;
  readonly orientation: 'row' | 'col';
  readonly onChange: (lines: HintLines) => void;
  /** このヒント（行ヒント or 列ヒント）に属するセル単位エラー。App.tsxのvalidateHintsから配布される。 */
  readonly cellErrors?: readonly HintCellError[];
  /** 行/列単位エラー（総和オーバー等）。row/col両方を含むため、自分のorientationに合致するものだけを使う。 */
  readonly lineErrors?: readonly HintLineError[];
}

function parseHintText(text: string): HintLines {
  return text.split('\n').map((rawLine) =>
    rawLine
      .trim()
      .split(/[\s,]+/)
      .filter((token) => token !== '')
      .map((token) => Number.parseInt(token, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
}

function serializeHintLines(lines: HintLines): string {
  return lines.map((line) => line.join(' ')).join('\n');
}

function linesEqual(a: HintLines, b: HintLines): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, i) => {
    const other = b[i];
    if (!other || line.length !== other.length) return false;
    return line.every((v, j) => v === other[j]);
  });
}

function cellErrorLabel(kind: HintCellError['kind']): string {
  switch (kind) {
    case 'not-a-number':
      return '数字以外の文字';
    case 'not-integer':
      return '小数は使えません';
    case 'non-positive':
      return '0以下の値は使えません';
    default:
      return '不正な値';
  }
}

/** orientationに対応するラインラベル（"行"/"列"）+ 1-based の番号。 */
function lineLabel(orientation: 'row' | 'col', lineIndex: number): string {
  return orientation === 'row' ? `行${lineIndex + 1}` : `列${lineIndex + 1}`;
}

export function HintEditor({
  title,
  lines,
  orientation,
  onChange,
  cellErrors = [],
  lineErrors = [],
}: HintEditorProps) {
  const [text, setText] = useState(() => serializeHintLines(lines));

  useEffect(() => {
    const selfParsed = parseHintText(text);
    if (!linesEqual(selfParsed, lines)) {
      setText(serializeHintLines(lines));
    }
    // text は依存配列から意図的に外す（自分自身の入力による再フォーマットを避ける）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const handleTextChange = (value: string) => {
    setText(value);
    onChange(parseHintText(value));
  };

  // ----------------------------------------------------------------------------
  // エラー集約: 「数字以外・小数・負数」（生テキストの再検証、parseHintTextが
  // 黙って捨てたトークンを検出するため text を直接走査）と、
  // 「ヒント総和オーバー」（props経由、行/列単位）の2系統をまとめ、
  // 行番号ごとに表示する。1つのtextareaで複数行を編集する構造上、
  // セル単位のピンポイント強調はできないため、「どの行に何の問題があるか」
  // を一覧として示す方式を取る（過剰な赤塗りを避けつつ、原因の特定を助ける）。
  // ----------------------------------------------------------------------------
  const rawTextErrors = validateRawHintText(text);
  const allCellErrors = [...cellErrors, ...rawTextErrors];

  const errorLineIndexes = new Set<number>();
  allCellErrors.forEach((e) => errorLineIndexes.add(e.lineIndex));
  lineErrors
    .filter((e) => e.type === orientation)
    .forEach((e) => errorLineIndexes.add(e.index));

  const hasError = errorLineIndexes.size > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {hasError && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
            {errorLineIndexes.size}件のエラー
          </span>
        )}
      </div>
      <textarea
        className={`h-40 w-40 resize-none rounded border p-2 font-mono text-sm outline-none ${
          hasError
            ? 'border-red-400 bg-red-50 focus:border-red-500'
            : 'border-slate-300 focus:border-slate-600'
        }`}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder={orientation === 'row' ? '例: 3 1\n2\n1 1 2' : '例: 1\n2 3\n1 1 2'}
      />
      {hasError && (
        <ul className="space-y-1 text-xs text-red-700">
          {Array.from(errorLineIndexes)
            .sort((a, b) => a - b)
            .map((lineIndex) => {
              const cellMessages = allCellErrors
                .filter((e) => e.lineIndex === lineIndex)
                .map((e) => cellErrorLabel(e.kind));
              const lineErr = findLineError(lineErrors, orientation, lineIndex);
              const messages = [...new Set(cellMessages)];
              if (lineErr) messages.push(lineErr.message.replace(/^[^:]+:\s*/, ''));
              return (
                <li key={lineIndex} className="flex items-start gap-1.5">
                  <span className="flex-none font-medium text-red-600">
                    {lineLabel(orientation, lineIndex)}:
                  </span>
                  <span>{messages.join(' / ')}</span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}