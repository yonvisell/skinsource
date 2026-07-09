/// <reference types="vite/client" />

declare module "fft.js" {
  export default class FFT {
    constructor(size: number);
    size: number;
    createComplexArray(): number[];
    realTransform(out: number[], input: ArrayLike<number>): void;
    completeSpectrum(spectrum: number[]): void;
    transform(out: number[], input: ArrayLike<number>): void;
    inverseTransform(out: number[], input: ArrayLike<number>): void;
  }
}
