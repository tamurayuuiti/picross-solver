// ============================================================================
// solvePicross.ts
// Picrossソルバーのコアロジック（純粋関数 + ジェネレーター）。
//
// 設計方針:
// - window や DOM には一切触れない。入力はヒントのみ、出力は SolverEvent の列。
// - ヒントの矛盾検証（合計値不一致・空ヒント等）はこの関数の責務外。
//   呼び出し側（UIフックなど）が事前に検証し、検証済みのヒントだけを渡すこと。
//   検証ロジックは別ファイル（例: validateHints.ts）に分離する想定。
// - 試行回数の上限判定・タイマー駆動・段階的yieldの間引きはUI/駆動層の責務。
//   このファイルが持つのは「何手ごとにprogressイベントを出すか」という
//   progressInterval オプションのみ。
// - Web Worker化する場合、このファイルをそのまま worker 側にバンドルし、
//   呼び出し側で `for (const event of solvePicross(hints)) postMessage(event)`
//   のように橋渡しするだけで済むよう、yield する値は構造化複製可能な
//   プレーンオブジェクトのみで構成している。
// ============================================================================

import type {
  CellValue,
  Line,
  Grid,
  SolvedGrid,
  LineHint,
  PicrossHints,
  SolverEvent,
  SolvePicrossOptions,
  PicrossSolverGenerator,
} from '@/types/index';

const DEFAULT_PROGRESS_INTERVAL = 10;

// ----------------------------------------------------------------------------
// ラインがヒントと完全一致するか判定
// ----------------------------------------------------------------------------
function isValidLine(line: Line, hints: LineHint): boolean {
  const segments: number[] = [];
  let count = 0;
  for (const cell of line) {
    if (cell === 1) {
      count++;
    } else if (count > 0) {
      segments.push(count);
      count = 0;
    }
  }
  if (count > 0) segments.push(count);
  if (segments.length !== hints.length) return false;
  return segments.every((seg, i) => seg === hints[i]);
}

// ----------------------------------------------------------------------------
// 途中まで埋まったラインがヒントに矛盾しないか判定（前方一致チェック）
// ----------------------------------------------------------------------------
function isValidSoFarLine(line: Line, hints: LineHint): boolean {
  const segments: number[] = [];
  let count = 0;
  for (const cell of line) {
    if (cell === 1) {
      count++;
    } else if (count > 0) {
      segments.push(count);
      count = 0;
    }
  }
  if (count > 0) segments.push(count);
  for (let i = 0; i < segments.length; i++) {
    if (i >= hints.length || segments[i] > hints[i]) return false;
  }
  return segments.length <= hints.length;
}

// ----------------------------------------------------------------------------
// 指定された長さとヒントから、可能なラインの全パターンを生成
// ----------------------------------------------------------------------------
function getLinePossibilities(length: number, hints: LineHint): CellValue[][] {
  function helper(remainingHints: readonly number[], idx: number, line: CellValue[]): CellValue[][] {
    if (remainingHints.length === 0) {
      if (line.length <= length) {
        const padded = line.concat(Array(length - line.length).fill(0 as CellValue));
        return [padded];
      }
      return [];
    }
    const result: CellValue[][] = [];
    const sumRest = remainingHints.reduce((a, b) => a + b, 0);
    const maxStart = length - sumRest - (remainingHints.length - 1);
    for (let i = idx; i <= maxStart; i++) {
      const gap: CellValue[] = Array(i - line.length).fill(0 as CellValue);
      const block: CellValue[] = Array(remainingHints[0]).fill(1 as CellValue);
      let newLine: CellValue[] = line.concat(gap, block);
      if (newLine.length < length) newLine = newLine.concat([0 as CellValue]);
      result.push(...helper(remainingHints.slice(1), newLine.length, newLine));
    }
    return result;
  }
  return helper(hints, 0, []);
}

