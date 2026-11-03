/**
 * Componentes do design system OpenWallet (docs/design-system), em TypeScript.
 * Mesma API e mesmas classes `ow-*` do pacote de referência (bundle.js), para o app e a
 * documentação nunca divergirem. Estilos em ./ds.css; tokens em ./tokens.css.
 */
import { useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { privacidade } from './privacidade';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: a ação da tela (uma por tela). ink: ação dentro de um cartão. secondary: alternativa. ghost: ação de texto. */
  variant?: 'primary' | 'ink' | 'secondary' | 'ghost';
  /** md = 44px, lg = 52px (botão fixo no rodapé). */
  size?: 'md' | 'lg';
  /** Ocupa a largura disponível. */
  block?: boolean;
}

export function Button({ variant = 'primary', size = 'md', block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} {...rest} className={cx('ow-btn', `ow-btn--${variant}`, `ow-btn--${size}`, block && 'ow-btn--block', className)} />;
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({ selected, className, ...rest }: ChipProps) {
  return <button type="button" aria-pressed={selected ? 'true' : 'false'} {...rest} className={cx('ow-chip', selected && 'is-selected', className)} />;
}

export type Tom = 'neutral' | 'primary' | 'positive' | 'attention';

export function Tag({ tone = 'neutral', children, className }: { tone?: Tom; children?: ReactNode; className?: string }) {
  return <span className={cx('ow-tag', `ow-tag--${tone}`, className)}>{children}</span>;
}

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "R$ 1.284,50", "+R$ 120,00", "−R$ 186,90" (sinal U+2212). */
export function formatarReais(valor: number, signed = false): string {
  const sinal = valor < 0 ? '−' : signed && valor > 0 ? '+' : '';
  return `${sinal}R$ ${fmt.format(Math.abs(valor))}`;
}

export interface MoneyProps {
  /** Valor em reais. Negativo mostra o sinal − (U+2212). Use `cents` se o número estiver em centavos. */
  value?: number;
  /** Atalho do app: valor em centavos (a API trabalha em centavos). */
  cents?: number;
  size?: 'xl' | 'lg' | 'md' | 'sm';
  /** Mostra + nos positivos e colore positivo/negativo automaticamente. */
  signed?: boolean;
  /** Força a cor. Sem signed, o padrão é neutral. */
  tone?: 'neutral' | 'positive' | 'negative';
  /** Mostra R$ •••• no lugar do valor. Sem a prop, segue o botão de olho do app. */
  hidden?: boolean;
  /** Sem centavos, para rótulos curtos de gráfico ("R$ 184"). */
  compact?: boolean;
  className?: string;
}

const fmtCompacto = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function Money({ value, cents, size = 'md', signed, tone, hidden, compact, className }: MoneyProps) {
  const ocultoGlobal = useSyncExternalStore(privacidade.subscribe, privacidade.get, privacidade.get);
  const v = Number(cents !== undefined ? cents / 100 : value) || 0;
  const cor = tone ?? (signed ? (v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral') : 'neutral');
  const oculto = hidden ?? ocultoGlobal;
  return <span className={cx('ow-money', `ow-money--${size}`, `ow-money--${cor}`, className)}>{oculto ? 'R$ ••••' : compact ? `R$ ${fmtCompacto.format(Math.round(v))}` : formatarReais(v, signed)}</span>;
}

export interface ProgressBarProps {
  /** 0 a 100. */
  value: number;
  /** Nome lido por leitores de tela. */
  label: string;
  /** Divide em N segmentos. Sem isso, barra contínua (meta). */
  segments?: number;
  tone?: 'primary' | 'positive' | 'attention';
  className?: string;
}

export function ProgressBar({ value, label, segments, tone = 'primary', className }: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const aria = { role: 'progressbar', 'aria-label': label, 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100 } as const;
  if (segments) {
    const feitos = Math.round((v / 100) * segments);
    return (
      <div {...aria} className={cx('ow-progress-segs', className)}>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={cx('ow-seg', i < feitos && 'is-done')} />
        ))}
      </div>
    );
  }
  return (
    <div {...aria} className={cx('ow-progress', `ow-progress--${tone}`, className)}>
      <span className="ow-progress__fill" style={{ width: `${v}%` }} />
    </div>
  );
}

