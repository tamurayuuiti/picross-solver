// Picross Solver Core Logic in JavaScript

// 指定されたライン（行または列）がヒントと一致しているか判定
function isValidLine(line, hints) {
  const segments = [];
  let count = 0;
  for (const cell of line) {
    if (cell === 1) {
      count++;
    } else if (count > 0) {
      segments.push(count);
      count = 0;
    }
  }
  if (count > 0) segments.push(count);
  return JSON.stringify(segments) === JSON.stringify(hints);
}

// 指定された長さとヒントから、可能なラインの全パターンを生成
function getLinePossibilities(length, hints) {
  function helper(hints, idx, line) {
    if (hints.length === 0) {
      if (line.length <= length) {
        return [line.concat(Array(length - line.length).fill(0))];
      }
      return [];
    }
    const res = [];
    const maxStart = length - hints.reduce((a, b) => a + b, 0) - (hints.length - 1);
    for (let i = idx; i <= maxStart; i++) {
      let newLine = line.concat(Array(i - line.length).fill(0), Array(hints[0]).fill(1));
      if (newLine.length < length) newLine.push(0);
      res.push(...helper(hints.slice(1), newLine.length, newLine));
    }
    return res;
  }
  return helper(hints, 0, []);
}

// 既に確定しているセル情報で候補を絞り込む
function filterPossibilitiesByFixed(possibilities, fixed) {
  return possibilities.filter(poss =>
    poss.every((v, i) => fixed[i] == null || fixed[i] === -1 || fixed[i] === v)
  );
}

// 候補リストから、全ての候補で同じ値になるセルを確定値として抽出
function getCertaintiesFromPoss(possList) {
  if (
    !possList ||
    possList.length === 0 ||
    !possList[0] ||
    possList[0].length === 0 ||
    !possList[0][0]
  ) return null;
  const length = possList[0][0].length;
  return possList.map(cands => {
    return Array.from({ length }, (_, i) => {
      const values = new Set(cands.map(row => row[i]));
      return values.size === 1 ? [...values][0] : null;
    });
  });
}

// ヒューマンスティック（人間的な論理）で確定できるセルを埋める
function applyHumanistic(rowHints, colHints) {
  const height = rowHints.length;
  const width = colHints.length;
  const grid = Array.from({ length: height }, () => Array(width).fill(null));
  // 各行・列の候補を初期化
  let rowPoss = rowHints.map(h => getLinePossibilities(width, h));
  let colPoss = colHints.map(h => getLinePossibilities(height, h));
  let changed = true;
  let count = 0;
  // dirtyフラグ: 変更があった行・列のみ再計算
  let dirtyRows = Array(height).fill(true);
  let dirtyCols = Array(width).fill(true);

  while (changed) {
    changed = false;
    count++;
    // 行のdirtyな箇所のみ候補をフィルタ
    for (let i = 0; i < height; i++) {
      if (dirtyRows[i]) {
        rowPoss[i] = filterPossibilitiesByFixed(rowPoss[i], grid[i]);
        if (rowPoss[i].length === 0) {
          return { error: `行${i + 1}で矛盾`, errorTarget: { type: 'row', index: i }, grid, rowPoss, colPoss, count };
        }
      }
    }
    // 行のdirtyな箇所のみ確定値を抽出
    let rowCerts = Array(height);
    for (let i = 0; i < height; i++) {
      if (dirtyRows[i]) {
        rowCerts[i] = getCertaintiesFromPoss([rowPoss[i]])[0];
      } else {
        rowCerts[i] = null;
      }
    }
    // 行の確定値をグリッドに反映し、列のdirtyを更新
    for (let i = 0; i < height; i++) {
      if (!rowCerts[i]) continue;
      for (let j = 0; j < width; j++) {
        if (rowCerts[i][j] != null && grid[i][j] == null) {
          grid[i][j] = rowCerts[i][j];
          changed = true;
          dirtyCols[j] = true;
        }
      }
    }
    // 列のdirtyな箇所のみ候補をフィルタ
    for (let j = 0; j < width; j++) {
      if (dirtyCols[j]) {
        const col = grid.map(row => row[j]);
        colPoss[j] = filterPossibilitiesByFixed(colPoss[j], col);
        if (colPoss[j].length === 0) {
          return { error: `列${j + 1}で矛盾`, errorTarget: { type: 'col', index: j }, grid, rowPoss, colPoss, count };
        }
      }
    }
    // 列のdirtyな箇所のみ確定値を抽出
    let colCerts = Array(width);
    for (let j = 0; j < width; j++) {
      if (dirtyCols[j]) {
        colCerts[j] = getCertaintiesFromPoss([colPoss[j]])[0];
      } else {
        colCerts[j] = null;
      }
    }
    // 列の確定値をグリッドに反映し、行のdirtyを更新
    for (let j = 0; j < width; j++) {
      if (!colCerts[j]) continue;
      for (let i = 0; i < height; i++) {
        if (colCerts[j][i] != null && grid[i][j] == null) {
          grid[i][j] = colCerts[j][i];
          changed = true;
          dirtyRows[i] = true;
        }
      }
    }
    // dirtyフラグをリセット
    dirtyRows = dirtyRows.map(() => false);
    dirtyCols = dirtyCols.map(() => false);
  }
  return { grid, rowPoss, colPoss, count };
}

