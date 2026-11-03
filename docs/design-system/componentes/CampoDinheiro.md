# CampoDinheiro e CampoDocumento

Campos pensados para o teclado do celular. Código em `apps/web/src/ux/campos.tsx`.

## CampoDinheiro

- Abre o teclado decimal (`inputMode="decimal"`), com "R$" fixo à esquerda e o valor em Geist Mono.
- Aceita só algarismos, vírgula e ponto. Ao sair do campo, formata no padrão brasileiro: "1234,5" vira "1.234,50" e "90.000" vira "90.000,00".
- O valor continua texto; converta com `parseReais()` (`apps/web/src/format.ts`), que entende "90.000" como noventa mil.
- `dica` aparece embaixo; `erro` aparece em `negative` e marca o campo com `aria-invalid`.

```tsx
<CampoDinheiro rotulo="Valor do recibo (R$)" value={valor} onChange={setValor} dica="Sem centavos? Pode digitar só o número." />
```

## CampoDocumento

- Teclado numérico, máscara automática: CPF (529.982.247-25) até 11 dígitos, CNPJ (11.222.333/0001-81) com 14.
- Antes de enviar para a API, tire a máscara: `doc.replace(/\D/g, '')`.

```tsx
<CampoDocumento rotulo="CPF ou CNPJ de quem recebeu" value={doc} onChange={setDoc} dica="Sem ele, a despesa médica é o motivo nº 1 de malha fina." />
```
