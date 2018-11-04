/// <reference types="node" />
import http, { ServerHttp2Stream, Http2Stream } from 'http2';
import pug from 'pug';
import { LoadFilesResponse } from './helpers/loadFiles';
import cp from 'child_process';
interface IncomingObject {
    stream: http.ServerHttp2Stream;
    headers: http.IncomingHttpHeaders;
    flag: number;
    query: {
        [key: string]: string;
    };
}
interface Middleware {
    method: string;
    listener: (this: Rutux, req: IncomingObject, next: Middleware | (() => void)) => void;
}
interface Route {
    method: 'GET' | 'POST' | 'PUSH' | '*';
    path: string;
    listener: (this: Rutux, req: IncomingObject) => void;
}
interface CompilerOptions {
    in: string;
    out: string;
    ext: string;
}
interface TsOptions extends CompilerOptions {
}
interface SassOptions extends CompilerOptions {
}
interface Templates {
    [name: string]: pug.compileTemplate;
}
interface RutuxOptions {
    secure?: boolean;
    templatesDir: string;
    publicDir: string;
    sassOptions: SassOptions;
    tsOptions: TsOptions;
}
export default class Rutux {
    app: http.Http2Server;
    port: number;
    middleware: Middleware[];
    templates: Templates;
    routes: Route[];
    sassOptions: SassOptions;
    tsOptions: TsOptions;
    serverOptions: RutuxOptions;
    files: Map<string, LoadFilesResponse>;
    stdin: NodeJS.Socket;
    tsCompiler: cp.ChildProcess | null;
    static validMethods: string[];
    static defaultServerOptions: RutuxOptions;
    constructor(options: RutuxOptions);
    onStream(stream: http.ServerHttp2Stream, headers: http.IncomingHttpHeaders, flag: number): Promise<void>;
    pushAssets(stream: ServerHttp2Stream, assets: string[]): void;
    /**
     * @deprecated
     */
    compileTs(): Promise<void>;
    watchTs(): Promise<cp.ChildProcess>;
    compileSass(): Promise<void>;
    compileTemplates(dir: string): Promise<Templates>;
    private inputHandler;
    private route;
    use(middleware: Middleware): Error | null;
    hook(route: Route): Error | null;
    render(stream: Http2Stream, template: string, props?: {
        [key: string]: any;
    }): Error | null;
    readBody(stream: Http2Stream): Promise<string | Buffer>;
    isDev(): boolean;
    apport(port?: number): void;
}
export {};
