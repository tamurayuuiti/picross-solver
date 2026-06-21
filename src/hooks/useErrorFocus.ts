// ============================================================================
// useErrorFocus.ts
// 「エラー表示 → ジャンプ → 強調表示 → 自動解除」を一貫した1つの仕組みに
// 統合するための共通フック。
//
// 設計方針:
// - エラーの発生源（テキスト入力欄のエラー一覧 / 盤面側ヒントセル / 
//   SolverPanelの矛盾アラート・解なしアラート）が増えても、呼び出し側は
//   常に同じ requestFocus(target, source) を呼ぶだけでよい。表示場所に
//   よってジャンプ・ハイライトの挙動が変わることはない。
// - ハイライト状態の「残留」を構造的に防ぐため、強調の解除タイミングを
//   このフック1箇所のタイマーだけが管理する。
//     - requestFocus が呼ばれるたびに、前回のタイマーを必ずクリアしてから
//       新しいタイマーをセットする（「前回の解除」→「新規強調」が常に
//       1つの状態更新の中で完結する）。
//     - 同じ (type, index) への再クリックでも、requestId を毎回更新する
//       ことで「タイマーをリセットして強調しなおす」動作が保証される
//       （focus オブジェクトの参照が変わるため、PicrossBoard 側の
//       useEffect が確実に再発火する）。
// - 自動解除後は focus を null に戻す。「次のフォーカスへの切り替え」と
//   「時間経過による自動解除」を同じ clearFocus 経路に統一しているため、
//   特別な分岐を増やさずに済む。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HintErrorFocus, HintErrorSource, HintLineFocusTarget } from '@/types';

/** ハイライトを自動解除するまでの時間（ms）。「気づける」かつ「居座らない」長さに調整する。 */
const FOCUS_HIGHLIGHT_DURATION_MS = 2400;

export interface UseErrorFocusResult {
  /** 現在強調表示すべき対象。null のときは何も強調しない。 */
  readonly focus: HintErrorFocus | null;
  /**
   * エラー表示（テキスト側・盤面側・SolverPanel側のどこでも）からの
   * ジャンプ要求の唯一の入口。呼び出し側はこれだけを呼べばよい。
   */
  readonly requestFocus: (target: HintLineFocusTarget, source: HintErrorSource) => void;
  /** 強調を即時解除する（パネルを閉じる等、明示的にリセットしたい場合用）。 */
  readonly clearFocus: () => void;
}

export function useErrorFocus(): UseErrorFocusResult {
  const [focus, setFocus] = useState<HintErrorFocus | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextRequestIdRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearFocus = useCallback(() => {
    clearTimer();
    setFocus(null);
  }, [clearTimer]);

  const requestFocus = useCallback(
    (target: HintLineFocusTarget, source: HintErrorSource) => {
      // 前回の自動解除タイマーを必ず先にクリアする。これにより
      // 「前のタイマーが残ったまま新しい強調が始まる」状態が発生しない。
      clearTimer();

      nextRequestIdRef.current += 1;
      setFocus({ type: target.type, index: target.index, source, requestId: nextRequestIdRef.current });

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setFocus(null);
      }, FOCUS_HIGHLIGHT_DURATION_MS);
    },
    [clearTimer]
  );

  // アンマウント時にタイマーが残らないようにする。
  useEffect(() => clearTimer, [clearTimer]);

  return { focus, requestFocus, clearFocus };
}