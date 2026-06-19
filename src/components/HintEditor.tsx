// ============================================================================
// HintEditor.tsx
// 行ヒント/列ヒントの「テキスト入力」と「グリッド表示・編集」を
// 1つにまとめたコンポーネント。
//
// 単一の状態管理方針:
// - 真の状態（lines: HintLines）は親（App.tsx）が保持し、ここでは props
//   としてのみ受け取る。テキスト入力欄の文字列は lines の「表示用バッファ」
//   であり、別Stateとして扱わない。
// - グリッド側の編集は HintGrid から直接 onChange(lines) で親に伝える。
// - テキスト側の編集は parseHintText で lines に変換し、同様に親へ伝える。
// - 親から渡された lines が「自分がテキストから生成したものと一致しない」
//   場合（=盤面サイズ変更やグリッド編集など外部要因）にのみ、テキスト
//   表示をその lines に再同期する。これにより自分の入力中の再フォーマット
//   による入力体験の劣化を防ぐ。
// ============================================================================

import { useEffect, useState } from 'react';
import type { HintLines } from '../types';
import { HintGrid } from './HintGrid';

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
      <div className="flex gap-4">
        <textarea
          className="h-40 w-40 resize-none rounded border border-slate-300 p-2 font-mono text-sm"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={orientation === 'row' ? '例: 3 1\n2\n1 1 2' : '例: 1\n2 3\n1 1 2'}
        />
        <div className="overflow-auto">
          <HintGrid lines={lines} orientation={orientation} editable onChange={onChange} />
        </div>
      </div>
    </div>
  );
}