// ============================================================================
// PicrossBoard.tsx
// 列ヒント（上）/ 行ヒント（左）/ 盤面（右下）をまとめた表示コンポーネント。
//
// 変更点（ヒントセルの「表示/編集モード」切り替え方式への再構築）:
// - 従来は1ヒント値=1<input>セルの直接編集方式だったが、以下の課題があった。
//     - ヒント値の追加・削除がしづらい（セル数が固定的で、増減の操作余地がない）
//     - スマホでは Tab/Enter/Space によるセル間移動が機能せず、操作効率が悪い
// - そこで、1行（行ヒント）/1列（列ヒント）を編集の最小単位とし、
//   「通常時は読み取り専用のバッジ表示 [3][1][2]」⇄「クリックでテキスト編集
//   モードに切り替わり、その行/列だけが '3 1 2' 形式のテキスト入力になる」
//   という2モードのコンポーネント（HintLineUnit）に置き換えた。
//   テキスト編集モードであれば、ヒント値の個数そのものを自由に増減できる
//   （スペース区切りでトークンを増減するだけ）うえ、スマホの標準的な
//   テキスト入力フローに乗るため、Tab/Enter移動の問題が発生しない。
// - 編集モードへの遷移はクリック（onClick）/フォーカス（onFocus）の両方で
//   発生させ、PC・タッチ操作のどちらでも自然に入れるようにする。
// - 確定（編集モード→表示モードへの復帰）は blur または Enter キーで行う。
//   blurで自動確定するため、「確定ボタン」を別途設けず操作の手数を増やさない。
// - 編集中の生テキストは HintLineUnit のローカル state として保持し、
//   1文字ごとに親（rowHints/colHints）へ反映する。これにより、編集中も
//   盤面側の表示（他の行/列のヒントやエラー状態）がリアルタイムに連動する。
//
// 変更点（エラー強調の統一化）:
// - 従来は「総和オーバー時、空白パディングセルだけが強調され、実際の
//   ヒント値セルの境界の一部が強調から漏れる」ケースがあった
//   （borderColorをセルごとに個別指定していたため、隣接セル境界の
//   片側だけ赤くなる箇所が生じていた）。
// - 今回、ヒントセルは「行/列全体を1つの視覚的まとまり（HintLineUnit）」
//   として描画するようにしたため、エラー時は外枠1つを赤くするだけで
//   行/列全体が統一感のある強調表示になる（内部セル境界の色分けに依存しない）。
//
// 既存の変更点（5マス区切り + 盤面外枠強化 + 罫線統一ロジック）:
// - 罫線太さの決定を isMajorLine / borderWeightPx という単一の純粋関数に
//   集約し、盤面・行ヒント・列ヒントが同じ関数を同じ引数で呼ぶ。
// - セルサイズ(CELL_PX)自体は変更しない。
//
// スクロール同期アーキテクチャ（既存・変更なし）:
// - 盤面・行ヒント・列ヒント・交点ブロックは単一のスクロールコンテナの中に
//   置かれ、列ヒント行はsticky top-0、行ヒント列はsticky left-0、
//   交点ブロックはsticky top-0 left-0。スクロール位置はReact stateで
//   一切管理しない。
//
// 大規模盤面（100×100以上）:
// - 固定DOM + sticky方式を維持。1行/1列が1つのHintLineUnitになったことで、
//   むしろDOMノード数は「ヒント値の数」から「行/列の数」分だけに削減され、
//   大規模盤面でのレンダリングコストは従来より軽くなる。
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import type {
  CellValue,
  Grid,
  HintCellError,
  HintLineError,
  HintLineFocusTarget,
  HintLines,
  SolvedGrid,
} from '../types';
import { findLineError } from '../validation/hintValidation';

// ----------------------------------------------------------------------------
// グリッド寸法・罫線太さ・罫線色の基準値
// （盤面・行ヒント・列ヒントが共有する唯一の参照元）
// ----------------------------------------------------------------------------

/** 盤面セル・ヒントセルが共有する唯一の基準サイズ（px）。ズレ防止のため一箇所で管理する。 */
const CELL_PX = 32;

/** 通常罫線の太さ（px） */
const MINOR_BORDER_PX = 1;

/** 5マス区切りの太線の太さ（px） */
const MAJOR_BORDER_PX = 2;

