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
// - 統計情報（試行回数・経過時間・仮定回数・最大深度）は SolverStats として
//   一箇所に集約する。UI側の統計パネル/難易度推定/解答再生はこの構造体だけを
//   見れば必要な情報が揃うことを意図している。
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

/**
 * 解がどの段階で確定したか。
 * - 'humanistic': バックトラックの仮定を一切行わずに解けた（assumptionCount === 0）。
 *   論理パズルとしては「単純」な部類であることが多く、難易度推定の主要な手掛かりになる。
 * - 'backtrack': 1回以上の仮定（分岐の試行）を経て解けた。
 */
export type SolvedBy = 'humanistic' | 'backtrack';

// ----------------------------------------------------------------------------
// SolverStats: solvePicross が公開する統計情報の集約構造体。
//
// イベントの種類ごとに統計フィールドを個別に持たせるのではなく、
// 「進行中/解決/矛盾/解なし」のいずれの SolverEvent も同じ形の stats を
// 持つことで、UI側の統計パネル・実行時間表示・難易度推定・解答再生が
// イベント種別を問わず同じ参照パス（event.stats.xxx）で実装できるようにする。
//
// すべて構造化複製可能なプレーン値（number のみ）で構成し、
// Web Worker への postMessage 転送をそのまま許容する。
// ----------------------------------------------------------------------------
export interface SolverStats {
  /** humanistic法+backtrack法を通算した、これまでの試行回数（従来のcountと同値） */
  readonly count: number;
  /**
   * バックトラック探索で実際に分岐（仮定）を行った回数。
   * 0 であれば、ヒューマンスティック法のみで解けた（または矛盾/解なしに達した）ことを意味する。
   */
  readonly assumptionCount: number;
  /**
   * バックトラック探索中に到達した最大の再帰深度（= 確定を試みた行のインデックスの最大値）。
   * 探索がどれだけ深く潜る必要があったかの指標で、難易度推定や解答再生のステップ数見積もりに使う。
   */
  readonly maxDepth: number;
  /** ソルバー開始（solvePicross呼び出し）からこのイベントが発生するまでの経過時間(ms)。 */
  readonly elapsedMs: number;
}

// ----------------------------------------------------------------------------
// SolverEvent: solvePicross が yield する値の判別ユニオン
//
// すべてのイベントは構造化複製可能（プレーンオブジェクト/配列/数値/文字列のみ）。
// Web Worker 化した際に postMessage でそのまま転送できることを保証するための制約。
// ----------------------------------------------------------------------------

interface SolverEventBase {
  /**
   * humanistic法+backtrack法を通算した、これまでの試行回数。
   * @deprecated 新規実装では `stats.count` を参照すること。
   * 既存コードとの後方互換のために残しているフィールドで、常に stats.count と同値。
   */
  readonly count: number;
  /** イベント発生時点でのフェーズ */
  readonly phase: SolvePhase;
  /** このイベント時点での統計情報。UI統計パネル等はここを単一の参照先とする。 */
  readonly stats: SolverStats;
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
  /**
   * 解がどの段階で確定したか。
   * stats.assumptionCount === 0 の場合は 'humanistic'、それ以外は 'backtrack'。
   * 難易度表示（「論理だけで解けました」/「N回の仮定が必要でした」）に直接使える。
   */
  readonly solvedBy: SolvedBy;
}

/**
 * 論理的矛盾を検出した（ヒューマンスティック法の途中で検出される）。
 * 入力ヒント自体が不正な場合は SolverInvalidHintsEvent を使う。
 *
 * target は常に確定値として提供する（矛盾は必ず特定の行/列に帰属するため）。
 * UI側はnullチェック不要でそのままハイライト対象として利用できる。
 */
export interface SolverContradictionEvent extends SolverEventBase {
  readonly type: 'contradiction';
  readonly message: string;
  readonly target: HintErrorTarget;
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
// 解答再生（Replay）用の補助型
// solvePicross.ts はこれらを一切知らない。useSolver が solvePicross の
// イベント列を drain する際に、表示用のスナップショットとして
// 副産物的に組み立てる UI 層専用の型。
// ----------------------------------------------------------------------------

/**
 * 解答再生の1フレーム分のスナップショット。
 * 元イベントの type / phase / stats をそのまま保持することで、
 * 再生UI側は「このフレーム時点で何が起きていたか」を判別できる。
 * phase は invalid-hints イベントのみ持たないため null を許容する。
 */
export interface ReplayFrame {
  readonly grid: Grid | SolvedGrid;
  readonly type: SolverEvent['type'];
  readonly phase: SolvePhase | null;
  readonly stats: SolverStats | null;
}

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
  /**
   * humanistic+backtrackを通算した試行回数。
   * @deprecated 新規実装では `stats.count` を参照すること。
   */
  readonly count: number;
  /** 直近のSolverEventに付随する統計情報。idle時はundefined。 */
  readonly stats?: SolverStats;
  /** solved時、どの段階で解けたか。solved以外はundefined。 */
  readonly solvedBy?: SolvedBy;
  /**
   * 解答再生用のフレーム列。solve() 実行中に収集された各イベントの
   * 盤面スナップショットを時系列に並べたもの。idle時は空配列。
   * 大規模盤面でのメモリ消費を抑えるため、収集時にダウンサンプリング
   * される場合がある（フレーム数の上限は useSolver 側の実装に委ねる）。
   */
  readonly frames: readonly ReplayFrame[];
}

