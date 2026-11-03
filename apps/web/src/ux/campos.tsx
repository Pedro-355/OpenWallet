/**
 * Campos pensados para o teclado do celular: teclado numérico certo, máscara enquanto digita,
 * nada de zoom ao focar (16px) e a tecla "Ir/Concluído" no lugar do Enter.
 */
import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { parseReais } from '../format';

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1234,5" → "1.234,50" (mantém vazio e o que não for número). */
export function formatarDinheiroDigitado(texto: string): string {
  const cents = parseReais(texto);
  return cents === null ? texto : fmt.format(cents / 100);
}

/** Só deixa algarismos, vírgula e ponto (o teclado decimal de alguns Android traz outros sinais). */
export const limparDinheiro = (texto: string) => texto.replace(/[^\d.,]/g, '').slice(0, 16);

interface CampoBase {
  rotulo: string;
  dica?: ReactNode;
  erro?: string;
}

/**
 * Valor em reais: teclado decimal, "R$" fixo à esquerda e formatação ao sair do campo.
 * O valor continua sendo texto (como o usuário digitou); converta com parseReais.
 */
export function CampoDinheiro({ rotulo, dica, erro, value, onChange, ...rest }: CampoBase & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-prefixo">
        <span aria-hidden="true">R$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0,00"
          {...rest}
          value={value}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || dica ? `${id}-dica` : undefined}
          onChange={(e) => onChange(limparDinheiro(e.target.value))}
          onBlur={(e) => {
            onChange(formatarDinheiroDigitado(value));
            rest.onBlur?.(e);
          }}
        />
      </div>
      {(erro || dica) && (
        <span id={`${id}-dica`} className={erro ? 'campo-erro' : 'caption'}>
          {erro ?? dica}
        </span>
      )}
    </div>
  );
}

/** "52998224725" → "529.982.247-25"; 14 dígitos → "11.222.333/0001-81". */
export function mascararDocumento(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, (_, a, b, c, e, f) => `${a}.${b}.${c}/${e}${f ? `-${f}` : ''}`);
}

/** CPF ou CNPJ: teclado numérico e máscara automática conforme a quantidade de dígitos. */
export function CampoDocumento({ rotulo, dica, erro, value, onChange, ...rest }: CampoBase & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="next"
        placeholder="CPF ou CNPJ"
        {...rest}
        value={value}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro || dica ? `${id}-dica` : undefined}
        onChange={(e) => onChange(mascararDocumento(e.target.value))}
      />
      {(erro || dica) && (
        <span id={`${id}-dica`} className={erro ? 'campo-erro' : 'caption'}>
          {erro ?? dica}
        </span>
      )}
    </div>
  );
}

/** Segmentos (abas internas) para dividir telas longas em partes curtas. */
export function Segmentos<T extends string>({ opcoes, atual, onTrocar, rotulo }: { opcoes: { id: T; rotulo: string; contador?: number }[]; atual: T; onTrocar: (id: T) => void; rotulo: string }) {
  return (
    <div className="segmentos" role="tablist" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === atual}
          className={o.id === atual ? 'is-selected' : ''}
          onClick={() => onTrocar(o.id)}
        >
          {o.rotulo}
          {o.contador ? <span className="segmentos__contador">{o.contador}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Lembra o segmento escolhido de cada tela durante a sessão (volta onde estava ao trocar de aba). */
const memoria = new Map<string, string>();
export function useSegmento<T extends string>(tela: string, inicial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (memoria.get(tela) as T | undefined) ?? inicial);
  useEffect(() => {
    memoria.set(tela, v);
  }, [tela, v]);
  return [v, setV];
}

/** Só para testes. */
export const _limparSegmentos = () => memoria.clear();
