import type {BuildResult, Metafile} from 'esbuild';
export type BundleProof = {emittedInputs: Array<{input: string; bytes: number; output: string}>; note: string};
export type ClientBundle = BuildResult<{write: false; metafile: true}> & {proof: BundleProof};
export const defaultOutdir: string;
export function inspectBundle(metafile: Metafile): BundleProof;
export function bundleClientDemo(options?: {write?: boolean; outdir?: string}): Promise<ClientBundle>;
