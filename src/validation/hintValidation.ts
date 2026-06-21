// ============================================================================
// hintValidation.ts
// ヒント入力（rowHints / colHints）に対する「静的検証」を一元的に担う。
//
// 設計変更（ヒント主導）:
// - 盤面サイズはヒント行数（length）から動的に決定されるため、
//   従来の「サイズ不整合エラー（GlobalError）」は発生しなくなり、削除しました。
// - 以下の本質的なエラーのみを維持します：
//   - 入力形式エラー（数字以外・小数・負数）
//   - ヒント総和オーバー
// ============================================================================

import type {
  HintCellError,
  HintCellErrorKind,
  HintLineError,
  HintLines,
  HintValidationResult,
} from '@/types';

// ----------------------------------------------------------------------------
// セル単位の検証（ヒント値エラー）
// ----------------------------------------------------------------------------

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
  if (!/^-?\d+(\.\d+)?$/.test(token)) return 'not-a-number';
  const value = Number.parseFloat(token);
  if (!Number.isInteger(value)) return 'not-integer';
  if (value <= 0) return 'non-positive';
  return null;
}

// ----------------------------------------------------------------------------
// 行/列単位の検証（ヒント総和オーバー・候補生成不能）
// ----------------------------------------------------------------------------

export function validateLineSum(
  lines: HintLines,
  axisLength: number,
  type: 'row' | 'col'
): readonly HintLineError[] {
  const errors: HintLineError[] = [];

  lines.forEach((line, index) => {
    if (line.length === 0) return;
    const hasInvalidValue = line.some((v) => !Number.isInteger(v) || v <= 0);
    if (hasInvalidValue) return;

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
// 統合関数
// ----------------------------------------------------------------------------

export function validateHints(
  rowHints: HintLines,
  colHints: HintLines
): HintValidationResult & {
  readonly rowCellErrors: readonly HintCellError[];
  readonly colCellErrors: readonly HintCellError[];
} {
  const rows = rowHints.length;
  const cols = colHints.length;

  const rowCellErrors = validateHintLines(rowHints);
  const colCellErrors = validateHintLines(colHints);

  const lineErrors = [
    ...validateLineSum(rowHints, cols, 'row'),
    ...validateLineSum(colHints, rows, 'col'),
  ];

  const hasError =
    rowCellErrors.length > 0 ||
    colCellErrors.length > 0 ||
    lineErrors.length > 0;

  return {
    cellErrors: [...rowCellErrors, ...colCellErrors],
    rowCellErrors,
    colCellErrors,
    lineErrors,
    hasError,
  };
}

export function findLineError(
  lineErrors: readonly HintLineError[],
  type: 'row' | 'col',
  index: number
): HintLineError | undefined {
  return lineErrors.find((e) => e.type === type && e.index === index);
}

export function findCellError(
  cellErrors: readonly HintCellError[],
  lineIndex: number,
  posInLine: number
): HintCellError | undefined {
  return cellErrors.find((e) => e.lineIndex === lineIndex && e.posInLine === posInLine);
}