/** 盤面本体（セル領域）の外枠の太さ（px）。ヒントグリッドの内側に描く。 */
const BOARD_OUTER_BORDER_PX = 3;

/** ヒントグリッド自身の最外周（最上段上辺・最下段下辺・最左列左辺・最右列右辺）の太さ（px） */
const HINT_OUTER_BORDER_PX = 2;

/** 何マスごとに太線を引くか */
const MAJOR_INTERVAL = 5;

/** 通常罫線の色（盤面用） */
const BOARD_MINOR_BORDER_COLOR = '#94a3b8'; // slate-400相当
/** 盤面本体の外枠線の色 */
const BOARD_OUTER_BORDER_COLOR = '#475569'; // slate-600相当
/** ヒントグリッドの罫線色（主軸・直交軸とも共通、交点ブロックも同色） */
const HINT_BORDER_COLOR = '#cbd5e1'; // slate-300相当

/** エラーがあるヒントセルの枠線色（彩度を抑えた赤、過剰に目立たせないため枠線のみで表現） */
const HINT_ERROR_BORDER_COLOR = '#ef4444'; // red-500相当
/** エラーがあるヒントセルの背景色（薄い赤、文字は読める程度の薄さに留める） */
const HINT_ERROR_BG_CLASS = 'bg-red-50';

/**
 * 「このインデックスのセルの右側 / 下側」に太線を引くべきか。
 * index は 0-based のセル位置（行なら row index、列なら col index）。
 * total はそのライン上の総セル数（最後のセルには別レイヤーの外枠が
 * 担当するため太線は不要、という前提の関数）。
 *
 * 重要: 中間の境界線は必ず「片側のセルの右辺/下辺」だけが描く。
 * 反対側のセルが同じ境界に別の罫線を重ねて描いてはならない
 * （二重描画によるズレ・太さの加算を防ぐため）。
 */
function isMajorLine(index: number, total: number): boolean {
  const pos = index + 1; // 1-based の「これが何番目か」
  if (pos >= total) return false; // 最後は別レイヤーの外枠が担当するので太線不要
  return pos % MAJOR_INTERVAL === 0;
}

/** 罫線の太さ(px)を返す。border-right / border-bottom にそのまま使う。 */
function borderWeightPx(index: number, total: number): number {
  return isMajorLine(index, total) ? MAJOR_BORDER_PX : MINOR_BORDER_PX;
}

// ----------------------------------------------------------------------------
// セル描画ヘルパー
// ----------------------------------------------------------------------------

function cellClass(value: CellValue): string {
  if (value === 1) return 'bg-slate-900';
  if (value === 0) return 'bg-white';
  return 'bg-slate-200';
}

interface PicrossBoardProps {
  readonly rowHints: HintLines;
  readonly colHints: HintLines;
  /** ソルバー出力の盤面。未指定/サイズ不一致時は空盤面を表示する。 */
  readonly grid?: Grid | SolvedGrid | null;
  /** 行ヒントを盤面側で直接編集した結果を親に伝える */
  readonly onRowHintsChange: (lines: HintLines) => void;
  /** 列ヒントを盤面側で直接編集した結果を親に伝える */
  readonly onColHintsChange: (lines: HintLines) => void;
  /** 行ヒントのセル単位エラー（App.tsxのvalidateHintsから配布）。該当行ユニットの強調表示に使う。 */
  readonly rowCellErrors?: readonly HintCellError[];
  /** 列ヒントのセル単位エラー。 */
  readonly colCellErrors?: readonly HintCellError[];
  /** 行/列単位エラー（総和オーバー等）。row/col両方を含む。 */
  readonly lineErrors?: readonly HintLineError[];
  /**
   * エラー一覧等から「この行/列に注目してほしい」という外部からの指示。
   * 変化を検知すると、該当する HintLineUnit が自動でスクロール表示され、
   * 一時的に強いハイライト（ピンポイント注目色）を点灯させる。
   * App.tsx 側の「エラー行へジャンプ」ボタンから渡される。
   */
  readonly focusTarget?: HintLineFocusTarget | null;
}

/** 1行/1列にセルエラーが1件でも存在するかを判定する。 */
function lineHasCellError(cellErrors: readonly HintCellError[], lineIndex: number): boolean {
  return cellErrors.some((e) => e.lineIndex === lineIndex);
}