/** useSolver フックの戻り値（状態 + 操作） */
export interface UseSolverResult extends UseSolverState {
  readonly solve: (hints: PicrossHints) => void;
  readonly reset: () => void;
}

// ----------------------------------------------------------------------------
// UI層（新ヒント入力システム）が使う型
// ソルバー本体 (solvePicross.ts) はこれらを一切知らない。
// ----------------------------------------------------------------------------

/** 行ヒント or 列ヒントの集合。各要素が1行/1列分のヒント配列。 */
export type HintLines = number[][];

/** 盤面サイズ */
export interface BoardSize {
  readonly rows: number;
  readonly cols: number;
}

// ----------------------------------------------------------------------------
// ヒント入力の静的検証（UI層専用）
//
// solvePicross を実行する前に判定できるエラーをここに集約する。
// solvePicross.ts 自体はこれらの型を一切知らない（無改修方針）。
//
// 設計方針:
// - 「セル単位のエラー」（不正トークン・0・負数・小数）と
//   「行/列単位のエラー」（総和オーバー・候補生成不能）と
//   「盤面全体のエラー」（行数/列数不一致）を分けて表現する。
//   表示側（HintEditor / PicrossBoard / SolverPanel）がそれぞれ
//   異なる粒度でハイライトするため。
// ----------------------------------------------------------------------------

/** セル単位の入力形式エラー種別 */
export type HintCellErrorKind =
  | 'not-a-number' // 数字として解釈できない（不正文字・空欄を除くトークン）
  | 'not-integer' // 小数
  | 'non-positive'; // 0 または負数

/** 1つのヒント値（セル）に紐づくエラー */
export interface HintCellError {
  readonly lineIndex: number;
  readonly posInLine: number;
  readonly kind: HintCellErrorKind;
  /** 元の入力トークン（表示・デバッグ用） */
  readonly rawToken: string;
}

/** 1行/1列単位のエラー種別（セル単体の問題ではなく、ライン全体として成立しないもの） */
export type HintLineErrorKind =
  | 'sum-overflow' // ヒント総和 + 区切り数 が軸の長さを超える
  | 'no-candidates'; // 制約を満たす配置が1件も存在しない

/** 1行/1列に紐づくエラー（セルエラーとは独立） */
export interface HintLineError {
  readonly type: 'row' | 'col';
  readonly index: number;
  readonly kind: HintLineErrorKind;
  readonly message: string;
}

/** 盤面全体に関わるエラー種別（特定の行/列に帰属しない） */
export type GlobalHintErrorKind =
  | 'row-count-mismatch' // rowHints.length !== rows
  | 'col-count-mismatch'; // colHints.length !== cols

/** 盤面全体に紐づくエラー */
export interface GlobalHintError {
  readonly kind: GlobalHintErrorKind;
  readonly message: string;
}

/**
 * ヒント入力全体の検証結果。
 * App.tsx が rowHints/colHints/rows/cols から都度計算し、
 * 各表示コンポーネントへ配布する「エラーの単一ソース」。
 */
export interface HintValidationResult {
  readonly cellErrors: readonly HintCellError[];
  readonly lineErrors: readonly HintLineError[];
  readonly globalErrors: readonly GlobalHintError[];
  /** いずれかのエラーが1件でも存在するか（solve実行の可否判定に使う） */
  readonly hasError: boolean;
}

// ----------------------------------------------------------------------------
// ヒント入力UI（表示/編集モード切替・エラージャンプ）が使う型
// ソルバー本体 (solvePicross.ts) はこれらの型を一切知らない。
// ----------------------------------------------------------------------------

/**
 * 「行ヒントの何行目」または「列ヒントの何列目」を指す、エラージャンプの
 * 移動先指定。HintErrorTarget と同形だが、こちらは「エラー専用」ではなく
 * 「UIが注目すべき行/列」という汎用の意味で使うため、別名で公開する
 * （将来エラー以外の用途、例えば検索・フォーカス移動にも使い回せるように）。
 */
export interface HintLineFocusTarget {
  readonly type: 'row' | 'col';
  readonly index: number;
}