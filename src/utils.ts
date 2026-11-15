export type EnumToObject<T> = { [ K in keyof T]: T[K]; }
