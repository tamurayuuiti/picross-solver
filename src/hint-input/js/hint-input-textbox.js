// --------------------------------------------------------------------------
// シンプルなテキストボックス型ヒント入力欄
// --------------------------------------------------------------------------
/**
 * シンプルなテキストボックス型ヒント入力欄を生成
 * @param {number} _rows
 * @param {number} _cols
 */
export function createTextboxHintInputs(_rows, _cols) {
  // テキストボックス用コンテナだけをクリア
  const textboxBlock = document.getElementById('hintInputTextboxBlock');
  if (!textboxBlock) return;
  textboxBlock.innerHTML = '';

  // 行ヒント
  const rowDiv = document.createElement('div');
  rowDiv.className = 'simple-hint-block';
  const rowLabel = document.createElement('label');
  rowLabel.htmlFor = 'rowHintTextbox';
  rowLabel.textContent = '行（横方向）ヒント';
  const rowBox = document.createElement('textarea');
  rowBox.id = 'rowHintTextbox';
  rowBox.className = 'simple-hint-textbox';
  rowBox.rows = 10;
  rowBox.placeholder = '各行のヒントを1行ずつ入力（例: 2 7 3）';
  rowDiv.appendChild(rowLabel);
  rowDiv.appendChild(rowBox);

  // 列ヒント
  const colDiv = document.createElement('div');
  colDiv.className = 'simple-hint-block';
  const colLabel = document.createElement('label');
  colLabel.htmlFor = 'colHintTextbox';
  colLabel.textContent = '列（縦方向）ヒント';
  const colBox = document.createElement('textarea');
  colBox.id = 'colHintTextbox';
  colBox.className = 'simple-hint-textbox';
  colBox.rows = 10;
  colBox.placeholder = '各列のヒントを1行ずつ入力（例: 1 4）';
  colDiv.appendChild(colLabel);
  colDiv.appendChild(colBox);

  // テキストボックスコンテナに追加
  textboxBlock.appendChild(rowDiv);
  textboxBlock.appendChild(colDiv);
}

/**
 * シンプルなテキストボックス型ヒント入力欄の値を取得
 * @returns {{rowLines: string[], colLines: string[]}}
 */
export function getTextboxHintValues(rows, cols) {
  const rowBox = document.getElementById('rowHintTextbox');
  const colBox = document.getElementById('colHintTextbox');
  const rowLines = rowBox ? rowBox.value.trim().split('\n').slice(0, rows) : [];
  const colLines = colBox ? colBox.value.trim().split('\n').slice(0, cols) : [];
  return { rowLines, colLines };
}

/**
 * シンプルなテキストボックス型ヒント入力欄のリセット
 * @param {number} rows
 * @param {number} cols
 */
export function resetTextboxHintInputs(rows, cols) {
  createTextboxHintInputs(rows, cols);
}

/**
 * シンプルなテキストボックス型ヒント入力欄の値をパース
 * @param {string[]} lines
 * @returns {number[][]}
 */
export function parseTextboxHints(lines) {
  return lines.map(row =>
    row.split(/[^0-9]+/).map(Number).filter(n => !isNaN(n) && n > 0)
  );
}
