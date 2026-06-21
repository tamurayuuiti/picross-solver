// ============================================================================
// PicrossBoard.tsx
// 列ヒント（上）/ 行ヒント（左）/ 盤面（右下）をまとめた表示コンポーネント。
//
// 変更点（エラー表示・ジャンプ・ハイライトの統合再設計）:
// - focusTarget（行/列の位置だけを持つ素朴な値）を廃止し、App.tsx の
//   useErrorFocus が一元管理する HintErrorFocus（行/列位置 + 発生源 +
//   requestId）をそのまま受け取る。発生源がテキスト入力欄か、SolverPanel
//   の矛盾アラートか、盤面自身かに関わらず、ここでの処理（スクロール+
//   一時ハイライト）は完全に同一になる。
// - 強調表示（エラー枠・フォーカス枠）を border 依存から outline 依存に
//   変更した。理由:
//     - このコンポーネントは「5マスごとの太線」「ヒントグリッド最外周」
//       など、border-* を罫線の意味で多重に使っている。エラー時に
//       borderColor を上書きする方式では、罫線の太さや左右非対称な
//       border-width 指定（中間境界線は片側のセルだけが描く設計）と
//       衝突し、「一部の辺だけ赤くならない」問題の温床になっていた。
//     - outline はレイアウト幅に影響せず、border の外側に独立した
//       矩形を描く。罫線の太さ・色の設計に一切手を入れずに、常に
//       「四辺が揃った1本の枠」を保証できる。
//     - エラー枠（赤）とフォーカス枠（青）は意味の異なる強調なので、
//       重ねて表示できるよう outline-offset を変えて二重に描く。
//
// 変更点（ヒント編集UIのポップオーバー化）:
// - 従来は HintLineUnit 自身がインライン編集（その場でテキスト入力に
//   変身する）方式だったが、列ヒント（縦長・幅が CELL_PX 固定で狭い）
//   では入力欄が窮屈になりがちだった。
// - 行・列どちらも同じ挙動に統一するため、「クリックで小さな編集
//   ポップオーバーを浮かせる」方式に揺集約した。ポップオーバーは
//   常に横長のテキスト入力（行ヒントと同じ "3 1 2" 形式）として表示する
//   ため、列ヒントであっても狭いセル内に押し込まれず入力しやすい。
// - ポップオーバーの外側クリック・Escapeキー・Enterキーで確定し、表示
//   モードに戻る。確定ロジック（parseLineText）は変更していない。
//
// 既存の変更点（5マス区切り + 盤面外枠強化 + 罫線統一ロジック、変更なし）:
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
  HintErrorFocus,
  HintErrorSource,
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
/** 盤面本体の外枠線の色（デザイン改修: コントラストを少し強め視認性を維持） */
const BOARD_OUTER_BORDER_COLOR = '#334155'; // slate-700相当
/** ヒントグリッドの罫線色（主軸・直交軸とも共通、交点ブロックも同色） */
const HINT_BORDER_COLOR = '#cbd5e1'; // slate-300相当

/**
 * エラーがあるヒントセルの強調色（彩度を抑えた赤）。
 * outline で描くため、罫線（border）の太さ・色設計には一切影響しない。
 */
const HINT_ERROR_OUTLINE_COLOR = '#ef4444'; // red-500相当
/** エラーがあるヒントセルの背景色（薄い赤、文字は読める程度の薄さに留める） */
const HINT_ERROR_BG_CLASS = 'bg-red-50';

/**
 * エラージャンプによる一時的な強調（青）の背景フラッシュ色。
 * border / outline には一切依存しない。罫線（borderWeightPx で決まる
 * 5マス太線・外周線・エラー枠）と全く別レイヤーの「オーバーレイ要素の
 * 背景色」としてのみ使うため、「枠線の一部の辺だけ描かれない」という
 * 問題が構造的に発生しない。
 */
const FOCUS_FLASH_BG = 'rgba(37, 99, 235, 0.32)'; // blue-600相当、半透明

/** ジャンプ強調フラッシュの再生時間（ms）。useErrorFocus側の自動解除時間より
 * 短い「一瞬の合図」として設計し、常時強調にはしない。 */
const FOCUS_FLASH_DURATION_MS = 900;

