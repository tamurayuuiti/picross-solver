import {
  createEditorRows,
  getEditorValues,
  parseHintsEditor,
} from './editor.js';

import {
  getTextboxHintValues,
  parseTextboxHints,
  resetTextboxHintInputs,
  createTextboxHintInputs,
} from './textbox.js';

import {
  solvePicross
} from '../solver/solver.js';

// --------------------------------------------------------------------------
// AppHints モジュール: グローバル window 汚染を避け、明示的に機能を公開
// --------------------------------------------------------------------------
window.AppHints = (() => {
  const state = {
    currentHintInputStyle: 'textbox',
  };

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
  // DOM 値の取得補助関数
  // --------------------------------------------------------------------------
  function getRowSize() {
    return parseInt(document.getElementById('rowSize').value, 10) || 15;
  }

  function getColSize() {
    return parseInt(document.getElementById('colSize').value, 10) || 15;
  }

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
    const editorBlock = document.getElementById('hintInputEditorBlock');
    if (!textboxBlock || !editorBlock) return;

    if (style === 'textbox') {
      createTextboxHintInputs(rows, cols);
      textboxBlock.style.display = '';
      editorBlock.style.display = 'none';
    } else {
      createEditorRows('rowHintTable', rows);
      createEditorRows('colHintTable', cols);
      textboxBlock.style.display = 'none';
      editorBlock.style.display = '';
    }

    document.getElementById('hintStyleTextbox').checked = style === 'textbox';
    document.getElementById('hintStyleEditor').checked = style === 'editor';
    state.currentHintInputStyle = style;
  }

  /**
   * 現在のヒント入力欄スタイルで値を取得
   * @param {number} rows
   * @param {number} cols
   * @returns {{rowHints:number[][], colHints:number[][]}|null}
   */
  function getHints(rows, cols) {
    const style = state.currentHintInputStyle;
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

    const { errors } = validateHints(rowHints, colHints);
    if (errors.length > 0) {
      showErrorPopup(errors.join('\n'));
      return null;
    }

    return { rowHints, colHints };
  }

  /**
   * 現在のヒント入力欄スタイルでリセット
   * @param {number} rows
   * @param {number} cols
   */
  function resetHints(rows, cols) {
    switchHintInputStyle(state.currentHintInputStyle, rows, cols);
  }

  // --------------------------------------------------------------------------
  // UI イベントハンドラ初期化
  // --------------------------------------------------------------------------
  function setupHintStyleSwitch(rows, cols) {
    document.getElementById('hintStyleTextbox').addEventListener('change', () => {
      if (document.getElementById('hintStyleTextbox').checked) {
        switchHintInputStyle('textbox', rows, cols);
      }
    });
    document.getElementById('hintStyleEditor').addEventListener('change', () => {
      if (document.getElementById('hintStyleEditor').checked) {
        switchHintInputStyle('editor', rows, cols);
      }
    });
  }

  function setupSizeChangeHandlers() {
    document.getElementById('rowSize').addEventListener('change', () => {
      const newRows = getRowSize();
      const cols = getColSize();
      switchHintInputStyle(state.currentHintInputStyle, newRows, cols);
    });

    document.getElementById('colSize').addEventListener('change', () => {
      const newCols = getColSize();
      const rows = getRowSize();
      switchHintInputStyle(state.currentHintInputStyle, rows, newCols);
    });
  }

  // --------------------------------------------------------------------------
  // 初期化処理
  // --------------------------------------------------------------------------
  function initApp() {
    const rows = getRowSize();
    const cols = getColSize();

    createTextboxHintInputs(rows, cols);
    createEditorRows('rowHintTable', rows);
    createEditorRows('colHintTable', cols);
    setupHintStyleSwitch(rows, cols);
    setupSizeChangeHandlers();
    switchHintInputStyle('textbox', rows, cols); // 初期表示はテキストボックス型
  }

  document.addEventListener('DOMContentLoaded', initApp);

  // --------------------------------------------------------------------------
  // 外部公開 API
  // --------------------------------------------------------------------------
  return {
    validateHints,                  // ヒントのバリデーション関数
    parseHintsTextArea,             // ヒントテキストエリアのパース関数
    getHints,                       // ヒント取得関数
    resetHints,                     // ヒント入力欄のリセット関数
    switchHintInputStyle,           // ヒント入力欄のスタイル切り替え関数
    createEditorRows,               // エディタ風ヒント入力欄の行生成関数
    getEditorValues,                // エディタ風ヒント入力欄の値取得関数
    parseHintsEditor,               // エディタ風ヒント入力欄のパース関数
    getTextboxHintValues,           // テキストボックス型ヒント入力欄の値取得関数
    parseTextboxHints,              // テキストボックス型ヒント入力欄のパース関数
    resetTextboxHintInputs,         // テキストボックス型ヒント入力欄のリセット関数
    solvePicross,                   // ピクロスの解法関数（未実装）
  };
})();
