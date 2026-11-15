import { uint, int } from "../bod.ts";
import { Endian, Integer } from "../stream.ts";

export const u8 =
  uint(Integer.I8, Endian.Be)
  ;

export const u16 =
  uint(Integer.I16, Endian.Be)
  ;

export const u32 =
  uint(Integer.I32, Endian.Be)
  ;

export const u64 =
  uint(Integer.I64, Endian.Be)
  ;

export const i8 =
  int(Integer.I8, Endian.Be)
  ;

export const i16 =
  int(Integer.I16, Endian.Be)
  ;

export const i32 =
  int(Integer.I32, Endian.Be)
  ;

export const i64 =
  int(Integer.I64, Endian.Be)
  ;
