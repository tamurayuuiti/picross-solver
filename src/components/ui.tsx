// ============================================================================
// ui.tsx
// アプリ全体で共有する最小限のデザインシステム・プリミティブ。
//
// 方針:
// - 新規にロジックやStateを持つコンポーネントは作らない（純粋な見た目の
//   プリミティブのみ）。既存の機能・状態管理・イベントには一切関与しない。
// - Card / SectionHeading / Button / Badge / Alert / FieldShell の6つに絞り、
//   既存の各画面（ヒント入力・エラー表示・統計・プレビュー・設定）が
//   この6つの組み合わせだけで表現できることを確認した上で導入する。
// - 色は用途別に固定する: neutral(基本) / accent(操作・選択) / success / warning
//   / danger の5系統のみを使い、コンポーネントごとに独自の色を持たせない。
// ============================================================================

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

// ----------------------------------------------------------------------------
// Card: セクションを囲む共通の枠。ヒント入力・エラー表示・統計・プレビュー・
// 設定など、サイドバー/メインの各ブロックがすべて同じ枠の中に収まる。
// ----------------------------------------------------------------------------
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  /** padding を抑えたい場合（盤面のように内側コンポーネントが既に余白を持つ場合）。 */
  readonly tight?: boolean;
}

export function Card({ children, tight, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white ${tight ? 'p-3' : 'p-4'} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SectionHeading: カード内の見出し。本文・補助説明との階層を一定にする。
// ----------------------------------------------------------------------------
interface SectionHeadingProps {
  readonly children: ReactNode;
  readonly description?: ReactNode;
  readonly trailing?: ReactNode;
}

export function SectionHeading({ children, description, trailing }: SectionHeadingProps) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-[13px] font-semibold tracking-wide text-slate-700">{children}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>}
      </div>
      {trailing && <div className="flex-none">{trailing}</div>}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Button: 全操作ボタンの統一スタイル。variant で意味を分け、size で密度を分ける。
// - primary: 主操作（解く、確定など）。1画面に基本1つ。
// - secondary: 並列の操作（リセット、テンプレート適用など）。
// - ghost: 軽い操作（折りたたみトグル、行番号ジャンプ等の地味な操作）。
// - subtle-accent: プリセットボタンなど「選ぶと内容が変わる」操作。
// ----------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle-accent';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 active:bg-slate-800',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-slate-500 hover:bg-slate-100 active:bg-slate-200',
  'subtle-accent': 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:bg-indigo-200',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    />
  );
}

// ----------------------------------------------------------------------------
// Badge: 件数表示・状態ドットなどの小さなラベル。
// ----------------------------------------------------------------------------
type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  accent: 'bg-indigo-50 text-indigo-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
  readonly className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// ----------------------------------------------------------------------------
// StatusDot: 解析状態（待機中/解析中/解けた/矛盾...）を表す丸インジケータ。
// ----------------------------------------------------------------------------
type StatusTone = 'neutral' | 'progress' | 'success' | 'danger';

const STATUS_DOT_TONE: Record<StatusTone, string> = {
  neutral: 'bg-slate-300',
  progress: 'bg-amber-500',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
};

export function StatusDot({ tone }: { readonly tone: StatusTone }) {
  return <span className={`h-2 w-2 flex-none rounded-full ${STATUS_DOT_TONE[tone]}`} />;
}

// ----------------------------------------------------------------------------
// Alert: 警告・エラー・矛盾通知の統一フォーマット。
// アイコン・色・枠線・強調方法をすべてここに集約し、呼び出し側はtone と
// 内容だけを渡す。
// ----------------------------------------------------------------------------
type AlertTone = 'warning' | 'danger';

const ALERT_TONE: Record<AlertTone, { wrap: string; badge: string }> = {
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-800',
    badge: 'bg-amber-500',
  },
  danger: {
    wrap: 'border-red-200 bg-red-50 text-red-700',
    badge: 'bg-red-500',
  },
};

export function Alert({
  tone,
  children,
}: {
  readonly tone: AlertTone;
  readonly children: ReactNode;
}) {
  const t = ALERT_TONE[tone];
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${t.wrap}`}>
      <span
        className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white ${t.badge}`}
      >
        !
      </span>
      <div className="space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Disclosure: 統計パネル・解答再生パネルが共通で使う「折りたたみセクション」の
// ヘッダー部分。中身（折りたたまれる内容）は呼び出し側の既存実装をそのまま
// 使い、ヘッダーの見た目だけをここで統一する。
// ----------------------------------------------------------------------------
export function DisclosureHeader({
  label,
  open,
  onToggle,
  trailing,
}: {
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <span className="flex items-center gap-2">
        {label}
        {trailing}
      </span>
      <span
        className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      >
        ▾
      </span>
    </button>
  );
}