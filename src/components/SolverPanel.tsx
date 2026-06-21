// ============================================================================
// SolverPanel.tsx
// 既存の useSolver（→ solvePicross.ts）を駆動し、結果を PicrossBoard に
// 渡して表示するパネル。
//
// デザイン改修メモ（ロジック・状態管理・イベントフローは無変更）:
// - 操作行（解く/リセット/状態表示）・アラート・盤面・解答再生・統計を
//   すべて Card で統一し、1つの「解析パネル」として連続性のある見た目に
//   まとめた。
// - 統計パネルは「開発者向けデバッグ情報」ではなく「解析結果」として
//   自然に見えるよう、見出しを変更し、難易度ヒントを先頭に出す構成に
//   した（表示するデータ自体・取得元ロジックは無変更）。
// - エラー・矛盾・警告系の表示はすべて ui.tsx の Alert に統一し、色・
//   アイコン・枠線の表現をPicrossBoard/HintEditor側のエラー表示と
//   揃えた。
// - 折りたたみセクション（統計・解答再生）のヘッダーは DisclosureHeader
//   に統一。開閉ロジック自体は既存のまま。
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type {
  Grid,
  HintCellError,
  HintErrorFocus,
  HintErrorSource,
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
import { Alert, Badge, Button, Card, DisclosureHeader, StatusDot } from '@/components/ui';

interface HintValidationWithCellSplit extends HintValidationResult {
  readonly rowCellErrors: readonly HintCellError[];
  readonly colCellErrors: readonly HintCellError[];
}

interface SolverPanelProps {
  readonly rowHints: HintLines;
  readonly colHints: HintLines;
  readonly onRowHintsChange: (lines: HintLines) => void;
  readonly onColHintsChange: (lines: HintLines) => void;
  readonly onGridChange?: (grid: Grid | SolvedGrid | null) => void;
  readonly validation: HintValidationWithCellSplit;
  readonly focus?: HintErrorFocus | null;
  readonly onRequestFocus?: (target: HintLineFocusTarget, source: HintErrorSource) => void;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle': return '待機中';
    case 'running': return '解析中...';
    case 'solved': return '解けました';
    case 'unsolvable': return '解なし';
    case 'contradiction': return 'ヒントに矛盾';
    case 'invalid-hints': return 'ヒントが不正';
    default: return status;
  }
}

function statusDotTone(status: string): 'success' | 'progress' | 'danger' | 'neutral' {
  switch (status) {
    case 'solved': return 'success';
    case 'running': return 'progress';
    case 'unsolvable':
    case 'contradiction':
    case 'invalid-hints': return 'danger';
    default: return 'neutral';
  }
}

function phaseLabel(phase: ReplayFrame['phase']): string {
  if (phase === 'humanistic') return 'humanistic';
  if (phase === 'backtrack') return 'backtrack';
  return '-';
}

function frameTypeLabel(type: ReplayFrame['type']): string {
  switch (type) {
    case 'progress': return '探索中';
    case 'solved': return '解確定';
    case 'contradiction': return '矛盾検出';
    default: return type;
  }
}

