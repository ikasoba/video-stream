import { Endian, Integer, type IntegerMap, type Reader, type Writer } from "./stream.ts";

export type CodecResult<T> =
  | { readonly ok: true; value: T; }
  | { readonly ok: false; }
  ;

export const No = { ok: false } as const;

export interface BodType<T> {
  decode(r: Reader): Promise<CodecResult<T>>;
  encode(w: Writer, data: T): Promise<void>;
}

export interface BodBytes extends BodType<Uint8Array> {
  kind: "bytes";
  size: number;
}


let cache: Map<number, BodBytes> | undefined;
let isCacheClearQueued = false;

/* @__NO_SIDE_EFFECTS__ */
export const bytes =
  (size: number): BodBytes => {
    let cached = cache?.get(size);
    if (cached != null) return cached;

    cached ??= {
      kind: "bytes",
      size,
      decode: async r => {
        const buf = new Uint8Array(size);
        let n = 0;

        while (n < size) {
          const result = await r.read(buf.slice(n));
          if (result.done) return No;

          buf.set(result.value, n);

          n += result.value.length;

          console.log(n, size)
        }

        return { ok: true, value: buf };
      },
      encode: (w, data) => w.write(data)
    };

    if (isCacheClearQueued) {
      isCacheClearQueued = true;
      queueMicrotask(() => {
        cache = undefined;
        isCacheClearQueued = false;
      });
    }

    return cached;
  };

export interface BodObject<T> extends BodType<T> {
  kind: "object";
  entries: { [K in keyof T]: BodType<T[K]> };
}

export const struct =
  <T extends { [K in keyof T]: T[K] }>(entries: { [K in keyof T]: BodType<T[K]> }): BodObject<T> =>
  ({
    kind: "object",
    entries,
    decode: async r => {
      const output: Record<string, unknown> = {};

      for (const k in entries) {
        const schema = entries[k]!;

        const result = await schema.decode(r);
        if (!result.ok) return result;

        output[k] = result.value;
      }

      return { ok: true, value: output as T };
    },
    encode: async (w, data) => {
      for (const k in entries) {
        const schema = entries[k]!;

        await schema.encode(w, data[k]);
      }
    },
  })

export interface BodConstant extends BodType<Uint8Array> {
  kind: "constant";
  constant: Uint8Array;
}

export const constant =
  <T extends ArrayBufferView>(data: T): BodConstant => {
    const buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    return {
      kind: "constant",
      constant: buf,
      decode: async r => {
        const tmp = await r.read(new Uint8Array(buf.length));
        if (tmp.done) return No;

        for (let i = 0; i < buf.length; i++) {
          if (tmp.value[i] !== buf[i]) return No;
        }

        return { ok: true, value: tmp.value };
      },
      encode: async (w, data) => {
        return w.write(data);
      },
    };
  }

export type UnionBodType<T> =
  T extends unknown ? BodType<T> : never;

export type BodTypeArray<A extends unknown[]> =
  { [K in keyof A]: K extends `${number}` ? BodType<A[K]> : A[K]; };

export type UnionType<H, U> =
  U extends unknown ? [H, BodType<U>, U] : never;

export interface BodUnion<H, U extends unknown[]> extends BodType<UnionType<H, U[number]>> {
  kind: "union";
  header: BodType<H>;
  schemas: BodTypeArray<U>;
}

export const union =
  <H extends {}, U extends {}[]>(header: BodType<H>, schemas: BodTypeArray<U>, mapFn: (header: H, schemas: BodTypeArray<U>) => UnionBodType<U[number]>): BodUnion<H, U> =>
  ({
    kind: "union",
    header,
    schemas,
    decode: async r => {
      const h = await header.decode(r);
      if (!h.ok) return No;

      const schema = mapFn(h.value, schemas);

      const data = await schema.decode(r);
      if (!data.ok) return No;

      return { ok: true, value: [h, schema, data] as unknown as UnionType<H, U[number]> };
    },
    encode: async (w, data) => {
      await header.encode(w, data[0]);
      await data[1]!.encode(w, data[2]);
    },
  })

export interface CodecConverter<In, Out> {
  (input: In):
    | Out
    | Promise<Out>
    ;
}

export interface BodCodec<In, Out, T> extends BodType<T> {
  kind: "codec";
  input: BodType<In>;
  output: BodType<Out>;
  decoder: CodecConverter<In, T>;
  encoder: CodecConverter<T, Out>;
}

export const codec =
  <In, Out, T>(input: BodType<In>, output: BodType<Out>, decoder: CodecConverter<In, T>, encoder: CodecConverter<T, Out>): BodCodec<In, Out, T> =>
  ({
    kind: "codec",
    input,
    output,
    decoder,
    encoder,
    decode: async r => {
      const res = await input.decode(r);
      if (!res.ok) return No;

      return { ok: true, value: await decoder(res.value) };
    },
    encode: async (w, data) => {
      await output.encode(w, await encoder(data));
    }
  })

/* @__NO_SIDE_EFFECTS__ */
const createIntCodec =
  <T>(size: number, get: (view: DataView) => T, set: (view: DataView, value: T) => void) =>
    codec(
      bytes(size),
      bytes(size),
      x => {
        const view = new DataView(x.buffer, x.byteOffset, x.byteLength);

        return get(view);
      },
      x => {
        const view = new DataView(new ArrayBuffer(size));

        set(view, x);

        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      }
    );

export const uint: {
  <K extends Integer>(kind: K, endian: Endian): BodType<IntegerMap[K]>;
  (kind: Integer, endian: Endian): BodType<IntegerMap[Integer]>;
} =
  (kind: Integer, endian: Endian): BodType<IntegerMap[Integer]> => {
    const isLe = endian === Endian.Le;

    switch (kind) {
      case Integer.I8:
        return createIntCodec(1, view => view.getUint8(0), (view, x) => view.setUint8(0, x));

      case Integer.I16:
        return createIntCodec(2, view => view.getUint16(0, isLe), (view, x) => view.setUint16(0, x, isLe));

      case Integer.I32:
        return createIntCodec(4, view => view.getUint32(0, isLe), (view, x) => view.setUint32(0, x, isLe));

      case Integer.I64:
        return createIntCodec(8, view => view.getBigUint64(0, isLe), (view, x) => view.setBigUint64(0, x, isLe));
    }
  }

export const int: {
  <K extends Integer>(kind: K, endian: Endian): BodType<IntegerMap[K]>;
  (kind: Integer, endian: Endian): BodType<IntegerMap[Integer]>;
} =
  (kind: Integer, endian: Endian): BodType<IntegerMap[Integer]> => {
    const isLe = endian === Endian.Le;

    switch (kind) {
      case Integer.I8:
        return createIntCodec(1, view => view.getInt8(0), (view, x) => view.setInt8(0, x));

      case Integer.I16:
        return createIntCodec(2, view => view.getInt16(0, isLe), (view, x) => view.setInt16(0, x, isLe));

      case Integer.I32:
        return createIntCodec(4, view => view.getInt32(0, isLe), (view, x) => view.setInt32(0, x, isLe));

      case Integer.I64:
        return createIntCodec(8, view => view.getBigInt64(0, isLe), (view, x) => view.setBigInt64(0, x, isLe));
    }
  }

export type infer<T> = T extends BodType<infer R> ? R : never;

export const unwrap = <T>(result: CodecResult<T>): T => {
  if (!result.ok) throw result;

  return result.value;
}