// ----------------------------------------------------------------------------
// 既に確定しているセル情報で候補を絞り込む
// fixed の各要素: -1 (未確定) または 0/1 (確定値)
// ----------------------------------------------------------------------------
function filterPossibilitiesByFixed(
  possibilities: readonly CellValue[][],
  fixed: Line
): CellValue[][] {
  return possibilities.filter((poss) =>
    poss.every((v, i) => fixed[i] === undefined || fixed[i] === -1 || fixed[i] === v)
  );
}

// ----------------------------------------------------------------------------
// 候補リストから、全候補で同じ値になるセルを確定値として抽出
// 戻り値の各要素: -1 (未確定/まだ全候補で一致していない) または 0/1 (確定)
// ----------------------------------------------------------------------------
function getCertaintiesFromPoss(possList: readonly CellValue[][]): CellValue[] | null {
  if (!possList || possList.length === 0 || possList[0].length === 0) return null;
  const length = possList[0].length;
  return Array.from({ length }, (_, i) => {
    const values = new Set(possList.map((row) => row[i]));
    return values.size === 1 ? (values.values().next().value as CellValue) : (-1 as CellValue);
  });
}

interface HumanisticResult {
  readonly grid: Grid;
  readonly rowPoss: readonly CellValue[][][];
  readonly colPoss: readonly CellValue[][][];
  readonly count: number;
  readonly error?: string;
  readonly errorTarget?: { type: 'row' | 'col'; index: number };
}

// ----------------------------------------------------------------------------
// ヒューマンスティック法（人間的な論理）で確定できるセルを埋める
// ----------------------------------------------------------------------------
function applyHumanistic(
  rowHints: readonly LineHint[],
  colHints: readonly LineHint[]
): HumanisticResult {
  const height = rowHints.length;
  const width = colHints.length;
  const grid: CellValue[][] = Array.from({ length: height }, () =>
    Array(width).fill(-1 as CellValue)
  );

  const rowPoss: CellValue[][][] = rowHints.map((h) => getLinePossibilities(width, h));
  const colPoss: CellValue[][][] = colHints.map((h) => getLinePossibilities(height, h));

  let changed = true;
  let count = 0;
  let dirtyRows = Array(height).fill(true);
  let dirtyCols = Array(width).fill(true);

  while (changed) {
    changed = false;
    count++;

    for (let i = 0; i < height; i++) {
      if (dirtyRows[i]) {
        rowPoss[i] = filterPossibilitiesByFixed(rowPoss[i], grid[i]);
        if (rowPoss[i].length === 0) {
          return {
            grid,
            rowPoss,
            colPoss,
            count,
            error: `行${i + 1}で矛盾`,
            errorTarget: { type: 'row', index: i },
          };
        }
      }
    }

    const rowCerts: (CellValue[] | null)[] = Array(height).fill(null);
    for (let i = 0; i < height; i++) {
      if (dirtyRows[i]) {
        rowCerts[i] = getCertaintiesFromPoss(rowPoss[i]);
      }
    }
    for (let i = 0; i < height; i++) {
      const cert = rowCerts[i];
      if (!cert) continue;
      for (let j = 0; j < width; j++) {
        if (cert[j] !== -1 && grid[i][j] === -1) {
          grid[i][j] = cert[j];
          changed = true;
          dirtyCols[j] = true;
        }
      }
    }

    for (let j = 0; j < width; j++) {
      if (dirtyCols[j]) {
        const col = grid.map((row) => row[j]);
        colPoss[j] = filterPossibilitiesByFixed(colPoss[j], col);
        if (colPoss[j].length === 0) {
          return {
            grid,
            rowPoss,
            colPoss,
            count,
            error: `列${j + 1}で矛盾`,
            errorTarget: { type: 'col', index: j },
          };
        }
      }
    }

    const colCerts: (CellValue[] | null)[] = Array(width).fill(null);
    for (let j = 0; j < width; j++) {
      if (dirtyCols[j]) {
        colCerts[j] = getCertaintiesFromPoss(colPoss[j]);
      }
    }
    for (let j = 0; j < width; j++) {
      const cert = colCerts[j];
      if (!cert) continue;
      for (let i = 0; i < height; i++) {
        if (cert[i] !== -1 && grid[i][j] === -1) {
          grid[i][j] = cert[i];
          changed = true;
          dirtyRows[i] = true;
        }
      }
    }

    dirtyRows = dirtyRows.map(() => false);
    dirtyCols = dirtyCols.map(() => false);
  }

  return { grid, rowPoss, colPoss, count };
}

