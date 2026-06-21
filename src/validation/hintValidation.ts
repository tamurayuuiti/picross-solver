// ============================================================================
// hintValidation.ts
// ヒント入力（rowHints / colHints）に対する「静的検証」を一元的に担う。
//
// 設計方針:
// - solvePicross を1回も呼ばずに判定できるエラーのみをここで扱う。
//   contradiction / unsolvable は solvePicross の実行結果であり、
//   ここでは扱わない（SolverPanel側でそのまま表示する）。
// - すべて副作用のない純粋関数。React や DOM に一切依存しないため、
//   将来 Web Worker 上でも再利用できる。
// - 「セル単位」「行/列単位」「盤面全体」の3つの粒度でエラーを返す
//   （HintValidationResult）。呼び出し側（App.tsx）はこれをそのまま
//   各表示コンポーネントへ配るだけでよい。
//
// 検証対象とその根拠:
// - 入力形式エラー（数字以外・小数・負数）:
//   HintLines はテキスト入力（HintEditor）と盤面接続セル編集
//   （PicrossBoard）の両方から作られるが、どちらも最終的に
//   `number[][]` に変換された後の値しか持っていない。そのため
//   「数字以外の文字が入力された」という事実そのものは、変換前の
//   生テキストに対して再パースしないと判定できない。
//   ここでは HintLines（パース後の number[][]）に加えて、
//   HintEditor が保持する生テキストを呼び出し側から渡してもらい、
//   そこから「パースで捨てられたトークン」を再検出する
//   （validateRawHintText）。
// - ヒント値エラー（0・負数・不正な数列）:
//   number[][] の各要素を直接検証できる（validateHintLines）。
//   なお現在の parseHintText は正数以外をフィルタで除外する実装の
//   ため、HintLines の中に 0 や負数が直接入ることは通常ないが、
//   PicrossBoard 側のセル編集や将来の入力経路変更に備え、
//   防御的に検証する。
// - サイズ不整合: rowHints.length / colHints.length と rows/cols の
//   比較で判定できる（validateSizeConsistency）。
// - ヒント総和オーバー: 1行/1列のヒントについて
//   sum(line) + (line.length - 1) （ブロック間の最低1マスの空白）が
//   軸の長さを超えていないかで判定できる（validateLineSum）。
// - 候補生成不能: 総和オーバーをクリアしていても、固定長の軸に
//   対して配置パターンが0件になることはない（ヒントが正しく
//   総和オーバーをクリアしていれば、自由度0でも必ず1通り以上の
//   配置が存在する）。そのため「候補生成不能」は事実上
//   sum-overflow の特殊系であり、ここでは sum-overflow 判定に
//   包含する形で扱う（同じ kind: 'no-candidates' を用意しておき、
//   将来 rowCandidates/colCandidates を実際に生成して0件になる
//   ケース（解析的に判定しづらい複雑な制約が追加された場合）にも
//   対応できる拡張点として残す）。
// ============================================================================

import type {
  GlobalHintError,
  HintCellError,
  HintCellErrorKind,
  HintLineError,
  HintLines,
  HintValidationResult,
} from '@/types';

// ----------------------------------------------------------------------------
// セル単位の検証（ヒント値エラー）
// ----------------------------------------------------------------------------

/**
 * number[][] 化された HintLines を直接検証する。
 * パース済みの値であっても、0・負数・非整数が紛れていないかを
 * 防御的にチェックする（HintEditor のパーサは正数以外を除外するが、
 * PicrossBoard 側のセル編集や将来の入力経路に対する保険として）。
 */
export function validateHintLines(lines: HintLines): readonly HintCellError[] {
  const errors: HintCellError[] = [];
  lines.forEach((line, lineIndex) => {
    line.forEach((value, posInLine) => {
      const kind = classifyNumericError(value);
      if (kind) {
        errors.push({ lineIndex, posInLine, kind, rawToken: String(value) });
      }
    });
  });
  return errors;
}

function classifyNumericError(value: number): HintCellErrorKind | null {
  if (!Number.isFinite(value)) return 'not-a-number';
  if (!Number.isInteger(value)) return 'not-integer';
  if (value <= 0) return 'non-positive';
  return null;
}

/**
 * HintEditor のテキスト入力（生テキスト）を解析し、
 * 「数値として認識できなかったトークン」をセルエラーとして検出する。
 *
 * parseHintText は不正トークンを黙って捨てる実装のため、
 * 「何文字目の何が悪いか」は生テキストの再走査でのみ判定できる。
 * 1行（1ライン）内でのトークンの並び順をそのまま posInLine として扱う
 * （= 捨てられたトークンも含めた「見えている順番」での位置）。
 */
export function validateRawHintText(rawText: string): readonly HintCellError[] {
  const errors: HintCellError[] = [];
  const rawLines = rawText.split('\n');

  rawLines.forEach((rawLine, lineIndex) => {
    const tokens = rawLine
      .trim()
      .split(/[\s,]+/)
      .filter((token) => token !== '');

    tokens.forEach((token, posInLine) => {
      const kind = classifyTokenError(token);
      if (kind) {
        errors.push({ lineIndex, posInLine, kind, rawToken: token });
      }
    });
  });

  return errors;
}

function classifyTokenError(token: string): HintCellErrorKind | null {
  // 数値として解釈できない（数字・小数点・先頭マイナス以外の文字を含む）
  if (!/^-?\d+(\.\d+)?$/.test(token)) return 'not-a-number';
  const value = Number.parseFloat(token);
  if (!Number.isInteger(value)) return 'not-integer';
  if (value <= 0) return 'non-positive';
  return null;
}

