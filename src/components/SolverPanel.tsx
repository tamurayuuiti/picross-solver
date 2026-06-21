// ============================================================================
// SolverPanel.tsx
// 既存の useSolver（→ solvePicross.ts）を駆動し、結果を PicrossBoard に
// 渡して表示するパネル。新ヒントUIから得た rowHints/colHints をそのまま
// solve() に渡すだけで接続する。solvePicross.ts のジェネレーター駆動ロジック
// は無改修（useSolverはstats/frames伝播のみ拡張）。
//
// 情報設計（ユーザーの動線に沿った配置 - 今回の修正で最適化）:
//   入力 → 実行（操作バー） → 結果確認（矛盾アラート / 盤面）
//        → 解答再生（折りたたみ、solved/unsolvable時）★盤面の直下に引き上げ
//        → 統計確認（折りたたみ） ★最下部へ配置換え
//
// 変更点（解答再生の完全実装）:
// - useSolver が公開する frames（ReplayFrame[]）を使い、再生・一時停止・
//   スライダー・ステップ表示を備えた ReplayPanel を実装した。
// - 再生中は PicrossBoard に渡す grid を「現在の再生フレームの盤面」に
//   差し替える。再生を止める（パネルを閉じる）と、実際の solve 結果の
//   盤面（useSolver の grid）にそのまま戻る。
// - 再生のオン/オフと現在フレーム位置は SolverPanel のローカル state として
//   持つ。useSolver / solvePicross.ts には一切手を加えていない。
// - 自動再生は setInterval で一定間隔ごとに1フレーム進める単純な実装。
//   末尾に到達したら自動停止する。
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type {
  Grid,
  HintCellError,
  HintErrorTarget,
  HintLineFocusTarget,
  HintLines,
  HintValidationResult,
  ReplayFrame,
  SolvedBy,
  SolvedGrid,
  SolverStats,
} from '../types';
import { useSolver } from '@/hooks/useSolver';
import { PicrossBoard } from './PicrossBoard';

/** App.tsx の validateHints が返す拡張結果（rowCellErrors/colCellErrorsを含む）。 */
interface HintValidationWithCellSplit extends HintValidationResult {
  readonly rowCellErrors: readonly HintCellError[];
  readonly colCellErrors: readonly HintCellError[];
}

interface SolverPanelProps {
  readonly rowHints: HintLines;
  readonly colHints: HintLines;
  readonly onRowHintsChange: (lines: HintLines) => void;
  readonly onColHintsChange: (lines: HintLines) => void;
  /** 現在のsolver盤面状態をサイドバーのプレビュー等へ伝播するための通知。任意。 */
  readonly onGridChange?: (grid: Grid | SolvedGrid | null) => void;
  /** App.tsx で計算された静的検証結果。solve実行のブロック判定・エラー表示に使う。 */
  readonly validation: HintValidationWithCellSplit;
  /** エラー一覧等からの「この行/列に注目」指示。PicrossBoardへそのまま橋渡しする。 */
  readonly focusTarget?: HintLineFocusTarget | null;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return '待機中';
    case 'running':
      return '解析中...';
    case 'solved':
      return '解けました';
    case 'unsolvable':
      return '解なし';
    case 'contradiction':
      return 'ヒントに矛盾';
    case 'invalid-hints':
      return 'ヒントが不正';
    default:
      return status;
  }
}

function statusDotClass(status: string): string {
  switch (status) {
    case 'solved':
      return 'bg-emerald-500';
    case 'running':
      return 'bg-amber-500';
    case 'unsolvable':
    case 'contradiction':
    case 'invalid-hints':
      return 'bg-red-500';
    default:
      return 'bg-slate-300';
  }
}

function phaseLabel(phase: ReplayFrame['phase']): string {
  if (phase === 'humanistic') return 'humanistic';
  if (phase === 'backtrack') return 'backtrack';
  return '-';
}