// ----------------------------------------------------------------------------
// 罫線太さ判定（既存ロジック、変更なし）
// ----------------------------------------------------------------------------

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
   * 現在強調表示すべき対象（App.tsx の useErrorFocus が一元管理）。
   * テキスト入力欄・SolverPanelの矛盾アラート・盤面自身のどこから来た
   * ジャンプ要求でも、同じ型・同じ処理でスクロール+一時ハイライトされる。
   */
  readonly focus?: HintErrorFocus | null;
  /**
   * 盤面側ヒントセル自身からのジャンプ要求（将来拡張用）。現在の
   * HintLineUnit は自分自身が focus 対象になることはあっても、自分から
   * 他の対象をフォーカスさせる導線は持たないため未使用だが、
   * 「すべてのエラー表示は同じ入口を呼ぶ」という統一方針を満たすために
   * 型としては受け取れるようにしておく。
   */
  readonly onRequestFocus?: (target: HintLineFocusTarget, source: HintErrorSource) => void;
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

// ----------------------------------------------------------------------------
// 強調表示の組み立て
// - エラー枠（赤）のみ outline-* で描く。outline はレイアウト幅に影響せず、
//   border の外側に独立した矩形を描くため、5マス区切りの罫線設計
//   （borderWeightPx）に一切影響を与えずに「常に四辺が揃った1本の枠」を
//   保証できる。
// - ジャンプ強調（青）は border/outline を一切使わない別方式
//   （FocusFlashOverlay、後述）に分離した。理由:
//     - エラー枠と同時に「もう1本」枠を重ねる設計は、二重の枠線が
//       要素の内側オフセットや角の処理で衝突し、「一部の辺しか描かれない」
//       不具合の温床になっていた。
//     - ジャンプ強調は「常時表示する状態」ではなく「ジャンプした瞬間だけ
//       再生されるワンショットの合図」であるため、そもそも枠線という
//       静的な表現よりも、背景色フラッシュ+フェードアウトの方が役割に
//       合っている。
// - 結果として、エラー（赤）とジャンプ（青）は完全に別レイヤー・別の
//   視覚言語（枠 vs 背景フラッシュ）になり、同時に発生しても互いの
//   視認性を損なわない。
// ----------------------------------------------------------------------------
function highlightStyle(hasError: boolean): CSSProperties {
  if (hasError) {
    return { outline: `2px solid ${HINT_ERROR_OUTLINE_COLOR}`, outlineOffset: '-2px' };
  }
  return {};
}

/**
 * ジャンプ直後の一時的な強調を「背景色フラッシュ」として描く専用オーバーレイ。
 *
 * 設計上の要点:
 * - position: absolute; inset: 0 で対象セルの矩形にぴったり重なるが、
 *   border/outline の計算には一切参加しない別要素。このため罫線の太さ・
 *   色設計、エラー時の bg-red-50 背景、ボタンの hover 背景のいずれとも
 *   競合しない。
 * - pointer-events: none にして、クリック・hover などの操作を一切妨げない
 *   （ヒント編集ポップオーバーを開くクリック動作はそのまま機能する）。
 * - key={requestId} で毎回新しいDOM要素として再マウントすることで、
 *   「同じ対象に再度ジャンプしてきた場合でもアニメーションが確実に
 *   再生される」ことを保証する（useErrorFocus が requestId を毎回更新する
 *   設計と対応している）。
 * - アニメーションは Tailwind の任意値アニメーションではなく、インライン
 *   <style> 経由の @keyframes を一度だけ注入する方式にした。これにより
 *   グローバルCSSファイルへの追記なしで、このファイル単体で完結する
 *   （ファイル分割を増やさないための判断）。
 * - 透明度は 0 → 1（瞬間的にピークへ） → 0 という単純なワンショットで、
 *   常時強調にはならない「気づけるが居座らない」表現にしている。
 */
function FocusFlashOverlay({ requestId }: { requestId: number }) {
  return (
    <div
      key={requestId}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: FOCUS_FLASH_BG,
        pointerEvents: 'none',
        zIndex: 50,
        animation: `picross-focus-flash ${FOCUS_FLASH_DURATION_MS}ms ease-out forwards`,
      }}
    />
  );
}

/**
 * FocusFlashOverlay 用の @keyframes をドキュメントに一度だけ注入する。
 * モジュール読み込み時に1回だけ実行され、複数の HintLineUnit が同時に
 * マウントされても重複注入しない（idで存在チェック）。
 */
