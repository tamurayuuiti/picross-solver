import {
  createEditorRows,
  getEditorValues,
  parseHintsEditor,
} from './hint-input-editor.js';

import {  
  getTextboxHintValues,
  parseTextboxHints,
  resetTextboxHintInputs,
  createTextboxHintInputs,
} from './hint-input-textbox.js';

// --------------------------------------------------------------------------
// ヒント矛盾チェック・バリデーション
// --------------------------------------------------------------------------
function parseHintsTextArea(text) {
  // 各行ごとに分割し、カンマまたはスペースで区切る
  return text.trim().split('\n').map(row =>
    row.split(/[\s,]+/).map(Number).filter(n => !isNaN(n) && n > 0)
  );
}

/**
 * ヒント矛盾チェック（行・列ヒントの合計値や不正値・空欄などを検出）
 * @param {number[][]} rowHints
 * @param {number[][]} colHints
 * @returns {{errors: string[], errorTargets: {type: 'row'|'col', index: number}[]}}
 */
function validateHints(rowHints, colHints) {
  const errors = [];
  const errorTargets = [];
  const height = rowHints.length;
  const width = colHints.length;

  // 各行・列ごとのチェック
  for (let i = 0; i < height; i++) {
    const hint = rowHints[i];
    if (!Array.isArray(hint) || hint.length === 0) {
      errors.push(`${i + 1}行目のヒントが空です`);
      errorTargets.push({ type: 'row', index: i });
      continue;
    }
    if (hint.some(n => !Number.isInteger(n) || n <= 0)) {
      errors.push(`${i + 1}行目のヒントに不正な値があります`);
      errorTargets.push({ type: 'row', index: i });
    }
    const minRequired = hint.reduce((a, b) => a + b, 0) + Math.max(0, hint.length - 1);
    if (minRequired > width) {
      errors.push(`${i + 1}行目のヒントが多すぎます`);
      errorTargets.push({ type: 'row', index: i });
    }
  }

  for (let i = 0; i < width; i++) {
    const hint = colHints[i];
    if (!Array.isArray(hint) || hint.length === 0) {
      errors.push(`${i + 1}列目のヒントが空です`);
      errorTargets.push({ type: 'col', index: i });
      continue;
    }
    if (hint.some(n => !Number.isInteger(n) || n <= 0)) {
      errors.push(`${i + 1}列目のヒントに不正な値があります`);
      errorTargets.push({ type: 'col', index: i });
    }
    const minRequired = hint.reduce((a, b) => a + b, 0) + Math.max(0, hint.length - 1);
    if (minRequired > height) {
      errors.push(`${i + 1}列目のヒントが多すぎます`);
      errorTargets.push({ type: 'col', index: i });
    }
  }

  // 全行・全列の合計値チェック
  const rowSum = rowHints.reduce((sum, hint) => sum + (Array.isArray(hint) ? hint.reduce((a, b) => a + b, 0) : 0), 0);
  const colSum = colHints.reduce((sum, hint) => sum + (Array.isArray(hint) ? hint.reduce((a, b) => a + b, 0) : 0), 0);
  if (rowSum !== colSum) {
    errors.push(`全行ヒントの合計値(${rowSum})と全列ヒントの合計値(${colSum})が一致しません`);
    // errorTargetsへの追加はしない
  }

  return { errors, errorTargets };
}

// --------------------------------------------------------------------------
// スタイル切り替えUI生成
// --------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // 行数・列数を取得
  const rows = parseInt(document.getElementById('rowSize').value, 10) || 15;
  const cols = parseInt(document.getElementById('colSize').value, 10) || 15;

  // テキストボックス型 UI を動的生成
  createTextboxHintInputs(rows, cols);

  // エディタ風 UI を動的生成
  createEditorRows('rowHintTable', rows);
  createEditorRows('colHintTable', cols);

  // ラジオ切り替えイベントを設定
  const radioTextbox = document.getElementById('hintStyleTextbox');
  const radioEditor  = document.getElementById('hintStyleEditor');
  if (radioTextbox && radioEditor) {
    radioTextbox.addEventListener('change', () => {
      if (radioTextbox.checked) {
        switchHintInputStyle('textbox', rows, cols);
      }
    });
    radioEditor.addEventListener('change', () => {
      if (radioEditor.checked) {
        switchHintInputStyle('editor', rows, cols);
      }
    });
  }

  document.getElementById('rowSize').addEventListener('change', () => {
  const newRows = +document.getElementById('rowSize').value;
  createTextboxHintInputs(newRows, cols);
  createEditorRows('rowHintTable', newRows);
  });

  document.getElementById('colSize').addEventListener('change', () => {
  const newCols = +document.getElementById('colSize').value;
  createTextboxHintInputs(rows, newCols);
  createEditorRows('colHintTable', newCols);
  });

  // 初期表示はテキストボックス型
  switchHintInputStyle('textbox', rows, cols);
});

