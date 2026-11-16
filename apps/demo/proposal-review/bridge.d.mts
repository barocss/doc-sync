export type ReviewConfig={endpoint:string;token:string;editorUrl:string;document:string};
export function readReviewConfig(path:string):Promise<ReviewConfig>;
export function startReviewServer(options:{configPath:string;port?:number;assetsDir?:string}):Promise<{origin:string;bootstrapUrl:string;close:()=>Promise<void>}>;
