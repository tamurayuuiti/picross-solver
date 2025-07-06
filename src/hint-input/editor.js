// --------------------------------------------------------------------------
// エディタ風ヒント入力欄の生成・操作
// --------------------------------------------------------------------------
export function createEditorRows(tableId, count) {
  const tbody = document.getElementById(tableId).querySelector('tbody');
  tbody.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const row = document.createElement('tr');
    row.className = 'line-row';

    const numCell = document.createElement('td');
    numCell.className = 'line-number';
    // 行・列の判定
    if (tableId === 'rowHintTable') {
      numCell.textContent = `${i}行`;
    } else if (tableId === 'colHintTable') {
      numCell.textContent = `${i}列`;
    } else {
      numCell.textContent = i;
    }

    const contentCell = document.createElement('td');
    contentCell.className = 'line-content';
    contentCell.contentEditable = true;
    contentCell.dataset.line = i;
    contentCell.addEventListener('input', () => {
      // 行番号は固定なので何もしない
    });
    contentCell.addEventListener('keydown', (e) => {
      // Enterで下へ
      if (e.key === 'Enter') {
        e.preventDefault();
        const currentRow = e.target.closest('tr');
        const nextRow = currentRow.nextElementSibling;
        if (nextRow) {
          const nextCell = nextRow.querySelector('.line-content');
          nextCell.focus();
        }
      }
      // 上下矢印で移動
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentRow = e.target.closest('tr');
        let targetRow;
        if (e.key === 'ArrowUp') {
          targetRow = currentRow.previousElementSibling;
        } else {
          targetRow = currentRow.nextElementSibling;
        }
        if (targetRow) {
          const targetCell = targetRow.querySelector('.line-content');
          // キャレット位置を維持
          const sel = window.getSelection();
          const pos = sel && sel.focusOffset ? sel.focusOffset : null;
          targetCell.focus();
          if (pos !== null) {
            // キャレット位置を再現
            const range = document.createRange();
            range.selectNodeContents(targetCell);
            range.collapse(true);
            // 文字数を超えないように
            const len = targetCell.textContent.length;
            const caret = Math.min(pos, len);
            range.setStart(targetCell.firstChild || targetCell, caret);
            range.setEnd(targetCell.firstChild || targetCell, caret);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
      // 先頭でDeleteなら前の段に移動
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        const sel = window.getSelection();
        // キャレットが先頭にあるかつ、空欄または先頭にいる場合
        if (
          sel &&
          sel.anchorNode &&
          sel.anchorOffset === 0 &&
          (
            sel.anchorNode === contentCell ||
            sel.anchorNode === contentCell.firstChild ||
            contentCell.textContent.length === 0
          )
        ) {
          const currentRow = e.target.closest('tr');
          const prevRow = currentRow.previousElementSibling;
          if (prevRow) {
            e.preventDefault();
            const prevCell = prevRow.querySelector('.line-content');
            prevCell.focus();
            // キャレットを末尾に
            const range = document.createRange();
            range.selectNodeContents(prevCell);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
    });

    row.appendChild(numCell);
    row.appendChild(contentCell);
    tbody.appendChild(row);
  }
}

export function getEditorValues(tableId) {
  const tbody = document.getElementById(tableId).querySelector('tbody');
  return Array.from(tbody.querySelectorAll('.line-content')).map(cell => cell.textContent.trim());
}

export function parseHintsEditor(lines) {
  // 各行ごとに分割し、カンマまたはスペースで区切る
  return lines.map(row =>
    row.split(/[\s,]+/).map(Number).filter(n => !isNaN(n) && n > 0)
  );
}

// --------------------------------------------------------------------------
// エディタ風ヒント入力欄の値取得・バリデーション
// --------------------------------------------------------------------------
export function getHints(rows, cols) {
  const rowLines = getEditorValues('rowHintTable');
  const colLines = getEditorValues('colHintTable');
  if (rowLines.length !== rows || colLines.length !== cols) {
    showErrorPopup(`行ヒントは${rows}行、列ヒントは${cols}行で入力してください`);
    return null;
  }
  const rowHints = parseHintsEditor(rowLines);
  const colHints = parseHintsEditor(colLines);

  // validateHintsを利用してバリデーション
  if (window.validateHints) {
    const { errors } = window.validateHints(rowHints, colHints);
    if (errors && errors.length > 0) {
      showErrorPopup(errors.join('\n'));
      return null;
    }
  }
  return { rowHints, colHints };
}

export function resetEditors(rows, cols) {
  createEditorRows('rowHintTable', rows);
  createEditorRows('colHintTable', cols);
}