// --------------------------------------------------------------------------
// スタイル切り替えロジック
// --------------------------------------------------------------------------
/**
 * ヒント入力欄のスタイルを切り替える
 * @param {'textbox'|'editor'} style
 * @param {number} rows
 * @param {number} cols
 */
function switchHintInputStyle(style, rows, cols) {
  const textboxBlock = document.getElementById('hintInputTextboxBlock');
  const editorBlock  = document.getElementById('hintInputEditorBlock');

  if (!textboxBlock || !editorBlock) {
    console.warn('hint blocks not found');
    return;
  }

  if (style === 'textbox') {
    createTextboxHintInputs(rows, cols);
    textboxBlock.style.display = '';
    editorBlock.style.display  = 'none';
  } else {
    textboxBlock.style.display = 'none';
    editorBlock.style.display  = '';
    createEditorRows('rowHintTable', rows);
    createEditorRows('colHintTable', cols);
  }

  // ラジオの checked 更新
  const radioTextbox = document.getElementById('hintStyleTextbox');
  const radioEditor  = document.getElementById('hintStyleEditor');
  radioTextbox.checked = style === 'textbox';
  radioEditor.checked  = style === 'editor';
  window.currentHintInputStyle = style;
}

/**
 * 現在のヒント入力欄スタイルで値を取得
 * @param {number} rows
 * @param {number} cols
 * @returns {{rowHints:number[][], colHints:number[][]}|null}
 */
function getHintsUnified(rows, cols) {
  const style = window.currentHintInputStyle || 'textbox';
  let rowHints, colHints;
  if (style === 'textbox') {
    const { rowLines, colLines } = getTextboxHintValues(rows, cols);
    if (rowLines.length !== rows || colLines.length !== cols) {
      showErrorPopup(`行ヒントは${rows}行、列ヒントは${cols}行で入力してください`);
      return null;
    }
    rowHints = parseTextboxHints(rowLines);
    colHints = parseTextboxHints(colLines);
  } else {
    const rowLines = getEditorValues('rowHintTable');
    const colLines = getEditorValues('colHintTable');
    if (rowLines.length !== rows || colLines.length !== cols) {
      showErrorPopup(`行ヒントは${rows}行、列ヒントは${cols}行で入力してください`);
      return null;
    }
    rowHints = parseHintsEditor(rowLines);
    colHints = parseHintsEditor(colLines);
  }
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

/**
 * 現在のヒント入力欄スタイルでリセット
 * @param {number} rows
 * @param {number} cols
 */
function resetHintsUnified(rows, cols) {
  const style = window.currentHintInputStyle || 'textbox';
  if (style === 'textbox') {
    createTextboxHintInputs(rows, cols);
  } else {
    createEditorRows('rowHintTable', rows);
    createEditorRows('colHintTable', cols);
  }
}

// --------------------------------------------------------------------------
// グローバル公開
// --------------------------------------------------------------------------
window.validateHints = validateHints;                   // ヒントのバリデーション関数をグローバル公開
window.parseHintsTextArea = parseHintsTextArea;         // ヒントテキストエリアのパース関数をグローバル公開
window.getHints = getHintsUnified;                      // ヒント取得関数をグローバル公開
window.resetEditors = resetHintsUnified;                // ヒント入力欄のリセット関数をグローバル公開
window.createEditorRows = createEditorRows;             // エディタ風ヒント入力欄の行生成関数をグローバル公開
window.getEditorValues = getEditorValues;               // エディタ風ヒント入力欄の値取得関数をグローバル公開
window.parseHintsEditor = parseHintsEditor;             // エディタ風ヒント入力欄のパース関数をグローバル公開
window.switchHintInputStyle = switchHintInputStyle;     // ヒント入力欄のスタイル切り替え関数をグローバル公開
window.getTextboxHintValues = getTextboxHintValues;     // テキストボックス型ヒント入力欄の値取得関数をグローバル公開
window.parseTextboxHints = parseTextboxHints;           // テキストボックス型ヒント入力欄のパース関数をグローバル公開
window.resetTextboxHintInputs = resetTextboxHintInputs; // テキストボックス型ヒント入力欄のリセット関数をグローバル公開
