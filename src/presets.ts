// ============================================================================
// presets.ts
// 開発・テスト用のピクロスヒントプリセット定義。
// ============================================================================

import type { HintLines } from '@/types';

export interface PicrossPreset {
  readonly id: string;
  readonly name: string;
  readonly rows: number;
  readonly cols: number;
  readonly rowHints: HintLines;
  readonly colHints: HintLines;
}

export const PRESETS: readonly PicrossPreset[] = [
  {
    id: 'small-test',
    name: 'Small Test (5x5)',
    rows: 5,
    cols: 5,
    rowHints: [
      [1],
      [3],
      [5],
      [3],
      [1]
    ],
    colHints: [
      [1],
      [3],
      [5],
      [3],
      [1]
    ]
  },
  {
    id: 'heart',
    name: 'Heart (10x10)',
    rows: 10,
    cols: 10,
    rowHints: [
      [2, 2],
      [8],
      [10],
      [10],
      [10],
      [8],
      [6],
      [4],
      [2],
      []
    ],
    colHints: [
      [3],
      [5],
      [7],
      [8],
      [8],
      [8],
      [8],
      [7],
      [5],
      [3]
    ]
  },
  {
    id: 'simple-demo',
    name: 'Smile Demo (10x10)',
    rows: 10,
    cols: 10,
    rowHints: [
      [],
      [2, 2],
      [2, 2],
      [],
      [],
      [1, 1],
      [2, 2],
      [6],
      [4],
      []
    ],
    colHints: [
      [],
      [2],
      [2, 2],
      [2, 2],
      [2],
      [2],
      [2, 2],
      [2, 2],
      [2],
      []
    ]
  }
];