/** セルエラーの種別から、行/列ユニットのtitle属性用の要約テキストを作る。 */
function cellErrorSummary(cellErrors: readonly HintCellError[], lineIndex: number): string | null {
  const errorsInLine = cellErrors.filter((e) => e.lineIndex === lineIndex);
  if (errorsInLine.length === 0) return null;
  const labels = errorsInLine.map((e) => {
    switch (e.kind) {
      case 'not-a-number':
        return `"${e.rawToken}"は数字以外の文字を含みます`;
      case 'not-integer':
        return `"${e.rawToken}"は小数のため使用できません`;
      case 'non-positive':
        return `"${e.rawToken}"は0以下のため使用できません`;
      default:
        return `"${e.rawToken}"は不正な値です`;
    }
  });
  return [...new Set(labels)].join(' / ');
}

/**
 * 1行/1列分のテキスト（例: "3 1 2"）を解析し、正の整数のみを HintLines の
 * 1ラインとして取り出す。HintEditor.parseHintText と同じトークン解釈
 * ルール（空白・カンマ区切り、数字以外や0以下は除外）に統一する。
 * これにより、テキストボックス側とヒントセル側で「同じ文字列を入力したら
 * 同じ結果になる」という一貫性が保たれる。
 */
function parseLineText(rawLine: string): number[] {
  return rawLine
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token !== '')
    .map((token) => Number.parseInt(token, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** 1行/1列分のヒント配列を、編集テキスト表示用の文字列に変換する。 */
function serializeLine(line: readonly number[]): string {
  return line.join(' ');
}

/** lines のうち lineIndex 番目だけを newLine に置き換えた新しい HintLines を返す。 */
function replaceLine(lines: HintLines, lineIndex: number, newLine: number[]): HintLines {
  return lines.map((line, i) => (i === lineIndex ? newLine : line));
}

/**
 * 1行（行ヒント）または1列（列ヒント）を、表示モード(バッジ)/編集モード
 * (テキスト入力)の2状態で描画する最小編集単位。
 *
 * 表示モード:
 * - maxLen 個分のスロットを確保し、値がある位置だけ "[3]" のような
 *   バッジを表示する（値がない先頭側のスロットは空白のまま、これは
 *   ヒントの「右詰め/下詰め」表示という既存仕様を維持するため）。
 * - クリックすると編集モードに入る。
 *
 * 編集モード:
 * - 行/列全体を1つのテキストフィールドとして表示し、"3 1 2" のような
 *   スペース区切りで自由に編集できる。ヒント値の増減もここで自然に行える。
 * - blur または Enter キーで確定し、パース結果を親（onChange）に伝えて
 *   表示モードに戻る。Escapeキーで編集前の内容を破棄してキャンセルできる。
 *
 * 罫線・サイズ:
 * - outerStyle（このユニット全体の外枠）と、isMajor（5マス区切りの太線か）
 *   を呼び出し側（ColHints/RowHints）から受け取り、ユニット全体の外枠と
 *   して描画する。内部のヒント値どうしの境界線は描かない（バッジ自体の
 *   見た目で区切りを表現するため、エラー時も外枠1本の強調で済む）。
 */
function HintLineUnit({
  orientation,
  line,
  maxLen,
  outerStyle,
  hasError,
  errorTitle,
  isFocused,
  onChange,
  unitRef,
}: {
  orientation: 'row' | 'col';
  line: readonly number[];
  maxLen: number;
  outerStyle: CSSProperties;
  hasError: boolean;
  errorTitle: string | null;
  isFocused: boolean;
  onChange: (newLine: number[]) => void;
  unitRef?: (el: HTMLDivElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(() => serializeLine(line));
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部（solver側の再生機能等）から line が変わった場合、編集中でなければ
  // draftText を追従させる（編集中に上書きすると入力中の文字が消えてしまうため）。
  useEffect(() => {
    if (!editing) setDraftText(serializeLine(line));
  }, [line, editing]);

  const startEditing = () => {
    setDraftText(serializeLine(line));
    setEditing(true);
  };

  const commit = () => {
    onChange(parseLineText(draftText));
    setEditing(false);
  };

  const cancel = () => {
    setDraftText(serializeLine(line));
    setEditing(false);
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const isVertical = orientation === 'col';
  const sizePx = maxLen * CELL_PX;

  const containerStyle: CSSProperties = {
    ...outerStyle,
    width: isVertical ? CELL_PX : sizePx,
    height: isVertical ? sizePx : CELL_PX,
    boxSizing: 'border-box',
    position: 'relative',
  };

  // エラー強調は外枠（containerStyle）の borderColor を一括で赤くするだけで
  // 行/列全体が統一感をもって強調される（内部セル単位の塗り分けに依存しない）。
  if (hasError) {
    containerStyle.borderColor = HINT_ERROR_BORDER_COLOR;
  }
  // エラージャンプによる一時的な強調（青系、エラー色とは別軸の「現在地」表示）。
  const focusRingClass = isFocused ? 'ring-2 ring-inset ring-blue-500' : '';

  return (
    <div
      ref={unitRef}
      style={containerStyle}
      title={errorTitle ?? undefined}
      className={`${hasError ? HINT_ERROR_BG_CLASS : 'bg-white'} ${focusRingClass}`}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          className="absolute inset-0 h-full w-full bg-white text-center font-mono text-xs outline-none ring-2 ring-inset ring-slate-600 sm:text-sm"
          placeholder={orientation === 'row' ? '3 1 2' : '3\n1\n2'}
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          title={errorTitle ?? `クリックして編集（${orientation === 'row' ? '行' : '列'}全体をテキストで編集できます）`}
          className={`flex h-full w-full items-center justify-center ${
            isVertical ? 'flex-col' : 'flex-row'
          } gap-0.5 px-0.5 py-0.5 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}
        >
          {line.length === 0 ? (
            <span className="text-[11px] text-slate-300">―</span>
          ) : (
            line.map((value, i) => (
              <span
                key={i}
                className={`rounded px-1 font-mono text-[11px] leading-tight sm:text-xs ${
                  hasError ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {value}
              </span>
            ))
          )}
        </button>
      )}
    </div>
  );
}

/**
 * 列ヒント（盤面の上、sticky top-0）を1列ずつ描画する。
 * 各列は HintLineUnit（縦長、orientation="col"）として描画され、
 * 列の右側境界に5マス区切りの太線判定、最左列・最右列にヒントグリッド
 * 自身の外周線を適用する。内部のヒント値どうしの区切り線はHintLineUnit内部
 * では描かない（バッジ表示で十分区別できるため、罫線の数を減らしムダな
 * 二重描画リスクをなくす）。
 */
function ColHints({
  colHints,
  maxLen,
  cols,
  onChange,
  cellErrors = [],
  lineErrors = [],
  focusTarget,
  unitRefs,
}: {
  colHints: HintLines;
  maxLen: number;
  cols: number;
  onChange: (lines: HintLines) => void;
  cellErrors?: readonly HintCellError[];
  lineErrors?: readonly HintLineError[];
  focusTarget?: HintLineFocusTarget | null;
  unitRefs?: MutableRefObject<Map<string, HTMLDivElement>>;
}) {
  return (
    <div className="sticky top-0 z-20 flex bg-slate-50">
      {colHints.map((line, lineIndex) => {
        const isFirst = lineIndex === 0;
        const isLast = lineIndex === cols - 1;
        const rightWidth = isLast ? HINT_OUTER_BORDER_PX : borderWeightPx(lineIndex, cols);
        const leftWidth = isFirst ? HINT_OUTER_BORDER_PX : 0;
        const hasLineError = findLineError(lineErrors, 'col', lineIndex) !== undefined;
        const hasCellError = lineHasCellError(cellErrors, lineIndex);
        const hasError = hasLineError || hasCellError;
        const lineErr = findLineError(lineErrors, 'col', lineIndex);
        const cellErrSummary = cellErrorSummary(cellErrors, lineIndex);
        const errorTitle = [cellErrSummary, lineErr?.message].filter(Boolean).join(' / ') || null;
        const isFocused = focusTarget?.type === 'col' && focusTarget.index === lineIndex;

        const outerStyle: CSSProperties = {
          boxSizing: 'border-box',
          borderStyle: 'solid',
          borderRightWidth: rightWidth,
          borderLeftWidth: leftWidth,
          borderTopWidth: 0,
          borderBottomWidth: MINOR_BORDER_PX,
          borderColor: HINT_BORDER_COLOR,
        };

        return (
          <HintLineUnit
            key={lineIndex}
            orientation="col"
            line={line}
            maxLen={maxLen}
            outerStyle={outerStyle}
            hasError={hasError}
            errorTitle={errorTitle}
            isFocused={isFocused}
            onChange={(newLine) => onChange(replaceLine(colHints, lineIndex, newLine))}
            unitRef={(el) => {
              if (!unitRefs) return;
              const key = `col-${lineIndex}`;
              if (el) unitRefs.current.set(key, el);
              else unitRefs.current.delete(key);
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * 行ヒント（盤面の左、sticky left-0）を1行ずつ描画する。
 * 各行は HintLineUnit（横長、orientation="row"）として描画され、
 * 行の下側境界に5マス区切りの太線判定、最上段・最下段にヒントグリッド
 * 自身の外周線を適用する。ColHintsと対をなす実装で、軸方向以外の
 * ロジックはすべて共通（HintLineUnit側に集約済み）。
 */
function RowHints({
  rowHints,
  maxLen,
  rows,
  onChange,
  cellErrors = [],
  lineErrors = [],
  focusTarget,
  unitRefs,
}: {
  rowHints: HintLines;
  maxLen: number;
  rows: number;
  onChange: (lines: HintLines) => void;
  cellErrors?: readonly HintCellError[];
  lineErrors?: readonly HintLineError[];
  focusTarget?: HintLineFocusTarget | null;
  unitRefs?: MutableRefObject<Map<string, HTMLDivElement>>;
}) {
  return (
    <div className="sticky left-0 z-10 flex flex-col bg-slate-50">
      {rowHints.map((line, lineIndex) => {
        const isFirst = lineIndex === 0;
        const isLast = lineIndex === rows - 1;
        const bottomWidth = isLast ? HINT_OUTER_BORDER_PX : borderWeightPx(lineIndex, rows);
        const topWidth = isFirst ? HINT_OUTER_BORDER_PX : 0;
        const hasLineError = findLineError(lineErrors, 'row', lineIndex) !== undefined;
        const hasCellError = lineHasCellError(cellErrors, lineIndex);
        const hasError = hasLineError || hasCellError;
        const lineErr = findLineError(lineErrors, 'row', lineIndex);
        const cellErrSummary = cellErrorSummary(cellErrors, lineIndex);
        const errorTitle = [cellErrSummary, lineErr?.message].filter(Boolean).join(' / ') || null;
        const isFocused = focusTarget?.type === 'row' && focusTarget.index === lineIndex;

        const outerStyle: CSSProperties = {
          boxSizing: 'border-box',
          borderStyle: 'solid',
          borderBottomWidth: bottomWidth,
          borderTopWidth: topWidth,
          borderLeftWidth: 0,
          borderRightWidth: MINOR_BORDER_PX,
          borderColor: HINT_BORDER_COLOR,
        };

        return (
          <HintLineUnit
            key={lineIndex}
            orientation="row"
            line={line}
            maxLen={maxLen}
            outerStyle={outerStyle}
            hasError={hasError}
            errorTitle={errorTitle}
            isFocused={isFocused}
            onChange={(newLine) => onChange(replaceLine(rowHints, lineIndex, newLine))}
            unitRef={(el) => {
              if (!unitRefs) return;
              const key = `row-${lineIndex}`;
              if (el) unitRefs.current.set(key, el);
              else unitRefs.current.delete(key);
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * 左上の交点ブロック（盤面の左上、sticky top-0 left-0）。
 * 行ヒントの最大桁数(rowMaxLen) × 列ヒントの最大桁数(colMaxLen) の
 * セルを実際に敷き並べ、ColHints/RowHintsと同じ罫線ルールで描画する。
 * borderWeightPx のみを使用し、ヒントグリッド最外周用の特別扱いは行わない
 * （要求どおり、交点ブロック内部のグリッドとヒント自身の外周は
 * 別物として扱う。変更なし）。
 */
function CornerGrid({ rowMaxLen, colMaxLen }: { rowMaxLen: number; colMaxLen: number }) {
  return (
    <div className="sticky top-0 left-0 z-30 bg-slate-50">
      {Array.from({ length: colMaxLen }, (_, r) => {
        const bottomWidth = borderWeightPx(r, colMaxLen);
        return (
          <div key={r} className="flex" style={{ height: CELL_PX }}>
            {Array.from({ length: rowMaxLen }, (_, c) => {
              const rightWidth = borderWeightPx(c, rowMaxLen);
              return (
                <div
                  key={c}
                  style={{
                    width: CELL_PX,
                    height: CELL_PX,
                    boxSizing: 'border-box',
                    borderStyle: 'solid',
                    borderRightWidth: rightWidth,
                    borderBottomWidth: bottomWidth,
                    borderColor: HINT_BORDER_COLOR,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function PicrossBoard({
  rowHints,
  colHints,
  grid,
  onRowHintsChange,
  onColHintsChange,
  rowCellErrors,
  colCellErrors,
  lineErrors,
  focusTarget,
}: PicrossBoardProps) {
  const rows = rowHints.length;
  const cols = colHints.length;

  const rowMaxLen = Math.max(1, ...rowHints.map((line) => line.length));
  const colMaxLen = Math.max(1, ...colHints.map((line) => line.length));

  const displayGrid: readonly (readonly CellValue[])[] =
    grid && grid.length === rows && (grid[0]?.length ?? 0) === cols
      ? (grid as readonly (readonly CellValue[])[])
      : Array.from({ length: rows }, () => Array.from({ length: cols }, () => -1 as CellValue));

  // ColHints/RowHints が描画する各 HintLineUnit の DOM ノードを
  // "row-3" / "col-7" のようなキーで保持しておく。focusTarget が変化した
  // ときに該当ノードへ scrollIntoView するための参照表。
  const unitRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!focusTarget) return;
    const key = `${focusTarget.type}-${focusTarget.index}`;
    const el = unitRefs.current.get(key);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [focusTarget]);

  return (
    // 単一スクロールコンテナ: 盤面・行ヒント・列ヒント・交点はすべてこの中に存在する。
    <div className="max-h-[70vh] max-w-full overflow-auto rounded border border-slate-300 bg-white">
      <div className="inline-grid" style={{ gridTemplateColumns: 'auto 1fr' }}>
        {/* 左上交点: 行ヒント上辺・列ヒント左辺が連続するよう、1セルごとの
            グリッドとして描画する（罫線なしの空白divではない）。 */}
        <CornerGrid rowMaxLen={rowMaxLen} colMaxLen={colMaxLen} />
        <ColHints
          colHints={colHints}
          maxLen={colMaxLen}
          cols={cols}
          onChange={onColHintsChange}
          cellErrors={colCellErrors}
          lineErrors={lineErrors}
          focusTarget={focusTarget}
          unitRefs={unitRefs}
        />
        <RowHints
          rowHints={rowHints}
          maxLen={rowMaxLen}
          rows={rows}
          onChange={onRowHintsChange}
          cellErrors={rowCellErrors}
          lineErrors={lineErrors}
          focusTarget={focusTarget}
          unitRefs={unitRefs}
        />
        {/* 盤面本体: 固定DOM。罫線太さはborderWeightPxで行・列ヒントと同一判定。
            外枠に接する辺だけ borderColor を個別指定し、それ以外の辺は
            通常色のままにする（className一括指定はしない）。 */}
        <div>
          {displayGrid.map((row, i) => {
            const bottomWidth = borderWeightPx(i, rows);
            const isTopRow = i === 0;
            const isBottomRow = i === rows - 1;
            return (
              <div key={i} className="flex">
                {row.map((cell, j) => {
                  const isLeftCol = j === 0;
                  const isRightCol = j === cols - 1;
                  const style: CSSProperties = {
                    width: CELL_PX,
                    height: CELL_PX,
                    boxSizing: 'border-box',
                    borderStyle: 'solid',
                    borderRightWidth: isRightCol
                      ? BOARD_OUTER_BORDER_PX
                      : borderWeightPx(j, cols),
                    borderBottomWidth: isBottomRow
                      ? BOARD_OUTER_BORDER_PX
                      : bottomWidth,
                    borderLeftWidth: isLeftCol ? BOARD_OUTER_BORDER_PX : 0,
                    borderTopWidth: isTopRow ? BOARD_OUTER_BORDER_PX : 0,
                    // 辺ごとに色を個別指定する。外枠に接する辺のみ外枠色、
                    // それ以外の辺は通常色。className一括指定にすると
                    // セル全体が同じ色になってしまうため、必ずstyleで分離する。
                    borderRightColor: isRightCol
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                    borderBottomColor: isBottomRow
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                    borderLeftColor: isLeftCol
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                    borderTopColor: isTopRow
                      ? BOARD_OUTER_BORDER_COLOR
                      : BOARD_MINOR_BORDER_COLOR,
                  };
                  return <div key={j} style={style} className={cellClass(cell)} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}