// opentype.js – we use it loosely via `any` in hooks.ts; this declaration
// just suppresses the "no type declarations" TypeScript error.
declare module "opentype.js" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function parse(buffer: ArrayBuffer): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function load(url: string): Promise<any>;
}
