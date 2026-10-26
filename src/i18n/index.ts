// Centralized microcopy. English only today; adding a language means adding a JSON file.
import en from './en.json';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type CopyKey = Leaves<typeof en>;

export function t(key: CopyKey, vars: Record<string, string | number> = {}): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

/** Pick the singular key when n is 1. */
export function tn(one: CopyKey, many: CopyKey, n: number) {
  return n === 1 ? t(one, { n }) : t(many, { n });
}
