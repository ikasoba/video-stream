import { createServer } from "node:net";
import { writeFile, appendFile } from "node:fs/promises";
import { toWebReadable, toWebWritable, type Reader, type Writer } from "./src/stream.ts";
import { C1Packet, C2Packet, generateC1Random, timestampOf, Version } from "./src/rtmp.ts";
import * as bod from "./src/bod.ts";
import { printfln } from "./src/fmt.ts";

const sleep =
  (d: number) =>
    new Promise<void>(resolve => setTimeout(resolve, d));

function* printHex(data: Uint8Array) {
  const lnSize = 10 + 3 * 16 - 1;
  const dec = new TextDecoder();

  for (let i = 0; i < data.length; i += 16) {
    const s = data.slice(i, i + 16);

    let ln = `${i.toString(16).padStart(8, "0")}: ${[...s].map(x => x.toString(16).padStart(2, "0")).join(" ")}`;
    ln = ln.padEnd(lnSize, " ");

    ln += " " + JSON.stringify(dec.decode(s));

    yield ln
  }
}

async function handshake(r: Reader, w: Writer) {
  const c0 = await Version.decode(r).then(bod.unwrap);

  await Version.encode(w, c0);

  const c1 = await C1Packet.decode(r).then(bod.unwrap);
  const c1Time = Date.now();

  const s1: C1Packet = {
    time: timestampOf(Date.now()),
    zero: 0,
    random: c1.random
  };

  await C1Packet.encode(w, s1);

  const c1LoadTime = timestampOf(Date.now() - c1Time);

  const s2: C2Packet = {
    time: c1.time,
    time2: c1LoadTime,
    random: c1.random
  };

  await C2Packet.encode(w, s2);

  const c2 = await C2Packet.decode(r).then(bod.unwrap);

  return true;
}

const server =
  createServer(async conn => {
    await using dstack = new AsyncDisposableStack();

    await writeFile("log", "", "binary");

    const inbound = toWebReadable(conn);
    const outbound = toWebWritable(conn);
    dstack.defer(async () => {
      console.log("closed");
      await outbound.close();
    });

    conn.addListener("data", async raw => {
      const data = typeof raw === "string" ? Buffer.from(raw, "binary") : Buffer.from(raw);

      await appendFile("log", data, "binary");

      console.log(new Date());

      for (const ln of printHex(data)) console.log(ln);
    });

    const r = inbound.getReader({ mode: "byob" });
    const w = outbound.getWriter();
    dstack.defer(async () => {
      w.releaseLock();
      r.releaseLock();
    });

    if (!handshake(r,w)) {
      return;
    }

    await sleep(3000);
  });

server.listen(11451);