function frameTypeLabel(type: ReplayFrame['type']): string {
  switch (type) {
    case 'progress':
      return '探索中';
    case 'solved':
      return '解確定';
    case 'contradiction':
      return '矛盾検出';
    default:
      return type;
  }
}

// ----------------------------------------------------------------------------
// 静的エラー集約バナー
// 「実行」フェーズの直前に表示する全体エラー。solvePicrossを呼ぶ前に
// 判明している問題（サイズ不整合・ヒント総和オーバー・入力形式エラー）を
// まとめて伝え、「なぜ解けないか」を実行前から把握できるようにする。
// 個別の詳細は HintEditor / PicrossBoard 側の局所表示に譲り、ここでは
// 「件数 + 種別ごとの要約」のみを示す（情報量を絞り、過剰な赤化を避ける）。
// ----------------------------------------------------------------------------
function StaticErrorBanner({ validation }: { readonly validation: HintValidationWithCellSplit }) {
  const cellErrorCount = validation.rowCellErrors.length + validation.colCellErrors.length;
  const lineErrorCount = validation.lineErrors.length;
  const globalErrorCount = validation.globalErrors.length;

  const summaries: string[] = [];
  if (globalErrorCount > 0) summaries.push(`盤面サイズの不一致（${globalErrorCount}件）`);
  if (lineErrorCount > 0) summaries.push(`ヒントの合計が盤面サイズを超えている行/列（${lineErrorCount}件）`);
  if (cellErrorCount > 0) summaries.push(`入力値の形式エラー（${cellErrorCount}件）`);

  if (summaries.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span className="mt-0.5 flex-none rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
        !
      </span>
      <div className="space-y-0.5">
        <p className="font-medium">入力内容に問題があるため、解析を実行できません</p>
        <ul className="list-inside list-disc text-xs text-amber-700">
          {summaries.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="text-xs text-amber-600">
          左側のヒント入力欄、または盤面に隣接するヒントセルの赤枠箇所を確認してください。
        </p>
      </div>
    </div>
  );
}
// ----------------------------------------------------------------------------
// 矛盾アラート
// 「結果確認」フェーズの一部として、操作バー直下に常時表示（発生時のみ）。
// 折りたたみにしない理由: エラーは気づく必要があるため。
// ----------------------------------------------------------------------------
function ContradictionAlert({
  message,
  target,
}: {
  readonly message: string;
  readonly target?: HintErrorTarget;
}) {
  const targetLabel = target
    ? target.type === 'row'
      ? `行 ${target.index + 1}`
      : `列 ${target.index + 1}`
    : null;

  return (
    <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <span className="mt-0.5 flex-none rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
        !
      </span>
      <div className="space-y-0.5">
        <p className="font-medium">{message}</p>
        {targetLabel && <p className="text-xs text-red-600">矛盾箇所: {targetLabel}</p>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 統計パネル（折りたたみ式）
// 「統計確認」フェーズ。盤面のすぐ下、デフォルトは閉じる。
// solvedBy によって「論理だけで解けた」/「N回の仮定が必要だった」の
// 難易度的な一言を添える（将来の難易度表示の足がかり）。
// ----------------------------------------------------------------------------
function StatsPanel({ stats, solvedBy }: { readonly stats: SolverStats; readonly solvedBy?: SolvedBy }) {
  const [open, setOpen] = useState(false);

  const difficultyHint =
    solvedBy === 'humanistic'
      ? '論理だけで解けました（仮定なし）'
      : solvedBy === 'backtrack'
        ? `${stats.assumptionCount}回の仮定を経て解けました`
        : null;

  return (
    <div className="rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span>統計情報</span>
        <span className="text-xs text-slate-400">{open ? '▲ 閉じる' : '▼ 表示'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-3 py-3">
          {difficultyHint && (
            <p className="mb-3 text-xs font-medium text-slate-500">{difficultyHint}</p>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">実行時間</dt>
              <dd className="font-mono font-medium">{stats.elapsedMs.toFixed(1)} ms</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">総試行数</dt>
              <dd className="font-mono font-medium">{stats.count}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">仮定回数</dt>
              <dd className="font-mono font-medium">{stats.assumptionCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">最大探索深度</dt>
              <dd className="font-mono font-medium">{stats.maxDepth}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">使用フェーズ</dt>
              <dd className="font-mono font-medium">
                {solvedBy === 'humanistic' ? 'humanistic' : solvedBy === 'backtrack' ? 'backtrack' : '-'}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 解答再生パネル（完全実装）
// 「解答再生」フェーズ。盤面の探索過程（frames）を再生・一時停止・スライダー・
// ステップ単位で確認できる。
// ----------------------------------------------------------------------------
const PLAYBACK_INTERVAL_MS = 120;

function ReplayPanel({
  frames,
  frameIndex,
  isPlaying,
  onFrameIndexChange,
  onPlayingChange,
  onOpenChange,
}: {
  readonly frames: readonly ReplayFrame[];
  readonly frameIndex: number;
  readonly isPlaying: boolean;
  readonly onFrameIndexChange: (index: number) => void;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const lastIndex = Math.max(0, frames.length - 1);

  const handleToggleOpen = () => {
    const next = !open;
    setOpen(next);
    onOpenChange(next);
    if (!next) {
      onPlayingChange(false);
      onFrameIndexChange(lastIndex);
    }
  };

  const handlePlay = () => {
    if (lastIndex === 0) return;
    if (frameIndex >= lastIndex) {
      onFrameIndexChange(0);
    }
    onPlayingChange(true);
  };

  const handlePause = () => {
    onPlayingChange(false);
  };

  const handleSliderChange = (value: number) => {
    onPlayingChange(false);
    onFrameIndexChange(value);
  };

  const handleStepBack = () => {
    onPlayingChange(false);
    onFrameIndexChange(Math.max(0, frameIndex - 1));
  };

  const handleStepForward = () => {
    onPlayingChange(false);
    onFrameIndexChange(Math.min(lastIndex, frameIndex + 1));
  };

  const currentFrame: ReplayFrame | undefined = frames[frameIndex];
  const hasFrames = frames.length > 0;

  return (
    <div className="rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={handleToggleOpen}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span>解答再生</span>
        <span className="text-xs text-slate-400">{open ? '▲ 閉じる' : '▼ 表示'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-3 py-3">
          {!hasFrames ? (
            <p className="text-xs text-slate-400">再生可能な探索ステップがありません。</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStepBack}
                  disabled={frameIndex <= 0}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="一つ前のステップ"
                >
                  ◀
                </button>
                {isPlaying ? (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
                  >
                    一時停止
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePlay}
                    disabled={lastIndex === 0}
                    className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    再生
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleStepForward}
                  disabled={frameIndex >= lastIndex}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="一つ次のステップ"
                >
                  ▶
                </button>
                <input
                  type="range"
                  min={0}
                  max={lastIndex}
                  step={1}
                  value={frameIndex}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="flex-none font-mono text-xs text-slate-500">
                  {frameIndex + 1} / {frames.length}
                </span>
              </div>
              {currentFrame && (
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>
                    種別: <span className="font-medium text-slate-700">{frameTypeLabel(currentFrame.type)}</span>
                  </span>
                  <span>
                    フェーズ: <span className="font-medium text-slate-700">{phaseLabel(currentFrame.phase)}</span>
                  </span>
                  {currentFrame.stats && (
                    <>
                      <span>
                        試行数: <span className="font-mono text-slate-700">{currentFrame.stats.count}</span>
                      </span>
                      <span>
                        仮定回数:{' '}
                        <span className="font-mono text-slate-700">{currentFrame.stats.assumptionCount}</span>
                      </span>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SolverPanel({
  rowHints,
  colHints,
  onRowHintsChange,
  onColHintsChange,
  onGridChange,
  validation,
  focusTarget,
}: SolverPanelProps) {
  const { status, grid, message, target, count, stats, solvedBy, frames, solve, reset } = useSolver();

  const [replayOpen, setReplayOpen] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    setReplayIndex(Math.max(0, frames.length - 1));
    setIsPlaying(false);
  }, [frames]);

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setReplayIndex((prev) => {
        const next = prev + 1;
        if (next >= frames.length) {
          setIsPlaying(false);
          return frames.length - 1;
        }
        return next;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, frames.length]);

  const displayGrid: Grid | SolvedGrid | null =
    replayOpen && frames.length > 0 ? frames[replayIndex]?.grid ?? grid : grid;

  useEffect(() => {
    onGridChange?.(displayGrid);
  }, [displayGrid, onGridChange]);

  // 静的検証でエラーが見つかっている間は、solvePicrossを実行しても
  // 矛盾/解なしとして空虚な結果しか返らない（あるいは無意味な探索コストが
  // かかる）ため、「解く」ボタン自体を無効化する。これにより、ユーザーは
  // 「実行→失敗」の往復をせず、入力修正に直接向かえる。
  const canSolve = !validation.hasError;

  const handleSolve = () => {
    if (!canSolve) return;
    solve({ rowHints, colHints });
  };

  const canReplay = (status === 'solved' || status === 'unsolvable') && frames.length > 0;

  return (
    <div className="space-y-4">
      {/* 実行直前: 静的エラー集約バナー（solvePicrossを呼ぶ前に判明している問題） */}
      <StaticErrorBanner validation={validation} />

      {/* 実行: 操作バー + ステータス表示 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          onClick={handleSolve}
          disabled={!canSolve}
          title={canSolve ? undefined : '入力エラーを修正してから実行してください'}
        >
          解く
        </button>
        <button
          className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          onClick={reset}
        >
          リセット
        </button>
        <span className="ml-2 flex items-center gap-1.5 text-sm">
          <span className={`h-2 w-2 rounded-full ${statusDotClass(status)}`} />
          状態: {statusLabel(status)}
          <span className="ml-3 text-slate-500">試行回数: {count}</span>
        </span>
      </div>

      {/* 結果確認: 矛盾アラート（発生時のみ、常時表示） */}
      {status === 'contradiction' && message && (
        <ContradictionAlert message={message} target={target} />
      )}
      {status === 'invalid-hints' && message && <ContradictionAlert message={message} />}
      {status === 'unsolvable' && (
        <ContradictionAlert
          message="入力されたヒントの組み合わせでは、条件を満たす盤面が存在しません（全探索済み）"
        />
      )}

      {/* 結果確認: 盤面（再生中は再生フレームの盤面を表示） */}
      <PicrossBoard
        rowHints={rowHints}
        colHints={colHints}
        grid={displayGrid}
        onRowHintsChange={onRowHintsChange}
        onColHintsChange={onColHintsChange}
        rowCellErrors={validation.rowCellErrors}
        colCellErrors={validation.colCellErrors}
        lineErrors={validation.lineErrors}
        focusTarget={focusTarget}
      />

      {/* 【修正点】解答再生: 折りたたみ（solved/unsolvable時のみ表示候補）
          盤面の直下（統計情報の上）に移動し、視線移動とスクロールの負担を解消 */}
      {canReplay && (
        <ReplayPanel
          frames={frames}
          frameIndex={replayIndex}
          isPlaying={isPlaying}
          onFrameIndexChange={setReplayIndex}
          onPlayingChange={setIsPlaying}
          onOpenChange={setReplayOpen}
        />
      )}

      {/* 【修正点】統計確認: 折りたたみ（statsがあるときのみ表示）
          読物UIとして最下部に配置換え */}
      {stats && <StatsPanel stats={stats} solvedBy={solvedBy} />}
    </div>
  );
}