// 途中まで埋まったラインがヒントに矛盾しないか判定
function isValidSoFarLine(line, hints) {
  const segs = [];
  let cnt = 0;
  for (const v of line) {
    if (v === 1) {
      cnt++;
    } else if (cnt > 0) {
      segs.push(cnt);
      cnt = 0;
    }
  }
  if (cnt > 0) segs.push(cnt);
  for (let i = 0; i < segs.length; i++) {
    if (i >= hints.length || segs[i] > hints[i]) return false;
  }
  return segs.length <= hints.length;
}

// ピクロスを解くメインのジェネレーター関数
export function* solvePicross(rowHints, colHints) {
  // ヒント矛盾検知はwindow.validateHintsを利用
  const { errors: hintErrors, errorTargets: hintErrorTargets } = (typeof window !== "undefined" && window.AppHints?.validateHints)
    ? window.AppHints.validateHints(rowHints, colHints)
    : { errors: [], errorTargets: [] };
  if (hintErrors.length > 0) {
    // ヒントに矛盾があれば即エラーを返す
    yield { error: "ヒント矛盾: " + hintErrors.join(" / "), count: 0, hintErrors, hintErrorTargets };
    return;
  }

  const height = rowHints.length;
  const width = colHints.length;
  // まずヒューマンスティックで埋められるだけ埋める
  const { grid: initialGrid, rowPoss, count: humanisticCount, error, errorTarget } = applyHumanistic(rowHints, colHints);
  if (error) {
    // ヒューマンスティック段階でエラーがあれば返す
    yield { error, count: humanisticCount, errorTarget };
    return;
  }

  // バックトラック用のカウンタ
  const count = { value: 0 };
  // -1: 未確定, 0: 空, 1: 塗り
  const grid = initialGrid.map(row => row.map(cell => (cell == null ? -1 : cell)));
  // 各行ごとの候補を初期化
  const rowCandidates = rowPoss.map((poss, i) => filterPossibilitiesByFixed(poss, grid[i]));

  // 再帰的バックトラック探索
  function* backtrack(grid, rowIdx) {
    if (rowIdx === height) {
      // 全行埋めたら、各列がヒントと一致するか最終チェック
      for (let j = 0; j < width; j++) {
        const col = grid.map(row => row[j]);
        if (!isValidLine(col, colHints[j])) {
          // 列jが矛盾
          return false;
        }
      }
      // 解が見つかった場合
      yield { solution: grid, done: true, count: humanisticCount + count.value };
      return true;
    }

    // 現在の行の候補ごとに再帰
    for (const cand of rowCandidates[rowIdx]) {
      const newGrid = grid.map(row => [...row]);
      newGrid[rowIdx] = [...cand];

      let valid = true;
      // ここまで埋めた各列が矛盾しないかチェック
      for (let j = 0; j < width; j++) {
        const colSoFar = newGrid.slice(0, rowIdx + 1).map(row => row[j]);
        if (!isValidSoFarLine(colSoFar, colHints[j])) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      count.value++;
      // 再帰的に次の行へ
      const result = yield* backtrack(newGrid, rowIdx + 1);
      if (result === true) return true;

      // 一定回数ごとに途中経過をyield
      if (count.value % 10 === 0) {
        const partial = newGrid.map(row => row.map(c => (c === -1 ? -1 : c)));
        yield { partial, count: humanisticCount + count.value };
      }
    }

    return false;
  }

  // 解が見つかったかどうかのフラグ
  let found = false;
  for (const result of backtrack(grid, 0)) {
    yield result;
    if (result.solution) {
      found = true;
      break;
    }
  }

  // 解が見つからなかった場合のエラー返却
  if (!found) {
    yield { error: "No solution found", count: humanisticCount + count.value };
  }
}

// solvePicrossをグローバル公開
if (typeof window !== "undefined") {
  window.AppHints = window.AppHints || {};
  window.AppHints.solvePicross = solvePicross;
}
