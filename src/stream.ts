import type { Readable, Writable } from "node:stream";
import type { EnumToObject } from "./utils.ts";

export function toWebReadable(r: Readable) {
  return new ReadableStream<Uint8Array>({
    type: "bytes",
    async start(controller) {
      const onData =
        (raw: string | Buffer) => {
          const data = typeof raw === "string" ? Buffer.from(raw, "binary") : Buffer.from(raw);

          controller.enqueue(new Uint8Array(data));
        }

      r.addListener("data", onData);

      r.addListener("close", () => {
        controller.close();
      });
    },
  })
}

export function toWebWritable(w: Writable) {
  return new WritableStream<Uint8Array>({
    start(controller) {
      w.once("error", err => {
        controller.error(err);
      })
    },
    close() {
      return new Promise<void>(resolve => w.end(resolve));
    },
    write(data) {
      return new Promise<void>((resolve, reject) => w.write(data, err => err != null ? reject(err) : resolve()));
    }
  })
}

export type Reader = Pick<ReadableStreamBYOBReader, "read">;
export type Writer = Pick<WritableStreamDefaultWriter<Uint8Array>, "write">;

export async function read<T extends ArrayBufferView>(r: Reader, dst: T): Promise<ReadableStreamReadResult<T>> {
  return await r.read(dst);
}

export async function write<T extends ArrayBufferView>(w: Writer, src: T): Promise<void> {
  return await w.write(new Uint8Array(src.buffer, src.byteOffset, src.byteLength));
}

declare namespace _ {
  const enum Integer {
    I8,
    I16,
    I32,
    I64
  }

  const enum Endian {
    Be,
    Le
  }
}

export type Integer = _.Integer;

export const Integer: EnumToObject<typeof _.Integer> = {
  I8: 0,
  I16: 1,
  I32: 2,
  I64: 3,
};

export type Endian = _.Endian
export const Endian: EnumToObject<typeof _.Endian> = {
  Be: 0,
  Le: 1
};

export type IntegerMap = {
  [Integer.I8]: number;
  [Integer.I16]: number;
  [Integer.I32]: number;
  [Integer.I64]: bigint;
}

export async function readUint<K extends Integer>(r: Reader, kind: K, endian: Endian): Promise<IntegerMap[K] | null>;
export async function readUint(r: Reader, kind: Integer, endian: Endian): Promise<IntegerMap[Integer] | null> {
  switch (kind) {
    case Integer.I8:
      {
        const res = await r.read(new DataView(new ArrayBuffer(1)));
        if (res.done) return null;

        return res.value.getUint8(0);
      }

    case Integer.I16:
      {
        const res = await r.read(new DataView(new ArrayBuffer(2)));
        if (res.done) return null;

        return res.value.getUint16(0, endian === Endian.Le);
      }

    case Integer.I32:
      {
        const res = await r.read(new DataView(new ArrayBuffer(4)));
        if (res.done) return null;

        return res.value.getUint32(0, endian === Endian.Le);
      }

    case Integer.I64:
      {
        const res = await r.read(new DataView(new ArrayBuffer(8)));
        if (res.done) return null;

        return res.value.getBigUint64(0, endian === Endian.Le);
      }
  }
}

type WriteArgs<K extends Integer> =
  K extends unknown ? [kind: K, endian: Endian, data: IntegerMap[K]] : never;

export async function writeUint<K extends Integer>(w: Writer, kind: K, endian: Endian, data: IntegerMap[K]): Promise<void>;
export async function writeUint(w: Writer, ...args: WriteArgs<Integer>): Promise<void> {
  switch (args[0]) {
    case Integer.I8:
      {
        const [_kind, _endian, data] = args;
        const view = new DataView(new ArrayBuffer(1));
        view.setUint8(0, data);
        return await write(w, view);
      }

    case Integer.I16:
      {
        const [_kind, endian, data] = args;
        const view = new DataView(new ArrayBuffer(2));
        view.setUint16(0, data, endian === Endian.Le);
        return await write(w, view);
      }

    case Integer.I32:
      {
        const [_kind, endian, data] = args;
        const view = new DataView(new ArrayBuffer(4));
        view.setUint32(0, data, endian === Endian.Le);
        return await write(w, view);
      }

    case Integer.I64:
      {
        const [_kind, endian, data] = args;
        const view = new DataView(new ArrayBuffer(8));
        view.setBigUint64(0, data, endian === Endian.Le);
        return await write(w, view);
      }
  }
}