export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Nome do que liga e desliga, para leitores de tela. */
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={label}
      disabled={disabled}
      className={cx('ow-toggle', checked && 'is-on')}
      onClick={() => onChange?.(!checked)}
    >
      <span className="ow-toggle__knob" />
    </button>
  );
}

export type StatusSugestao = 'pending' | 'done' | 'later';

export interface SuggestionCardProps {
  /** Categoria curta: Cartão, Reserva, Economia. */
  tag: string;
  tone?: Tom;
  title: string;
  children?: ReactNode;
  /** De onde a sugestão veio. Mostrado ao tocar em "Por que essa sugestão?". */
  why?: string;
  /** Texto do botão principal, começando por verbo. */
  cta?: string;
  /** Mensagem depois de feito. */
  doneText?: string;
  status?: StatusSugestao;
  onStatusChange?: (status: StatusSugestao) => void;
}

export function SuggestionCard(p: SuggestionCardProps) {
  const [porque, setPorque] = useState(false);
  const [status, setStatus] = useState<StatusSugestao>(p.status ?? 'pending');
  const mudar = (s: StatusSugestao) => {
    setStatus(s);
    p.onStatusChange?.(s);
  };
  return (
    <article className="ow-sug">
      <div className="ow-sug__top">
        <Tag tone={p.tone}>{p.tag}</Tag>
        {p.why && (
          <button type="button" className="ow-link" aria-expanded={porque} onClick={() => setPorque(!porque)}>
            Por que essa sugestão?
          </button>
        )}
      </div>
      <h3 className="ow-sug__title">{p.title}</h3>
      {p.children && <p className="ow-sug__body">{p.children}</p>}
      {porque && <p className="ow-note">{p.why}</p>}
      {status === 'pending' ? (
        <div className="ow-sug__actions">
          <Button variant="ink" block onClick={() => mudar('done')}>
            {p.cta ?? 'Fazer agora'}
          </Button>
          <Button variant="secondary" onClick={() => mudar('later')}>
            Agora não
          </Button>
        </div>
      ) : (
        <div className={cx('ow-sug__result', status === 'done' && 'is-done')}>
          <span>{status === 'done' ? (p.doneText ?? 'Feito!') : 'Tudo bem. A gente lembra você amanhã.'}</span>
          <button type="button" className="ow-link" onClick={() => mudar('pending')}>
            Desfazer
          </button>
        </div>
      )}
    </article>
  );
}

/** Nota explicativa ("O que é isso?"): fica fechada e abre ao toque, ao lado do dado. */
export function OQueE({ termo, children, rotulo = 'O que é isso?' }: { termo: string; children: ReactNode; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="ow-link" aria-expanded={aberto} aria-label={`${rotulo} ${termo}`} onClick={() => setAberto(!aberto)}>
        {rotulo}
      </button>
      {aberto && <p className="ow-note">{children}</p>}
    </>
  );
}

/** Iniciais num círculo surface-sunken, no lugar de logos de terceiros (bancos, lojas, contadores). */
export function Iniciais({ nome }: { nome: string }) {
  const palavras = nome
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z]{2,}$/.test(p));
  const ini =
    palavras.length === 1
      ? palavras[0]!.slice(0, 2).toUpperCase()
      : palavras
          .slice(0, 2)
          .map((p) => p[0]!.toUpperCase())
          .join('');
  return (
    <span className="ow-iniciais" aria-hidden="true">
      {ini || nome.slice(0, 2).toUpperCase()}
    </span>
  );
}