// ----------------------------------------------------------------------------
// 行/列単位の検証（ヒント総和オーバー・候補生成不能）
// ----------------------------------------------------------------------------

/**
 * 1行（または1列）のヒントが、軸の長さ `axisLength` に収まるかを検証する。
 * ブロックの数だけ「ブロック間の最低1マスの空白」が必要になるため、
 * 必要最小スペースは sum(line) + (line.length - 1) で計算する。
 *
 * ヒント値そのものが不正（0以下・非整数）な行は、ここでの総和判定の
 * 対象から除外する（セルエラーとして既に報告されているため、
 * 二重にエラーを出して画面が赤くなりすぎるのを避ける）。
 */
export function validateLineSum(
  lines: HintLines,
  axisLength: number,
  type: 'row' | 'col'
): readonly HintLineError[] {
  const errors: HintLineError[] = [];

  lines.forEach((line, index) => {
    if (line.length === 0) return; // ヒントなし（全マス空白）は常に有効
    const hasInvalidValue = line.some((v) => !Number.isInteger(v) || v <= 0);
    if (hasInvalidValue) return; // セルエラー側で報告済み

    const requiredLength = line.reduce((sum, v) => sum + v, 0) + (line.length - 1);
    if (requiredLength > axisLength) {
      const label = type === 'row' ? '行' : '列';
      errors.push({
        type,
        index,
        kind: 'sum-overflow',
        message: `${label}${index + 1}: ヒントの合計（${requiredLength}マス必要）が盤面の${
          type === 'row' ? '幅' : '高さ'
        }（${axisLength}マス）を超えています`,
      });
    }
  });

  return errors;
}

// ----------------------------------------------------------------------------
// 盤面全体の検証（サイズ不整合）
// ----------------------------------------------------------------------------

export function validateSizeConsistency(
  rowHints: HintLines,
  colHints: HintLines,
  rows: number,
  cols: number
): readonly GlobalHintError[] {
  const errors: GlobalHintError[] = [];

  if (rowHints.length !== rows) {
    const diff = rowHints.length - rows;
    errors.push({
      kind: 'row-count-mismatch',
      message:
        diff > 0
          ? `行ヒントが${diff}行多く入力されています（盤面の行数: ${rows}行）`
          : `行ヒントが${-diff}行不足しています（盤面の行数: ${rows}行）`,
    });
  }

  if (colHints.length !== cols) {
    const diff = colHints.length - cols;
    errors.push({
      kind: 'col-count-mismatch',
      message:
        diff > 0
          ? `列ヒントが${diff}列多く入力されています（盤面の列数: ${cols}列）`
          : `列ヒントが${-diff}列不足しています（盤面の列数: ${cols}列）`,
    });
  }

  return errors;
}

// ----------------------------------------------------------------------------
// 統合関数
// App.tsx はこの関数1つを呼ぶだけで、表示に必要な検証結果一式を得られる。
// ----------------------------------------------------------------------------

/**
 * 統合検証関数。App.tsx はこれを1回呼ぶだけで、表示に必要な検証結果
 * 一式（HintValidationResult）を得られる。
 *
 * cellErrors は HintCellError に既に lineIndex/posInLine を持つが、
 * 「行ヒント由来か列ヒント由来か」を区別する情報を持たないため、
 * 呼び出し側（HintEditor）は rowHints用/colHints用を別々に
 * 受け取る必要がある。そのため本関数では rowCellErrors / colCellErrors
 * を別フィールドとして返し、cellErrors はその合算（PicrossBoard側で
 * 「行ヒントのセルか列ヒントのセルか」を自分の描画コンテキストから
 * 判断できるため、行・列を区別せず両方まとめて渡しても問題ない）として
 * 提供する。
 */
export function validateHints(
  rowHints: HintLines,
  colHints: HintLines,
  rows: number,
  cols: number
): HintValidationResult & {
  readonly rowCellErrors: readonly HintCellError[];
  readonly colCellErrors: readonly HintCellError[];
} {
  const rowCellErrors = validateHintLines(rowHints);
  const colCellErrors = validateHintLines(colHints);

  const lineErrors = [
    ...validateLineSum(rowHints, cols, 'row'),
    ...validateLineSum(colHints, rows, 'col'),
  ];

  const globalErrors = validateSizeConsistency(rowHints, colHints, rows, cols);

  const hasError =
    rowCellErrors.length > 0 ||
    colCellErrors.length > 0 ||
    lineErrors.length > 0 ||
    globalErrors.length > 0;

  return {
    cellErrors: [...rowCellErrors, ...colCellErrors],
    rowCellErrors,
    colCellErrors,
    lineErrors,
    globalErrors,
    hasError,
  };
}

/** 指定した行/列インデックスに紐づく LineError を1件だけ取得するヘルパー（UI表示用）。 */
export function findLineError(
  lineErrors: readonly HintLineError[],
  type: 'row' | 'col',
  index: number
): HintLineError | undefined {
  return lineErrors.find((e) => e.type === type && e.index === index);
}

/** 指定したセル(lineIndex, posInLine)に紐づく CellError を1件だけ取得するヘルパー（UI表示用）。 */
export function findCellError(
  cellErrors: readonly HintCellError[],
  lineIndex: number,
  posInLine: number
): HintCellError | undefined {
  return cellErrors.find((e) => e.lineIndex === lineIndex && e.posInLine === posInLine);
}