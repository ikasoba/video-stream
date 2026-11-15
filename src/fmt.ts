type Formats =
  {
    o: unknown;
    O: unknown;
    d: number | bigint;
    i: number | bigint;
    f: number | bigint;
    s: string | { toString(): string };
    c: string | { toString(): string };
  }

export type FormatParams<T> =
  T extends ""
    ? []
  : T extends `%${infer K}${infer R}`
    ? K extends keyof Formats
      ? [Formats[K], ...FormatParams<R>]
      : FormatParams<R>
  : T extends `${infer _}%${infer K}${infer R}`
    ? K extends keyof Formats
      ? [Formats[K], ...FormatParams<R>]
      : FormatParams<R>
  : []
  ;

export const printfln = <K extends string>(printer: (...args: unknown[]) => void, format: K, ...args: FormatParams<K>) => printer(format, ...args);
