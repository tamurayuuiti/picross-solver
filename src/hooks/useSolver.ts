// ============================================================================
// useSolver.ts
// solvePicross ジェネレーターを駆動し、React の状態として公開するフック。
//
// 設計方針:
// - solvePicross.ts には一切手を入れない。ジェネレーターの「呼び出し側」として
//   振る舞うだけ。
// - MVPでは同期的にジェネレーターを最後まで drain する。盤面が大きく
//   バックトラックが重くなった場合は、将来このフック内部だけを
//   requestAnimationFrame / setTimeout 駆動や Web Worker 駆動に
//   差し替えれば良く、App.tsx 側のインターフェースは変えなくて済む。
//
// 変更点（統計表示対応）:
// - 各イベント（solved/contradiction/unsolvable）が運ぶ SolverStats / solvedBy
//   を state にそのまま反映するよう拡張した。
//
// 変更点（解答再生対応）:
// - drain中に通過したイベントのうち、盤面を持つもの（progress/solved/
//   contradiction）の grid を ReplayFrame としてすべて記録し、
//   state.frames として公開する。solvePicross.ts 側のロジックは無改修
//   （あくまで呼び出し側でイベント列を観測して副産物的に収集するだけ）。
// - 大規模盤面（行数・列数が大きい、またはbacktrackが深い）では
//   progressInterval で間引かれていてもフレーム数が数百〜数千に達する
//   ことがあるため、MAX_REPLAY_FRAMES を超える場合は等間隔サンプリングで
//   間引く。最初のフレームと最後のフレーム（解/矛盾/解なし確定時点）は
//   必ず保持し、再生の始点・終点が欠落しないようにする。
// - invalid-hints イベントは盤面を持たないため frames には含めない。
// ============================================================================

import { useCallback, useState } from 'react';
import { solvePicross } from '@/solver/solvePicross';
import type {
  Grid,
  PicrossHints,
  ReplayFrame,
  SolvedGrid,
  SolverEvent,
  UseSolverResult,
  UseSolverState,
} from '@/types/index';

const INITIAL_STATE: UseSolverState = {
  status: 'idle',
  grid: null,
  count: 0,
  frames: [],
};

/** 解答再生用に保持するフレーム数の上限。これを超えたら等間隔で間引く。 */
const MAX_REPLAY_FRAMES = 300;

/**
 * SolverEvent から、盤面を持つイベントだけを ReplayFrame に変換する。
 * 盤面を持たない invalid-hints / unsolvable（盤面なし）は null を返す。
 */
function toReplayFrame(event: SolverEvent): ReplayFrame | null {
  switch (event.type) {
    case 'progress':
      return { grid: event.grid, type: event.type, phase: event.phase, stats: event.stats };
    case 'solved':
      return { grid: event.grid, type: event.type, phase: event.phase, stats: event.stats };
    case 'contradiction':
      return event.grid
        ? { grid: event.grid, type: event.type, phase: event.phase, stats: event.stats }
        : null;
    case 'unsolvable':
    case 'invalid-hints':
      return null;
  }
}

/**
 * フレーム列が上限を超えている場合、等間隔サンプリングで間引く。
 * 先頭と末尾は必ず残す（再生の開始地点・確定地点を保証するため）。
 */
function downsampleFrames(frames: readonly ReplayFrame[], maxFrames: number): readonly ReplayFrame[] {
  if (frames.length <= maxFrames) return frames;
  if (maxFrames <= 1) return frames.length > 0 ? [frames[frames.length - 1]] : [];

  const result: ReplayFrame[] = [];
  const step = (frames.length - 1) / (maxFrames - 1);
  for (let i = 0; i < maxFrames; i++) {
    const idx = Math.round(i * step);
    result.push(frames[Math.min(idx, frames.length - 1)]);
  }
  return result;
}

export function useSolver(): UseSolverResult {
  const [state, setState] = useState<UseSolverState>(INITIAL_STATE);

  const solve = useCallback((hints: PicrossHints) => {
    setState({ status: 'running', grid: null, count: 0, frames: [] });

    // backtrack中の progress イベントは「直近の盤面」として保持しておき、
    // unsolvable時に最後に見ていた盤面をデバッグ表示できるようにする。
    let lastGrid: Grid | SolvedGrid | null = null;
    const collectedFrames: ReplayFrame[] = [];

    for (const event of solvePicross(hints)) {
      const frame = toReplayFrame(event);
      if (frame) collectedFrames.push(frame);

      switch (event.type) {
        case 'progress': {
          lastGrid = event.grid;
          break;
        }
        case 'solved': {
          setState({
            status: 'solved',
            grid: event.grid,
            count: event.count,
            stats: event.stats,
            solvedBy: event.solvedBy,
            frames: downsampleFrames(collectedFrames, MAX_REPLAY_FRAMES),
          });
          return;
        }
        case 'contradiction': {
          setState({
            status: 'contradiction',
            grid: event.grid ?? lastGrid,
            message: event.message,
            target: event.target,
            count: event.count,
            stats: event.stats,
            frames: downsampleFrames(collectedFrames, MAX_REPLAY_FRAMES),
          });
          return;
        }
        case 'unsolvable': {
          setState({
            status: 'unsolvable',
            grid: lastGrid,
            count: event.count,
            stats: event.stats,
            frames: downsampleFrames(collectedFrames, MAX_REPLAY_FRAMES),
          });
          return;
        }
        case 'invalid-hints': {
          // 現状の solvePicross は emit しないが、将来の防御的チェック追加に
          // 対応できるよう型としては受けておく。
          setState({
            status: 'invalid-hints',
            grid: null,
            message: event.errors.join(' / '),
            count: 0,
            frames: [],
          });
          return;
        }
      }
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, solve, reset };
}