// ----------------------------------------------------------------------------
// 静的エラー集約バナー
// ----------------------------------------------------------------------------
function StaticErrorBanner({ validation }: { readonly validation: HintValidationWithCellSplit }) {
  const cellErrorCount = validation.rowCellErrors.length + validation.colCellErrors.length;
  const lineErrorCount = validation.lineErrors.length;

  const summaries: string[] = [];
  if (lineErrorCount > 0) summaries.push(`ヒントの合計が盤面サイズを超えている行/列（${lineErrorCount}件）`);
  if (cellErrorCount > 0) summaries.push(`入力値の形式エラー（${cellErrorCount}件）`);

  if (summaries.length === 0) return null;

  return (
    <Alert tone="warning">
      <p className="font-medium">入力内容に問題があるため、解析を実行できません</p>
      <ul className="list-inside list-disc text-xs">
        {summaries.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="text-xs opacity-80">
        左側のヒント入力欄、または盤面に隣接するヒントセルの赤枠箇所を確認してください。
      </p>
    </Alert>
  );
}

// ----------------------------------------------------------------------------
// 矛盾アラート
// ----------------------------------------------------------------------------
function ContradictionAlert({
  message,
  target,
  source,
  onRequestFocus,
}: {
  readonly message: string;
  readonly target?: HintErrorTarget;
  readonly source: HintErrorSource;
  readonly onRequestFocus?: (target: HintLineFocusTarget, source: HintErrorSource) => void;
}) {
  const targetLabel = target
    ? target.type === 'row'
      ? `行 ${target.index + 1}`
      : `列 ${target.index + 1}`
    : null;

  return (
    <Alert tone="danger">
      <p className="font-medium">{message}</p>
      {targetLabel && (
        <p className="flex items-center gap-2 text-xs opacity-90">
          <span>矛盾箇所: {targetLabel}</span>
          {target && onRequestFocus && (
            <Button
              variant="secondary"
              size="sm"
              className="border-red-300 bg-white px-2 py-0.5 text-red-700 hover:bg-red-100"
              onClick={() => onRequestFocus(target, source)}
            >
              ここに移動
            </Button>
          )}
        </p>
      )}
    </Alert>
  );
}

// ----------------------------------------------------------------------------
// 統計パネル（「解析結果」として表示。デバッグ情報然とした見せ方を避ける）
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
    <Card tight className="p-0">
      <DisclosureHeader label="解析結果" open={open} onToggle={() => setOpen((v) => !v)} />
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          {difficultyHint && (
            <p className="mb-3 text-xs font-medium text-slate-500">{difficultyHint}</p>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-400">実行時間</dt>
              <dd className="font-mono font-medium text-slate-700">{stats.elapsedMs.toFixed(1)} ms</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">総試行数</dt>
              <dd className="font-mono font-medium text-slate-700">{stats.count}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">仮定回数</dt>
              <dd className="font-mono font-medium text-slate-700">{stats.assumptionCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">最大探索深度</dt>
              <dd className="font-mono font-medium text-slate-700">{stats.maxDepth}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">使用フェーズ</dt>
              <dd className="font-mono font-medium text-slate-700">
                {solvedBy === 'humanistic' ? 'humanistic' : solvedBy === 'backtrack' ? 'backtrack' : '-'}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------------
// 解答再生パネル
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
    <Card tight className="p-0">
      <DisclosureHeader label="解答再生" open={open} onToggle={handleToggleOpen} />
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          {!hasFrames ? (
            <p className="text-xs text-slate-400">再生可能な探索ステップがありません。</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStepBack}
                  disabled={frameIndex <= 0}
                  aria-label="一つ前のステップ"
                >
                  ◀
                </Button>
                {isPlaying ? (
                  <Button variant="secondary" onClick={handlePause}>
                    一時停止
                  </Button>
                ) : (
                  <Button variant="primary" onClick={handlePlay} disabled={lastIndex === 0}>
                    再生
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStepForward}
                  disabled={frameIndex >= lastIndex}
                  aria-label="一つ次のステップ"
                >
                  ▶
                </Button>
                <input
                  type="range"
                  min={0}
                  max={lastIndex}
                  step={1}
                  value={frameIndex}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  className="flex-1 accent-slate-700"
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
    </Card>
  );
}

export function SolverPanel({
  rowHints,
  colHints,
  onRowHintsChange,
  onColHintsChange,
  onGridChange,
  validation,
  focus,
  onRequestFocus,
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

  const canSolve = !validation.hasError;

  const handleSolve = () => {
    if (!canSolve) return;
    solve({ rowHints, colHints });
  };

  const canReplay = (status === 'solved' || status === 'unsolvable') && frames.length > 0;

  return (
    <div className="space-y-4">
      <StaticErrorBanner validation={validation} />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={handleSolve} disabled={!canSolve}
            title={canSolve ? undefined : '入力エラーを修正してから実行してください'}
          >
            解く
          </Button>
          <Button variant="secondary" onClick={reset}>
            リセット
          </Button>
          <span className="ml-2 flex items-center gap-1.5 text-sm text-slate-600">
            <StatusDot tone={statusDotTone(status)} />
            状態: {statusLabel(status)}
            <Badge tone="neutral" className="ml-1">
              試行回数: {count}
            </Badge>
          </span>
        </div>
      </Card>

      {status === 'contradiction' && message && (
        <ContradictionAlert
          message={message}
          target={target}
          source="solver-contradiction"
          onRequestFocus={onRequestFocus}
        />
      )}
      {status === 'invalid-hints' && message && (
        <ContradictionAlert message={message} source="solver-contradiction" />
      )}
      {status === 'unsolvable' && (
        <ContradictionAlert
          message="入力されたヒントの組み合わせでは、条件を満たす盤面が存在しません（全探索済み）"
          source="solver-unsolvable"
        />
      )}

      <PicrossBoard
        rowHints={rowHints}
        colHints={colHints}
        grid={displayGrid}
        onRowHintsChange={onRowHintsChange}
        onColHintsChange={onColHintsChange}
        rowCellErrors={validation.rowCellErrors}
        colCellErrors={validation.colCellErrors}
        lineErrors={validation.lineErrors}
        focus={focus}
        onRequestFocus={onRequestFocus}
      />

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

      {stats && <StatsPanel stats={stats} solvedBy={solvedBy} />}
    </div>
  );
}