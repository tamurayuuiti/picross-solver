import { handleSolveButtonClick } from '../solver/solverHandler.js';

// --------------------------------------------------------------------------
// ピクロスグリッド生成・描画
// --------------------------------------------------------------------------
function createPicrossArea(rows, cols) {
  const area = document.getElementById('picrossArea');
  area.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'picross-table';
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.className = 'unknown';
      td.id = `cell-${r}-${c}`;
      if ((c + 1) % 5 === 0 && c !== cols - 1) td.classList.add('border-right-bold');
      if ((r + 1) % 5 === 0 && r !== rows - 1) td.classList.add('border-bottom-bold');
      if (c === 0) td.classList.add('border-left-bold');
      if (c === cols - 1) td.classList.add('border-right-bold');
      if (r === 0) td.classList.add('border-top-bold');
      if (r === rows - 1) td.classList.add('border-bottom-bold');
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  area.appendChild(table);
  document.getElementById('solveBtn').disabled = false;
}

function renderGridOnPicrossArea(grid) {
  const rows = grid.length, cols = grid[0].length;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const td = document.getElementById(`cell-${r}-${c}`);
    if (!td) continue;
    td.className = grid[r][c] === 1 ? 'filled'
      : grid[r][c] === 0 ? 'empty'
      : 'unknown';
  }
}

function renderPreview(grid) {
  const previewArea = document.getElementById('previewArea');
  if (!grid || !grid.length) {
    previewArea.innerHTML = '';
    return;
  }
  let html = '<div style="margin-bottom:4px;font-size:0.95em;color:#555;">全体プレビュー</div>';
  html += '<table class="preview-table">';
  for (let r = 0; r < grid.length; r++) {
    html += '<tr>';
    for (let c = 0; c < grid[0].length; c++) {
      let cls = grid[r][c] === 1 ? 'filled'
              : grid[r][c] === 0 ? 'empty'
              : 'unknown';
      html += `<td class="${cls}"></td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  previewArea.innerHTML = html;
}

// --------------------------------------------------------------------------
// タイマー・リセット処理
// --------------------------------------------------------------------------
let startTime = 0, timerInterval = null;
function resetGridCellsToUnknown(rows, cols) {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const td = document.getElementById(`cell-${r}-${c}`);
    if (td) {
      td.classList.remove('filled', 'empty');
      td.classList.add('unknown');
    }
  }
}

function resetSolveDisplay(rows, cols) {
  stopTimer();
  resetGridCellsToUnknown(rows, cols);
  renderPreview([]);
  document.getElementById('time').textContent = `計算時間: 0.00秒 `;
  document.getElementById('count').textContent = '試行回数: 0';
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  startTime = 0;
}

function startTimer() {
  stopTimer();
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000);
    document.getElementById('time').textContent = `計算時間: ${elapsed.toFixed(2)}秒 `;
  }, 10);
}

// --------------------------------------------------------------------------
// エラー表示
// --------------------------------------------------------------------------
window.showErrorPopup = function(msg) {
  alert(msg);
}

// --------------------------------------------------------------------------
// グローバル公開
// --------------------------------------------------------------------------
window.resetSolveDisplay = resetSolveDisplay;
window.renderGridOnPicrossArea = renderGridOnPicrossArea;
window.renderPreview = renderPreview;
window.startTimer = startTimer;
window.stopTimer = stopTimer;

// --------------------------------------------------------------------------
// イベント登録
// --------------------------------------------------------------------------
document.getElementById('solveBtn').addEventListener('click', handleSolveButtonClick);

document.getElementById('generateGridBtn').addEventListener('click', () => {
  const rows = parseInt(document.getElementById('rowSize').value, 10) || 15;
  const cols = parseInt(document.getElementById('colSize').value, 10) || 15;
  createPicrossArea(rows, cols);
  if (window.resetEditors) {
    window.resetEditors(rows, cols);
  }
});

// --------------------------------------------------------------------------
// 初期表示処理
// --------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  const rows = parseInt(document.getElementById('rowSize').value, 10) || 15;
  const cols = parseInt(document.getElementById('colSize').value, 10) || 15;
  createPicrossArea(rows, cols);
});