function ensureFocusFlashKeyframes(): void {
  if (typeof document === 'undefined') return;
  const STYLE_ID = 'picross-focus-flash-keyframes';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes picross-focus-flash {
      0% { opacity: 0; }
      15% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
ensureFocusFlashKeyframes();

// ----------------------------------------------------------------------------
// 編集ポップオーバー
// 行ヒント・列ヒントの双方が同一のコンポーネントを使う。常に横長の
// テキスト入力として表示するため、列ヒントの「縦長で狭い」という制約に
// 入力欄の使いやすさが左右されない。
// ----------------------------------------------------------------------------
function HintEditPopover({
  orientation,
  initialText,
  onCommit,
  onCancel,
}: {
  readonly orientation: 'row' | 'col';
  readonly initialText: string;
  readonly onCommit: (text: string) => void;
  readonly onCancel: () => void;
}) {
  const [draftText, setDraftText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 【修正箇所】全選択を廃止し、フォーカスしつつカーソルを末尾に配置する
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      const length = input.value.length;
      // 選択範囲の開始と終了を文字数の末尾に合わせることで、カーソルを一番右に置く
      input.setSelectionRange(length, length);
    }
  }, []);

  // ポップオーバー外側のクリックで確定する（テキストフィールドのblurと
  // 同じ「確定」扱い。キャンセルではない点に注意: 入力中の内容を失わない）。
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCommit(draftText);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
    // draftText が変わるたびにリスナーを再登録し、外側クリック時点の
    // 最新テキストを確実に確定できるようにする。
  }, [draftText, onCommit]);

  return (
    <div
      ref={popoverRef}
      className="absolute z-40 rounded-md border border-slate-300 bg-white p-1.5 shadow-md"
      style={{
        // 行ヒントは右側、列ヒントは下側にポップオーバーを開く。
        // どちらの軸でも横長の入力欄として表示するため、狭いセル内に
        // 押し込まれることがない。
        top: orientation === 'col' ? '100%' : 0,
        left: orientation === 'col' ? 0 : '100%',
        marginTop: orientation === 'col' ? 4 : 0,
        marginLeft: orientation === 'col' ? 0 : 4,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit(draftText);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-center font-mono text-sm outline-none ring-2 ring-inset ring-indigo-400 focus:ring-indigo-500"
        placeholder="3 1 2"
      />
      <p className="mt-1 text-center text-[10px] text-slate-400">Enterで確定 / Escでキャンセル</p>
    </div>
  );
}

/**
 * 1行（行ヒント）または1列（列ヒント）を、表示モード(バッジ)/編集モード
 * (ポップオーバーのテキスト入力)の2状態で描画する最小編集単位。
 *
 * 表示モード:
 * - maxLen 個分のスロットを確保し、値がある位置だけ "[3]" のような
 *   バッジを表示する（値がない先頭側のスロットは空白のまま、これは
 *   ヒントの「右詰め/下詰め」表示という既存仕様を維持するため）。
 * - クリックすると編集ポップオーバーが開く。
 *
 * 編集モード（ポップオーバー）:
 * - HintLineUnit 自体の上に絶対配置で浮かせ、常に横長のテキスト入力
 *   として "3 1 2" 形式を編集できる。行・列どちらでも同じ見た目・同じ
 *   操作感になるよう統一した（列ヒントだけ縦長の窮屈な入力になる、と
 *   いった不揺一さがなくなる）。
 * - Enterキー・外側クリックで確定し、パース結果を親（onChange）に伝えて
 *   ポップオーバーを閉じる。Escapeキーで編集前の内容を破棄してキャンセル
 *   できる。
 *
 * 罫線・サイズ:
 * - outerStyle（このユニット全体の外枠）と、isMajor（5マス区切りの太線か）
 *   を呼び出し側（ColHints/RowHints）から受け取り、ユニット全体の外枠と
 *   して描画する。内部のヒント値どうしの境界線は描かない（バッジ自体の
 *   見た目で区切りを表現するため）。
 * - エラー強調・フォーカス強調は outline / box-shadow（highlightStyle）で
 *   描くため、この外枠（border）の罫線設計には一切影響しない。
 */
function HintLineUnit({
  orientation,
  line,
  maxLen,
  outerStyle,
  hasError,
  errorTitle,
  focusRequestId,
  onChange,
  unitRef,
}: {
  orientation: 'row' | 'col';
  line: readonly number[];
  maxLen: number;
  outerStyle: CSSProperties;
  hasError: boolean;
  errorTitle: string | null;
  /**
   * このユニットが現在のジャンプ対象であるときだけ requestId（毎回
   * 一意の番号）を渡す。対象でない場合は null。値そのものは使わず、
   * 「変化したかどうか」だけを FocusFlashOverlay の再マウントトリガーに
   * 使うため、boolean の isFocused では表現できない「同じ対象への
   * 再クリックでも再生し直す」要件をここで満たす。
   */
  focusRequestId: number | null;
  onChange: (newLine: number[]) => void;
  unitRef?: (el: HTMLDivElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  const startEditing = () => setEditing(true);

  const commit = (text: string) => {
    onChange(parseLineText(text));
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const isVertical = orientation === 'col';
  const sizePx = maxLen * CELL_PX;

  const containerStyle: CSSProperties = {
    ...outerStyle,
    ...highlightStyle(hasError),
    width: isVertical ? CELL_PX : sizePx,
    height: isVertical ? sizePx : CELL_PX,
    boxSizing: 'border-box',
    position: 'relative',
    // ジャンプ強調オーバーレイ（position: absolute; inset: 0）の基準位置を
    // このユニット自身にするため overflow は隠さない（バッジやポップオーバー
    // の表示を妨げないよう、意図的に hidden にしない）。
  };

  return (
    <div
      ref={unitRef}
      style={containerStyle}
      title={errorTitle ?? undefined}
      className={hasError ? HINT_ERROR_BG_CLASS : 'bg-white'}
    >
      <button
        type="button"
        onClick={startEditing}
        title={errorTitle ?? `クリックして編集（${orientation === 'row' ? '行' : '列'}全体をテキストで編集できます）`}
        className={`flex h-full w-full items-center justify-center ${
          isVertical ? 'flex-col' : 'flex-row'
        } gap-0.5 px-0.5 py-0.5 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
      >
        {line.length === 0 ? (
          <span className="text-[11px] text-slate-300">―</span>
        ) : (
          line.map((value, i) => (
            <span
              key={i}
              className={`rounded-sm px-1 font-mono text-[11px] leading-tight sm:text-xs ${
                hasError ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {value}
            </span>
          ))
        )}
      </button>

      {/* ジャンプ強調: エラー枠線(outline)とは完全に別レイヤーの
          背景フラッシュオーバーレイ。focusRequestId が null でない
          ときだけ一瞬再生され、エラー表示の視認性を妨げない。 */}
      {focusRequestId !== null && <FocusFlashOverlay requestId={focusRequestId} />}

      {editing && (
        <HintEditPopover
          orientation={orientation}
          initialText={serializeLine(line)}
          onCommit={commit}
          onCancel={cancel}
        />
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
  focus,
  unitRefs,
}: {
  colHints: HintLines;
  maxLen: number;
  cols: number;
  onChange: (lines: HintLines) => void;
  cellErrors?: readonly HintCellError[];
  lineErrors?: readonly HintLineError[];
  focus?: HintErrorFocus | null;
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
        // このユニットが現在のジャンプ対象なら requestId を渡し、対象でなければ
        // null にする。requestId は useErrorFocus 側で「呼ばれるたびに必ず
        // 増える」設計のため、同じ列への再ジャンプでも新しい値になり、
        // FocusFlashOverlay が key の変化で確実に再マウント=再生される。
        const focusRequestId =
          focus?.type === 'col' && focus.index === lineIndex ? focus.requestId : null;

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
            focusRequestId={focusRequestId}
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
  focus,
  unitRefs,
}: {
  rowHints: HintLines;
  maxLen: number;
  rows: number;
  onChange: (lines: HintLines) => void;
  cellErrors?: readonly HintCellError[];
  lineErrors?: readonly HintLineError[];
  focus?: HintErrorFocus | null;
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
        const focusRequestId =
          focus?.type === 'row' && focus.index === lineIndex ? focus.requestId : null;

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
            focusRequestId={focusRequestId}
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
  focus,
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
  // "row-3" / "col-7" のようなキーで保持しておく。focus が変化した
  // ときに該当ノードへ scrollIntoView するための参照表。
  const unitRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!focus) return;
    const key = `${focus.type}-${focus.index}`;
    const el = unitRefs.current.get(key);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    // focus.requestId を依存値に含めることで、同じ (type, index) への
    // 再クリックでも確実にスクロールが再発火する
    // （useErrorFocus 側が毎回新しい requestId を発行するため）。
  }, [focus?.type, focus?.index, focus?.requestId]);

  return (
    // 単一スクロールコンテナ: 盤面・行ヒント・列ヒント・交点はすべてこの中に存在する。
    <div className="max-h-[70vh] max-w-full overflow-auto rounded-lg border border-slate-300 bg-white">
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
          focus={focus}
          unitRefs={unitRefs}
        />
        <RowHints
          rowHints={rowHints}
          maxLen={rowMaxLen}
          rows={rows}
          onChange={onRowHintsChange}
          cellErrors={rowCellErrors}
          lineErrors={lineErrors}
          focus={focus}
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