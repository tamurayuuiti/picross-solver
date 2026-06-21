// ============================================================================
// picross.types.ts
// Picrossソルバー（コアロジック）とUI層の間で共有する型定義。
//
// 設計方針:
// - このファイルは window や DOM に一切依存しない（Web Worker からも import 可能）。
// - セルの値は -1（未確定） / 0（空） / 1（塗り）の3値に統一する。
// - 統計情報は SolverStats として一箇所に集約する。
// ============================================================================

export type CellValue = -1 | 0 | 1;
export type Line = readonly CellValue[];
export type Grid = readonly Line[];
export type SolvedGrid = readonly (readonly (0 | 1)[])[];
export type LineHint = readonly number[];

export interface PicrossHints {
  readonly rowHints: readonly LineHint[];
  readonly colHints: readonly LineHint[];
}

export interface HintErrorTarget {
  readonly type: 'row' | 'col';
  readonly index: number;
}

export type SolvePhase = 'humanistic' | 'backtrack';
export type SolvedBy = 'humanistic' | 'backtrack';

export interface SolverStats {
  readonly count: number;
  readonly assumptionCount: number;
  readonly maxDepth: number;
  readonly elapsedMs: number;
}

interface SolverEventBase {
  readonly count: number;
  readonly phase: SolvePhase;
  readonly stats: SolverStats;
}

export interface SolverProgressEvent extends SolverEventBase {
  readonly type: 'progress';
  readonly grid: Grid;
}

export interface SolverSolvedEvent extends SolverEventBase {
  readonly type: 'solved';
  readonly grid: SolvedGrid;
  readonly solvedBy: SolvedBy;
}

export interface SolverContradictionEvent extends SolverEventBase {
  readonly type: 'contradiction';
  readonly message: string;
  readonly target: HintErrorTarget;
  readonly grid?: Grid;
}

export interface SolverUnsolvableEvent extends SolverEventBase {
  readonly type: 'unsolvable';
}

export interface SolverInvalidHintsEvent {
  readonly type: 'invalid-hints';
  readonly errors: readonly string[];
  readonly errorTargets: readonly HintErrorTarget[];
}

export type SolverEvent =
  | SolverProgressEvent
  | SolverSolvedEvent
  | SolverContradictionEvent
  | SolverUnsolvableEvent
  | SolverInvalidHintsEvent;

export interface SolvePicrossOptions {
  readonly progressInterval?: number;
}

export type PicrossSolverGenerator = Generator<SolverEvent, void, void>;

export interface SolveRunnerOptions {
  readonly maxTrialCount?: number;
  readonly stepsPerTick?: number;
}

export type SolveStopReason = 'trial-limit-exceeded' | 'cancelled';

export interface ReplayFrame {
  readonly grid: Grid | SolvedGrid;
  readonly type: SolverEvent['type'];
  readonly phase: SolvePhase | null;
  readonly stats: SolverStats | null;
}

export type SolverStatus =
  | 'idle'
  | 'running'
  | 'solved'
  | 'unsolvable'
  | 'contradiction'
  | 'invalid-hints';

export interface UseSolverState {
  readonly status: SolverStatus;
  readonly grid: Grid | SolvedGrid | null;
  readonly message?: string;
  readonly target?: HintErrorTarget;
  readonly count: number;
  readonly stats?: SolverStats;
  readonly solvedBy?: SolvedBy;
  readonly frames: readonly ReplayFrame[];
}

export interface UseSolverResult extends UseSolverState {
  readonly solve: (hints: PicrossHints) => void;
  readonly reset: () => void;
}

export type HintLines = number[][];

export interface BoardSize {
  readonly rows: number;
  readonly cols: number;
}

// ----------------------------------------------------------------------------
// ヒント入力の静的検証（UI層専用）
// ----------------------------------------------------------------------------

export type HintCellErrorKind = 'not-a-number' | 'not-integer' | 'non-positive';

export interface HintCellError {
  readonly lineIndex: number;
  readonly posInLine: number;
  readonly kind: HintCellErrorKind;
  readonly rawToken: string;
}

export type HintLineErrorKind = 'sum-overflow' | 'no-candidates';

export interface HintLineError {
  readonly type: 'row' | 'col';
  readonly index: number;
  readonly kind: HintLineErrorKind;
  readonly message: string;
}

export interface HintValidationResult {
  readonly cellErrors: readonly HintCellError[];
  readonly lineErrors: readonly HintLineError[];
  readonly hasError: boolean;
}

export interface HintLineFocusTarget {
  readonly type: 'row' | 'col';
  readonly index: number;
}

export type HintErrorSource = 'validation' | 'solver-contradiction' | 'solver-unsolvable';

export interface HintErrorFocus extends HintLineFocusTarget {
  readonly source: HintErrorSource;
  readonly requestId: number;
}