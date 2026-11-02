import type {BuildResult, Metafile} from 'esbuild';
export type BundleProof = {emittedInputs: Array<{input: string; bytes: number; output: string}>; forbidden: string[]; note: string};
export type LocalBundle = BuildResult<{write: false; metafile: true}> & {proof: BundleProof};
export const defaultOutdir: string;
export function inspectBundle(metafile: Metafile): BundleProof;
export function bundleLocalDemo(options?: {write?: boolean; outdir?: string}): Promise<LocalBundle>;