// ----------------------------------------------------------------------------
// solvePicross: ピクロスを解くジェネレーター本体
//
// 公開API:
//   for (const event of solvePicross({ rowHints, colHints })) { ... }
//
// 呼び出し側がジェネレーターを自分のペースで .next() することで、
// 同期的にも・タイマー/rAFで間引いても・Worker内で回しても利用できる。
// ----------------------------------------------------------------------------
export function* solvePicross(
  hints: PicrossHints,
  options: SolvePicrossOptions = {}
): PicrossSolverGenerator {
  const { rowHints, colHints } = hints;
  const progressInterval = options.progressInterval ?? DEFAULT_PROGRESS_INTERVAL;

  const height = rowHints.length;
  const width = colHints.length;

  // --- フェーズ1: ヒューマンスティック法で埋められるだけ埋める ---
  const humanisticResult = applyHumanistic(rowHints, colHints);
  if (humanisticResult.error) {
    const event: SolverEvent = {
      type: 'contradiction',
      message: humanisticResult.error,
      target: humanisticResult.errorTarget,
      grid: humanisticResult.grid,
      count: humanisticResult.count,
      phase: 'humanistic',
    };
    yield event;
    return;
  }

  const humanisticCount = humanisticResult.count;

  // --- フェーズ2: バックトラック探索 ---
  const grid: CellValue[][] = humanisticResult.grid.map((row) => [...row]);
  const rowCandidates: CellValue[][][] = humanisticResult.rowPoss.map((poss, i) =>
    filterPossibilitiesByFixed(poss, grid[i])
  );

  const trialCount = { value: 0 };

  function* backtrack(currentGrid: CellValue[][], rowIdx: number): Generator<SolverEvent, boolean, void> {
    if (rowIdx === height) {
      for (let j = 0; j < width; j++) {
        const col = currentGrid.map((row) => row[j]);
        if (!isValidLine(col, colHints[j])) {
          return false;
        }
      }
      const solved: SolvedGrid = currentGrid.map((row) => row.map((c) => (c === -1 ? 0 : c) as 0 | 1));
      yield {
        type: 'solved',
        grid: solved,
        count: humanisticCount + trialCount.value,
        phase: 'backtrack',
      };
      return true;
    }

    for (const candidate of rowCandidates[rowIdx]) {
      const newGrid = currentGrid.map((row) => [...row]);
      newGrid[rowIdx] = [...candidate];

      let valid = true;
      for (let j = 0; j < width; j++) {
        const colSoFar = newGrid.slice(0, rowIdx + 1).map((row) => row[j]);
        if (!isValidSoFarLine(colSoFar, colHints[j])) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      trialCount.value++;

      const result = yield* backtrack(newGrid, rowIdx + 1);
      if (result) return true;

      if (progressInterval > 0 && trialCount.value % progressInterval === 0) {
        yield {
          type: 'progress',
          grid: newGrid,
          count: humanisticCount + trialCount.value,
          phase: 'backtrack',
        };
      }
    }

    return false;
  }

  let found = false;
  for (const event of backtrack(grid, 0)) {
    yield event;
    if (event.type === 'solved') {
      found = true;
      break;
    }
  }

  if (!found) {
    yield {
      type: 'unsolvable',
      count: humanisticCount + trialCount.value,
      phase: 'backtrack',
    };
  }
}