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
import type { HintLines } from '@/types';

interface HintEditorProps {
  readonly title: string;
  readonly lines: HintLines;
  readonly orientation: 'row' | 'col';
  readonly onChange: (lines: HintLines) => void;
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

export function HintEditor({ title, lines, orientation, onChange }: HintEditorProps) {
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

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <textarea
        className="h-40 w-40 resize-none rounded border border-slate-300 p-2 font-mono text-sm"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder={orientation === 'row' ? '例: 3 1\n2\n1 1 2' : '例: 1\n2 3\n1 1 2'}
      />
    </div>
  );
}