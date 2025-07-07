export async function handleSolveButtonClick() {
  window.currentSolverId = (window.currentSolverId || 0) + 1;
  const thisSolverId = window.currentSolverId;
  if (window.stopTimer) window.stopTimer();
  window.currentSolveGen = null;

  const rows = parseInt(document.getElementById('rowSize').value, 10);
  const cols = parseInt(document.getElementById('colSize').value, 10);

  const hints = window.AppHints.getHints(rows, cols);
  if (hints.errors) {
    // ヒント合計値などの矛盾は具体的にアラート＋フォーカス
    window.AppHints.showErrorPopup(hints.errors.join('\n'));
    if (hints.errorTargets && hints.errorTargets.length > 0) {
      const first = hints.errorTargets[0];
      setTimeout(() => {
        if (first.type === 'row') {
          const rowList = document.getElementById('rowHintList');
          const input = rowList?.querySelectorAll('input')[first.index];
          if (input) input.focus();
        } else if (first.type === 'col') {
          const colList = document.getElementById('colHintList');
          const input = colList?.querySelectorAll('input')[first.index];
          if (input) input.focus();
        }
      }, 50);
    }
    return;
  }
  const { rowHints, colHints } = hints;
  if (rowHints.length !== rows || colHints.length !== cols) {
    window.AppHints.showErrorPopup('ヒント入力数が正しくありません');
    return;
  }

  let solveGen;
  try {
    solveGen = window.AppHints.solvePicross(rowHints, colHints);
  } catch {
    window.AppHints.showErrorPopup("ソルバーの初期化に失敗しました");
    return;
  }
  window.currentSolveGen = solveGen;

  window.resetSolveDisplay(rows, cols);
  await new Promise(resolve => setTimeout(resolve, 20));
  if (window.startTimer) window.startTimer();

  let stoppedByTrialLimit = false;
  handleSolverStep(solveGen.next());

  function handleSolverStep(prevRes) {
    if (thisSolverId !== window.currentSolverId || window.currentSolveGen !== solveGen || stoppedByTrialLimit) {
      if (window.stopTimer) window.stopTimer();
      return;
    }
    const result = prevRes !== undefined ? prevRes : solveGen.next();
    if (result.done) {
      if (window.stopTimer) window.stopTimer();
      return;
    }
    const data = result.value;
    if (data.partial) {
      window.renderGridOnPicrossArea(data.partial);
      if (data.count !== undefined) {
        document.getElementById('count').textContent = `試行回数: ${data.count}`;
        if (data.count > 100000) {
          stoppedByTrialLimit = true;
          if (window.stopTimer) window.stopTimer();
          window.resetSolveDisplay(rows, cols);
          setTimeout(() => {
            const unitCount = Math.round(data.count / 10000);
            alert(`試行回数が${unitCount}万回を超えたため処理を中断しました。明確な解が存在しない可能性があります。`);
          }, 150);
          return;
        }
      }
      setTimeout(() => handleSolverStep(), 0);
    } else if (data.solution) {
      window.renderGridOnPicrossArea(data.solution);
      window.renderPreview(data.solution);
      if (data.count !== undefined) {
        document.getElementById('count').textContent = `試行回数: ${data.count}`;
      }
      if (window.stopTimer) window.stopTimer();
      setTimeout(() => {
        alert("処理が完了しました。");
      }, 150);
    } else if (data.error) {
      if (window.stopTimer) window.stopTimer();
      window.resetSolveDisplay(rows, cols);
      // 計算途中の矛盾はシンプルなアラートのみ
      if (data.hintErrors && data.hintErrors.length > 0) {
        // ヒント合計値などの矛盾は具体的にアラート＋フォーカス
        window.AppHints.showErrorPopup("ヒントに矛盾があります:\n" + data.hintErrors.join('\n'));
        if (data.hintErrorTargets && data.hintErrorTargets.length > 0) {
          const first = data.hintErrorTargets[0];
          setTimeout(() => {
            if (first.type === 'row') {
              const rowList = document.getElementById('rowHintList');
              const input = rowList?.querySelectorAll('input')[first.index];
              if (input) input.focus();
            } else if (first.type === 'col') {
              const colList = document.getElementById('colHintList');
              const input = colList?.querySelectorAll('input')[first.index];
              if (input) input.focus();
            }
          }, 50);
        }
      } else {
        window.AppHints.showErrorPopup("矛盾が発生しました。ヒントや入力内容を見直してください。");
      }
    } else {
      setTimeout(() => handleSolverStep(), 0);
    }
  }
}
