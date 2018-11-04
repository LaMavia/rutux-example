export interface LoadFilesResponse {
    fileDescriptor: number;
    headers: {
        'content-length': number;
        'last-modified': string;
        'content-type': string;
    };
}
export declare const loadFiles: (dir: string, prefix: string) => Promise<Map<string, LoadFilesResponse>>;
