// ============================================================================
// HintEditor.tsx
// 行ヒント/列ヒントの「テキストボックス入力」を担うコンポーネント。
//
// 役割の再定義（ヒントセル側がHintLineUnitへ再構築されたことに伴う整理）:
// - テキストボックスの主用途は「大量入力・コピペ・一括編集」。
//   1行1行をセル側で編集する手間をかけず、複数行をまとめて書き換えたい
//   場面（プリセット貼り付け、大規模盤面の一括入力等）に最適化する。
// - 補助用途として「行番号表示」と「エラー行へのスクロールジャンプ」を
//   新たに追加した。これにより、テキストボックスを見ているだけでも
//   「何行目に何の問題があるか」が一目で分かり、エラー一覧からワンクリックで
//   該当行へカーソルを移動できる。
//
// 行番号表示の実装方針:
// - textareaに行番号オーバーレイを重ねる一般的な手法（行番号用の<div>を
//   textareaの左に固定し、スクロールを同期させる）を採用する。
// - 行番号列とtextareaは同一のフォント・行高（leading）・パディングを
//   共有しないと行がズレるため、両者で共通のCSS定数を使う。
//
// エラージャンプの実装方針:
// - 「エラーがある行番号」をクリックすると、その行にカーソルを移動し
//   textareaをフォーカスする（setSelectionRange）。これは「テキスト側で
//   該当行を把握する」という補助用途を実現する最小限の実装であり、
//   将来的に「盤面側のヒントセルへもジャンプする」という拡張が必要に
//   なった場合は、onJumpToLine コールバックをApp.tsx側に伝播させ、
//   PicrossBoard の focusTarget と連動させる形で拡張できる
//   （実際に下記 onRequestFocus で実装している）。
//
// 単一の状態管理方針（変更なし）:
// - 真の状態（lines: HintLines）は親（App.tsx）が保持し、ここでは props
//   としてのみ受け取る。テキスト入力欄の文字列は lines の「表示用バッファ」
//   であり、別Stateとして扱わない。
// - テキスト側の編集は parseHintText で lines に変換し、親へ伝える。
// - 盤面側（PicrossBoard の HintLineUnit）でのグリッド編集により lines が
//   変化した場合も、親から渡された lines が自分のテキスト由来の lines と
//   一致しないときはテキスト表示をその lines に再同期する。これにより、
//   テキスト⇔盤面の双方向同期が成立する（状態は App.tsx の単一ソースのまま）。
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { HintCellError, HintLineError, HintLineFocusTarget, HintLines } from '@/types';
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
  /**
   * エラー行番号がクリックされたときに呼ばれる。App.tsx 側はこれを使って
   * PicrossBoard の focusTarget を更新し、盤面側ヒントセルへも同時に
   * スクロールジャンプさせる（テキスト側・盤面側の両方が連動する）。
   */
  readonly onRequestFocus?: (target: HintLineFocusTarget) => void;
}

/** 行番号オーバーレイとtextareaで共有する行高（px）。フォントサイズと合わせて固定する。 */
const LINE_HEIGHT_PX = 20;

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
  onRequestFocus,
}: HintEditorProps) {
  const [text, setText] = useState(() => serializeHintLines(lines));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

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

  // textareaのスクロールに行番号オーバーレイを追従させる（縦スクロール同期）。
  const handleScrollSync = () => {
    if (lineNumberRef.current && textareaRef.current) {
      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
    }
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
  const lineCount = Math.max(1, text.split('\n').length);

  /**
   * 指定した行番号(0-based)へジャンプする。
   * - テキスト側: その行の先頭〜末尾を selectionRange で選択し、textareaへ
   *   フォーカスする（「この行を見ている」ことが視覚的に伝わる）。
   * - 盤面側: onRequestFocus を呼び、PicrossBoard の focusTarget を更新して
   *   該当 HintLineUnit までスクロールジャンプ＋一時ハイライトさせる。
   */
  const jumpToLine = (lineIndex: number) => {
    const textLines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < lineIndex && i < textLines.length; i++) {
      offset += textLines[i].length + 1; // +1 は改行文字
    }
    const targetLine = textLines[lineIndex] ?? '';
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(offset, offset + targetLine.length);
    }
    onRequestFocus?.({ type: orientation, index: lineIndex });
  };

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

      {/* テキストボックス本体 + 行番号オーバーレイ。
          行番号列はテキストと同じ行高(LINE_HEIGHT_PX)・フォントで描画し、
          textareaのスクロールに追従させることで行のズレを防ぐ。
          エラー行の番号は赤背景にし、クリックでその行へジャンプできる。 */}
      <div className="flex">
        <div
          ref={lineNumberRef}
          className="h-40 w-7 flex-none select-none overflow-hidden rounded-l border border-r-0 border-slate-300 bg-slate-50 py-2 text-right font-mono text-[11px] text-slate-400"
        >
          {Array.from({ length: lineCount }, (_, i) => {
            const isErrorLine = errorLineIndexes.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => jumpToLine(i)}
                title={isErrorLine ? `${lineLabel(orientation, i)}のエラー箇所へ移動` : undefined}
                style={{ height: LINE_HEIGHT_PX, lineHeight: `${LINE_HEIGHT_PX}px` }}
                className={`block w-full px-1 hover:bg-slate-200 ${
                  isErrorLine ? 'bg-red-100 font-bold text-red-600' : ''
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <textarea
          ref={textareaRef}
          className={`h-40 w-32 resize-none rounded-r border p-2 font-mono text-sm outline-none ${
            hasError
              ? 'border-red-400 bg-red-50 focus:border-red-500'
              : 'border-slate-300 focus:border-slate-600'
          }`}
          style={{ lineHeight: `${LINE_HEIGHT_PX}px` }}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onScroll={handleScrollSync}
          placeholder={orientation === 'row' ? '例: 3 1\n2\n1 1 2' : '例: 1\n2 3\n1 1 2'}
        />
      </div>

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
                  <button
                    type="button"
                    onClick={() => jumpToLine(lineIndex)}
                    className="flex-none font-medium text-red-600 underline-offset-2 hover:underline"
                  >
                    {lineLabel(orientation, lineIndex)}:
                  </button>
                  <span>{messages.join(' / ')}</span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}