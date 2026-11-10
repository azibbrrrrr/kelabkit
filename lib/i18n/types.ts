import type { ms } from "./ms";

/** The shape of the Bahasa Melayu dictionary with every leaf widened to `string`. */
export type DeepStringify<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]> };

/** Every dictionary must have exactly the keys of `ms`: a missing or extra key is a type error. */
export type Messages = DeepStringify<typeof ms>;

/** Dotted paths to the string leaves of an object type: `{ a: { b: string } }` gives `"a.b"`. */
export type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
