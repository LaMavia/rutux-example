"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = __importDefault(require("http2"));
const pug_1 = __importDefault(require("pug"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const node_sass_1 = __importDefault(require("node-sass"));
const loadFiles_1 = require("./helpers/loadFiles");
const child_process_1 = __importDefault(require("child_process"));
const parseQuery_1 = require("./helpers/parseQuery");
const handleRefusedStream_1 = __importDefault(require("./helpers/handleRefusedStream"));
class Rutux {
    constructor(options) {
        this.port = 8000;
        this.middleware = [];
        this.templates = {};
        this.routes = [];
        this.tsCompiler = null;
        this.serverOptions = Object.assign({}, Rutux.defaultServerOptions, options);
        const { sassOptions, tsOptions, templatesDir, publicDir } = this.serverOptions;
        this.files = new Map();
        this.sassOptions = Object.assign({}, sassOptions, { in: path_1.default.resolve(__dirname, '../..', sassOptions.in), out: path_1.default.resolve(__dirname, '../..', sassOptions.out) });
        this.tsOptions = Object.assign({}, tsOptions, { in: path_1.default.resolve(__dirname, '../..', tsOptions.in), out: path_1.default.resolve(__dirname, '../..', tsOptions.out) });
        const cert = fs_extra_1.default.readFileSync(path_1.default.resolve(__dirname, '../..', 'localhost.crt'));
        const key = fs_extra_1.default.readFileSync(path_1.default.resolve(__dirname, '../..', 'localhost.key'));
        this.app = http2_1.default.createSecureServer({
            cert,
            key,
        });
        // Setup stdin
        this.stdin = process.openStdin();
        this.stdin.addListener('data', this.inputHandler.bind(this));
        // Appending events
        this.app.on('sessionError', console.error);
        this.app.on('stream', this.onStream.bind(this));
        (() => __awaiter(this, void 0, void 0, function* () {
            yield this.compileTemplates(templatesDir).catch(console.error);
            yield this.compileSass().catch(console.error);
            if (this.isDev())
                yield this.watchTs().catch(console.error);
            // await this.compileTs().catch(console.log)
            // Load files
            for (const dir of ['/css', '/js', '/img']) {
                const res = yield loadFiles_1.loadFiles(path_1.default.join(publicDir, dir), dir);
                res.forEach((file, key) => this.files.set(key, file));
            }
        }))().then(_ => {
            console.log('Ready for commands!');
        });
    }
    onStream(stream, headers, flag) {
        return __awaiter(this, void 0, void 0, function* () {
            const method = headers[':method'] || '';
            const path = headers[':path'] || '';
            let error = null;
            stream.on('error', handleRefusedStream_1.default(stream));
            // Go through all middleware
            for (const [i, mdw] of this.middleware.entries()) {
                const query = parseQuery_1.parseQuery(path);
                if (mdw.method === method)
                    yield mdw.listener.call(this, { stream, headers, flag, query }, i < this.middleware.length - 1 ? this.middleware[i + 1] : () => { });
            }
            // Check if any middleware returned an error
            if (error) {
                stream.respond({
                    ':status': 403,
                    'content-type': 'text/plain',
                });
                stream.end(this.templates['error']({
                    error,
                }));
            }
            // Go through the router
            this.route(path, method, stream, headers, flag);
        });
    }
    pushAssets(stream, assets) {
        for (const asset of assets) {
            const file = this.files.get(asset);
            stream.pushStream({ [http2_1.default.constants['HTTP2_HEADER_PATH']]: asset }, (err, push) => {
                if (err)
                    throw err;
                push.on('error', handleRefusedStream_1.default(push));
                file &&
                    push.respondWithFD(file.fileDescriptor, Object.assign({}, file.headers, { ':status': 200 }));
            });
        }
    }
    /**
     * @deprecated
     */
    compileTs() {
        return new Promise((res, rej) => {
            const { ext, out } = this.tsOptions;
            fs_extra_1.default.readdir(this.tsOptions.in)
                .then(fnames => fnames.filter(x => x && new RegExp(ext).test(x)))
                .then(fnames => {
                fnames.map(fname => {
                    child_process_1.default.exec(`tsc ${path_1.default.resolve(this.tsOptions.in, fname)} --target ES6 --outFile ${path_1.default.resolve(out, fname.replace(ext, '.js'))}`, { timeout: 2000 });
                });
            })
                .then(res)
                .catch(rej);
        });
    }
    watchTs() {
        return new Promise((res, rej) => {
            try {
                this.tsCompiler = child_process_1.default.exec(`tsc ${path_1.default.resolve(this.tsOptions.in)}/*.ts -w --target ES6 --outDir ${path_1.default.resolve(this.tsOptions.out)}`);
                const handler = (err = null) => {
                    typeof err !== 'undefined' && console.error(err);
                    this.tsCompiler && this.tsCompiler.killed && this.tsCompiler.kill();
                };
                this.tsCompiler.on('error', handler);
                this.tsCompiler.on('close', handler);
                this.tsCompiler.on('exit', handler);
                res(this.tsCompiler);
            }
            catch (err) {
                rej(err);
            }
        });
    }
    compileSass() {
        return new Promise((res, rej) => {
            fs_extra_1.default.readdir(this.sassOptions['in'])
                .then(fnames => fnames.filter(fname => new RegExp(this.sassOptions.ext).test(fname)))
                .then(fnames => fnames.map(fname => ({
                css: node_sass_1.default.renderSync({
                    file: path_1.default.resolve(this.sassOptions.in, fname),
                }).css,
                fname,
            })))
                .then((compiled) => {
                for (const { fname, css } of compiled) {
                    fs_extra_1.default.writeFile(path_1.default.resolve(this.sassOptions.out, fname.replace(this.sassOptions.ext, '.css')), String(css), { encoding: 'utf8' });
                }
            })
                .then(res)
                .catch(rej);
        });
    }
    compileTemplates(dir) {
        return new Promise((res, rej) => {
            if (!dir)
                return rej('Templates directory not found');
            fs_extra_1.default.readdir(dir)
                .then(filenames => filenames.filter(x => x && /\.pug$/.test(x)))
                .then(filenames => {
                for (const fname of filenames) {
                    const matches = fname.match(/(.*)\.pug$/);
                    if (matches)
                        this.templates[matches[1]] = pug_1.default.compileFile(path_1.default.resolve(dir, fname));
                }
                return res(this.templates);
            })
                .catch(err => {
                debugger;
                return rej(err);
            });
        });
    }
    inputHandler(_d) {
        const d = String(_d).trim();
        if (["rs"].some(x => x === d))
            return;
        (function () {
            // @ts-ignore
            function print(txt, ...args) {
                console.dir(txt, Object.assign({ colors: true, depth: 8 }, args));
            }
            try {
                print(eval(d));
            }
            catch (e) {
                print(e);
            }
        }.bind(this)());
    }
    route(path, method, stream, headers, flag) {
        return __awaiter(this, void 0, void 0, function* () {
            const route = this.routes && this.routes.find(r => (r.method === method || r.method === '*') &&
                r.path === path.replace(/\?(.*)/g, ''));
            if (route) {
                const query = parseQuery_1.parseQuery(path);
                yield route.listener.call(this, { stream, headers, flag, query });
                if (!stream.closed)
                    stream.close();
            }
            else {
                stream.respond({
                    ':status': 404,
                    'content-type': 'text/html',
                });
                stream.end(this.templates['error']
                    ? this.templates['error']({
                        error: 'Page not found',
                    })
                    : 'Error');
            }
        });
    }
    use(middleware) {
        if (!Rutux.validMethods.some(m => m === middleware.method)) {
            return new Error('Invalid method');
        }
        if (typeof middleware.listener !== 'function') {
            return new Error('Listener is not a function');
        }
        this.middleware.push(middleware);
        return null;
    }
    hook(route) {
        if (!Rutux.validMethods.some(m => m === route.method)) {
            return new Error('Invalid method');
        }
        if (typeof route.listener !== 'function') {
            return new Error('Listener is not a function');
        }
        if (!route.path) {
            return new Error('Invalid path');
        }
        this.routes.push(route);
        return null;
    }
    render(stream, template, props = {}) {
        const t = this.templates[template];
        if (!t || typeof t !== 'function')
            return new Error('Template is either undefined or not a function');
        stream.write(t(props));
        return null;
    }
    readBody(stream) {
        return new Promise((res, rej) => {
            if (!stream.readable)
                rej(new Error('Stream is not readable'));
            stream.on('data', value => {
                let toRes;
                // Check if payload is JSON
                try {
                    toRes = JSON.parse(String(value));
                }
                catch (e) {
                    // Payload is not a JSON
                    toRes = String(value);
                }
                res(toRes);
            });
        });
    }
    isDev() {
        return process.env['NODE_ENV'] !== 'production';
    }
    apport(port = this.port) {
        if (port !== this.port)
            this.port = port;
        try {
            this.app.listen(port);
        }
        catch (err) {
            console.error(`[ERROR]> ${err}\nSwitching to another port`);
            this.port = Math.floor(Math.random() * (9999 - 1000) + 1000);
            this.app.listen(this.port);
        }
    }
}
Rutux.validMethods = ['GET', 'POST', 'PUSH', '*'];
Rutux.defaultServerOptions = {
    secure: false,
    sassOptions: {
        ext: ".scss",
        in: "./public/scss",
        out: "./public/css"
    },
    tsOptions: {
        ext: ".ts",
        in: "./public/ts",
        out: "./public/js"
    },
    publicDir: path_1.default.resolve(__dirname, '..', 'public'),
    templatesDir: path_1.default.resolve(__dirname, '..', 'views')
};
exports.default = Rutux;
