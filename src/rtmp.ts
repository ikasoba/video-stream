import { Endian, Integer, read, readUint, write, writeUint, type Reader, type Writer } from "./stream.ts";
import * as bod from "./bod.ts";
import * as integers from "./bod/integer.ts";

export const timestampOf = (x: bigint | number) => BigInt(x) & 0xFFFF_FFFFn;

export type Timestamp = bod.infer<typeof Timestamp>;
export const Timestamp =
  bod.codec(
    integers.u32,
    integers.u32,
    x => BigInt(x) & 0xFFFF_FFFFn,
    x => Number(x) & 0xFFFF_FFFF
  );

export interface MessageHeader {
  type: number;
  payloadLength: number;
  timestamp: number;
  streamID: number;
}

export async function readMessageHeader(r: Reader): Promise<MessageHeader | null> {
  let n = await readUint(r, Integer.I32, Endian.Be);
  if (n === null) return null;

  const msgType = n & 0xF, payloadSize = n >>> 8;
  const ts = await readUint(r, Integer.I32, Endian.Be);
  if (ts === null) return null;

  const idResult = await read(r, new Uint8Array(3));
  if (idResult.done) return null;

  const id =
    idResult.value.reduceRight((p, c, i) => p | (c << (8 * i)), 0);

  return {
    type: msgType,
    payloadLength: payloadSize,
    timestamp: ts,
    streamID: id
  }
}

export type Version = bod.infer<typeof Version>;
export const Version = integers.u8;

export interface C1Packet {
  time: Timestamp;
  zero: number;
  random: Uint8Array;
}

export const C1Packet: bod.BodType<C1Packet> =
  bod.struct({
    time: Timestamp,
    zero: integers.u32,
    random: bod.bytes(1528)
  });

export interface C2Packet {
  time: Timestamp;
  time2: Timestamp;
  random: Uint8Array;
}

export const C2Packet: bod.BodType<C2Packet> =
  bod.struct({
    time: Timestamp,
    time2: Timestamp,
    random: bod.bytes(1528)
  })

export function generateC1Random() {
  return new Uint8Array(1528).map(() => (Math.random() * 255) >>> 0);
}
