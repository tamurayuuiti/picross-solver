// ============================================================================
// SolverPanel.tsx
// 既存の useSolver（→ solvePicross.ts）を駆動し、結果を PicrossBoard に
// 渡して表示するパネル。新ヒントUIから得た rowHints/colHints をそのまま
// solve() に渡すだけで接続する。solvePicross.ts のジェネレーター駆動ロジック
// は無改修（useSolverはstats/frames伝播のみ拡張）。
//
// 情報設計（ユーザーの動線に沿った配置）:
//   入力 → 実行（操作バー） → 結果確認（矛盾アラート / 盤面）
//        → 統計確認（折りたたみ） → 解答再生（折りたたみ、solved/unsolvable時）
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
  HintErrorTarget,
  HintLines,
  ReplayFrame,
  SolvedBy,
  SolvedGrid,
  SolverStats,
} from '../types';
import { useSolver } from '@/hooks/useSolver';
import { PicrossBoard } from './PicrossBoard';

interface SolverPanelProps {
  readonly rowHints: HintLines;
  readonly colHints: HintLines;
  readonly onRowHintsChange: (lines: HintLines) => void;
  readonly onColHintsChange: (lines: HintLines) => void;
  /** 現在のsolver盤面状態をサイドバーのプレビュー等へ伝播するための通知。任意。 */
  readonly onGridChange?: (grid: Grid | SolvedGrid | null) => void;
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
//
// - 再生中/一時停止中を問わず、現在フレームの index を frameIndex として
//   親（SolverPanel）に通知し、親側で PicrossBoard に渡す grid を
//   差し替える（このコンポーネント自身はPicrossBoardを描画しない）。
// - パネルを閉じている間は再生を強制停止し、frameIndex を末尾（最終結果）に
//   戻すことで、閉じた瞬間に実際の解の盤面表示へ自然に戻る。
// - 自動再生は setInterval を使う。間隔は固定値（PLAYBACK_INTERVAL_MS）。
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
      // 閉じたら再生を止め、最終フレーム（実際の解）の表示に戻す。
      onPlayingChange(false);
      onFrameIndexChange(lastIndex);
    }
  };

  const handlePlay = () => {
    if (lastIndex === 0) return;
    // 末尾にいる状態で再生を押したら先頭から再生し直す。
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
}: SolverPanelProps) {
  const { status, grid, message, target, count, stats, solvedBy, frames, solve, reset } = useSolver();

  // 解答再生の表示状態（ローカル）。useSolver / solvePicross.ts には影響しない。
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // solve()が新しい結果を返したら、再生位置を末尾（=最終結果）にリセットし、
  // 再生状態も初期化する。
  useEffect(() => {
    setReplayIndex(Math.max(0, frames.length - 1));
    setIsPlaying(false);
  }, [frames]);

  // 自動再生のタイマー駆動。isPlaying中、PLAYBACK_INTERVAL_MSごとに1フレーム進める。
  // 末尾に到達したら自動的に一時停止する。
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

  // 再生パネルが開いていて、かつ有効なフレームがあるときだけ、
  // 盤面表示を再生フレームの盤面に差し替える。
  // パネルが閉じている間は常に実際のsolve結果（grid）を表示する。
  const displayGrid: Grid | SolvedGrid | null =
    replayOpen && frames.length > 0 ? frames[replayIndex]?.grid ?? grid : grid;

  useEffect(() => {
    onGridChange?.(displayGrid);
  }, [displayGrid, onGridChange]);

  const handleSolve = () => {
    solve({ rowHints, colHints });
  };

  const canReplay = (status === 'solved' || status === 'unsolvable') && frames.length > 0;

  return (
    <div className="space-y-4">
      {/* 実行: 操作バー + ステータス表示 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          onClick={handleSolve}
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

      {/* 結果確認: 盤面（再生中は再生フレームの盤面を表示） */}
      <PicrossBoard
        rowHints={rowHints}
        colHints={colHints}
        grid={displayGrid}
        onRowHintsChange={onRowHintsChange}
        onColHintsChange={onColHintsChange}
      />

      {/* 統計確認: 折りたたみ（statsがあるときのみ表示） */}
      {stats && <StatsPanel stats={stats} solvedBy={solvedBy} />}

      {/* 解答再生: 折りたたみ（solved/unsolvable時のみ表示候補） */}
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
    </div>
  );
}