// ============================================================================
// picross.types.ts
// Picrossソルバー（コアロジック）とUI層の間で共有する型定義。
//
// 設計方針:
// - このファイルは window や DOM に一切依存しない（Web Worker からも import 可能）。
// - セルの値は -1（未確定） / 0（空） / 1（塗り）の3値に統一する。
//   旧実装では null と -1 が「未確定」として混在していたが、TS版では -1 のみを使う。
// - ヒントの「矛盾検証」はソルバーの責務ではなく UI 層の責務とする。
//   ソルバーは「検証済みのヒント」を受け取って解くことだけに専念する。
// ============================================================================

/** 1セルの状態。-1: 未確定, 0: 空白, 1: 塗り */
export type CellValue = -1 | 0 | 1;

/** 1行・1列分のセル配列 */
export type Line = readonly CellValue[];

/** 確定済み/未確定混在の盤面（探索途中の状態を表す） */
export type Grid = readonly Line[];

/** 完全に確定した解の盤面（-1 を含まない） */
export type SolvedGrid = readonly (readonly (0 | 1)[])[];

/** 1行（または1列）分のヒント。例: [2, 1] は「2マス連続→1マス連続」 */
export type LineHint = readonly number[];

/** パズル全体のヒント定義 */
export interface PicrossHints {
  /** 各行のヒント。長さ === height */
  readonly rowHints: readonly LineHint[];
  /** 各列のヒント。長さ === width */
  readonly colHints: readonly LineHint[];
}

/** ヒントの矛盾箇所を指す位置情報（UI側でフォーカス/ハイライトに使う） */
export interface HintErrorTarget {
  readonly type: 'row' | 'col';
  readonly index: number;
}

// ----------------------------------------------------------------------------
// ソルバーの内部フェーズ（呼び出し側がUI表示を分岐させたい場合に利用できる）
// ----------------------------------------------------------------------------

/** ソルバーが現在どのフェーズにいるか */
export type SolvePhase = 'humanistic' | 'backtrack';

// ----------------------------------------------------------------------------
// SolverEvent: solvePicross が yield する値の判別ユニオン
//
// すべてのイベントは構造化複製可能（プレーンオブジェクト/配列/数値/文字列のみ）。
// Web Worker 化した際に postMessage でそのまま転送できることを保証するための制約。
// ----------------------------------------------------------------------------

interface SolverEventBase {
  /** humanistic法+backtrack法を通算した、これまでの試行回数 */
  readonly count: number;
  /** イベント発生時点でのフェーズ */
  readonly phase: SolvePhase;
}

/** 探索途中の盤面スナップショット（まだ解は確定していない） */
export interface SolverProgressEvent extends SolverEventBase {
  readonly type: 'progress';
  readonly grid: Grid;
}

/** 解を発見した（探索終了） */
export interface SolverSolvedEvent extends SolverEventBase {
  readonly type: 'solved';
  readonly grid: SolvedGrid;
}

/**
 * 論理的矛盾を検出した（ヒューマンスティック法 or バックトラック法の途中）。
 * 入力ヒント自体が不正な場合は SolverInvalidHintsEvent を使う。
 */
export interface SolverContradictionEvent extends SolverEventBase {
  readonly type: 'contradiction';
  readonly message: string;
  readonly target?: HintErrorTarget;
  /** 矛盾検出時点での盤面（デバッグ表示用、任意） */
  readonly grid?: Grid;
}

/** 全探索を尽くしたが解が存在しなかった */
export interface SolverUnsolvableEvent extends SolverEventBase {
  readonly type: 'unsolvable';
}

/**
 * 入力ヒント自体に矛盾がある（合計値不一致・空ヒント・サイズ超過など）。
 * solvePicross を呼ぶ前に検証する想定だが、ジェネレーター内部でも
 * 防御的に同種のチェックを行えるようにイベント型として用意しておく。
 */
export interface SolverInvalidHintsEvent {
  readonly type: 'invalid-hints';
  readonly errors: readonly string[];
  readonly errorTargets: readonly HintErrorTarget[];
}

/** solvePicross ジェネレーターが yield する値全体 */
export type SolverEvent =
  | SolverProgressEvent
  | SolverSolvedEvent
  | SolverContradictionEvent
  | SolverUnsolvableEvent
  | SolverInvalidHintsEvent;

// ----------------------------------------------------------------------------
// solvePicross のオプション
// ----------------------------------------------------------------------------

export interface SolvePicrossOptions {
  /**
   * バックトラック探索において、何手ごとに progress イベントを yield するか。
   * 1 にすると毎手 yield する（UIの描画負荷とのトレードオフ）。
   * 既定値は呼び出し側（solvePicross実装）に委ねる。
   */
  readonly progressInterval?: number;
}

// ----------------------------------------------------------------------------
// 駆動制御層（UI/Worker側）が使うための補助型
// ----------------------------------------------------------------------------

/** solvePicross が返すジェネレーターの型 */
export type PicrossSolverGenerator = Generator<SolverEvent, void, void>;

/**
 * ジェネレーターを一定ペースで駆動する「ランナー」が持つべき設定。
 * React の useEffect / カスタムフックや、将来の Worker 駆動コードが
 * この型をもとに「何ステップずつ進めるか」「上限で止めるか」を判断する。
 * （solvePicross 自体はこれを知らない。あくまでUI/駆動層の型。）
 */
export interface SolveRunnerOptions {
  /** この試行回数を超えたら駆動を中断する（解なし扱いにせず単に停止する） */
  readonly maxTrialCount?: number;
  /** 1回のタイマーティックで何イベント分まとめて進めるか */
  readonly stepsPerTick?: number;
}

/** 駆動層が中断した理由（解発見/解なし/矛盾以外の理由で止まった場合） */
export type SolveStopReason = 'trial-limit-exceeded' | 'cancelled';

// ----------------------------------------------------------------------------
// UI層 (useSolver) が公開する型
// ソルバー本体 (solvePicross.ts) はこれらの型を一切知らない。
// ----------------------------------------------------------------------------

/** useSolver フックが管理する解探索の状態種別 */
export type SolverStatus =
  | 'idle'
  | 'running'
  | 'solved'
  | 'unsolvable'
  | 'contradiction'
  | 'invalid-hints';

/** useSolver フックの公開ステート */
export interface UseSolverState {
  readonly status: SolverStatus;
  /** 表示用の盤面。idle時はnull */
  readonly grid: Grid | SolvedGrid | null;
  /** contradiction / invalid-hints 時のメッセージ */
  readonly message?: string;
  /** contradiction時、矛盾箇所（行/列）の位置情報 */
  readonly target?: HintErrorTarget;
  /** humanistic+backtrackを通算した試行回数 */
  readonly count: number;
}

/** useSolver フックの戻り値（状態 + 操作） */
export interface UseSolverResult extends UseSolverState {
  readonly solve: (hints: PicrossHints) => void;
  readonly reset: () => void;
}