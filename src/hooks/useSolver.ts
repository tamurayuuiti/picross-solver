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
// ============================================================================

import { useCallback, useState } from 'react';
import { solvePicross } from '@/solver/solvePicross';
import type {
  Grid,
  PicrossHints,
  SolvedGrid,
  UseSolverResult,
  UseSolverState,
} from '@/types/index';

const INITIAL_STATE: UseSolverState = {
  status: 'idle',
  grid: null,
  count: 0,
};

export function useSolver(): UseSolverResult {
  const [state, setState] = useState<UseSolverState>(INITIAL_STATE);

  const solve = useCallback((hints: PicrossHints) => {
    setState({ status: 'running', grid: null, count: 0 });

    // backtrack中の progress イベントは「直近の盤面」として保持しておき、
    // unsolvable時に最後に見ていた盤面をデバッグ表示できるようにする。
    let lastGrid: Grid | SolvedGrid | null = null;

    for (const event of solvePicross(hints)) {
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
          });
          return;
        }
        case 'unsolvable': {
          setState({
            status: 'unsolvable',
            grid: lastGrid,
            count: event.count,
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