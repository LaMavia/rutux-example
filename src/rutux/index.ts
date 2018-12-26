import http, { ServerHttp2Stream, Http2Stream } from 'http2'
import pug from 'pug'
import fs from 'fs-extra'
import path from 'path'
import sass from 'node-sass'
import { loadFiles, LoadFilesResponse } from './helpers/loadFiles'
import cp from 'child_process'
import { parseQuery } from './helpers/parseQuery'
import handleRefusedStream from './helpers/handleRefusedStream'
import { Statux, StatuxState } from './statux';
import { throwError } from 'querifier';

interface IncomingObject {
	stream: http.ServerHttp2Stream
	headers: http.IncomingHttpHeaders
	flag: number
	query: { [key: string]: string }
}

interface Middleware {
	method: string
	listener: (
		this: Rutux,
		req: IncomingObject,
		next: Middleware | (() => void)
	) => void
}

interface Route {
	method: 'GET' | 'POST' | 'PUSH' | '*'
	path: string
	listener: (this: Rutux, req: IncomingObject) => void
}

interface CompilerOptions {
	in: string
	out: string
	ext: string
}

interface TsOptions extends CompilerOptions {}

interface SassOptions extends CompilerOptions {}

interface Templates {
	[name: string]: pug.compileTemplate
}

interface RutuxOptions {
	secure?: boolean
	templatesDir: string
	publicDir: string
	sassOptions: SassOptions
	tsOptions: TsOptions
	keyPath: string
	certPath: string
	initialState?: StatuxState
}

export default class Rutux {
	app: http.Http2Server
	port: number = 8000
	middleware: Middleware[] = []
	templates: Templates = {}
	routes: Route[] = []
	sassOptions: SassOptions
	tsOptions: TsOptions
	serverOptions: RutuxOptions
	files: Map<string, LoadFilesResponse>
	stdin: NodeJS.Socket
	tsCompiler: cp.ChildProcess | null = null
	static validMethods = ['GET', 'POST', 'PUSH', '*']
	static defaultServerOptions: RutuxOptions = {
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
		publicDir: path.resolve(__dirname, '..', 'public'),
		templatesDir: path.resolve(__dirname, '..', 'views'),
		keyPath: path.resolve(__dirname, '../..', 'localhost.key'),
		certPath: path.resolve(__dirname, '../..', 'localhost.crt')
	}
	store: Statux

	constructor(
		options: RutuxOptions
	) {
		this.serverOptions = Object.assign(
			{},
			Rutux.defaultServerOptions,
			options
		)

		const { sassOptions, tsOptions, templatesDir, publicDir, initialState } = this.serverOptions

		this.files = new Map()
		this.sassOptions = {
			...sassOptions,
			in: path.resolve(__dirname, '../..', sassOptions.in),
			out: path.resolve(__dirname, '../..', sassOptions.out),
		}
		this.tsOptions = {
			...tsOptions,
			in: path.resolve(__dirname, '../..', tsOptions.in),
			out: path.resolve(__dirname, '../..', tsOptions.out),
		}

			const cert = fs.readFileSync(options.certPath)
			const key  = fs.readFileSync(options.keyPath)
			this.app = http.createSecureServer({
				cert,
				key,
			})
		// Setup the Statux store
		this.store = new Statux(initialState || {})
		// Setup stdin
		this.stdin = process.openStdin()
		this.stdin.addListener('data', this.inputHandler.bind(this))
		// Appending events
		this.app.on('sessionError', console.error)
		this.app.on('stream', this.onStream.bind(this))
		// Prelaunch calls
		;(async () => {
			await this.compileTemplates(templatesDir).catch(console.error)
			await this.compileSass().catch(console.error)
			if (this.isDev()) await this.watchTs().catch(console.error)
			// await this.compileTs().catch(console.log)

			// Load files
			for (const dir of ['/css', '/js', '/img']) {
				const res = await loadFiles(path.join(publicDir, dir), dir)
				res.forEach((file, key) => this.files.set(key, file))
			}
		})().then(_ => {
			console.log('[INFO]> Ready for commands!')
		})
	}

	async onStream(
		stream: http.ServerHttp2Stream,
		headers: http.IncomingHttpHeaders,
		flag: number
	) {
		const method = headers[':method'] || ''
		const path = headers[':path'] || ''
		let error = null
		stream.on('error', handleRefusedStream(stream))

		// Go through all middleware
		for (const [i, mdw] of this.middleware.entries()) {
			const query = parseQuery(path)
			if (mdw.method === method)
				await mdw.listener.call(
					this,
					{ stream, headers, flag, query },
					i < this.middleware.length - 1 ? this.middleware[i + 1] : () => {}
				)
		}
		// Check if any middleware returned an error
		if (error) {
			stream.respond({
				':status': 403,
				'content-type': 'text/plain',
			})
			stream.end(
				this.templates['error']({
					error,
				})
			)
		}

		// Go through the router
		this.route(path, method, stream, headers, flag)
	}

	pushAssets(stream: ServerHttp2Stream, assets: string[]) {
		for (const asset of assets) {
			const file = this.files.get(asset) as LoadFilesResponse
			stream.pushStream(
				{ [http.constants['HTTP2_HEADER_PATH']]: asset },
				(err, push) => {
					if (err) throw err
					push.on('error', handleRefusedStream(push))
					file &&
						push.respondWithFD(file.fileDescriptor, {
							...file.headers,
							':status': 200,
						})
				}
			)
		}
	}

	/**
	 * @deprecated
	 */
	compileTs(): Promise<void> {
		return new Promise((res, rej) => {
			const { ext, out } = this.tsOptions
			fs.readdir(this.tsOptions.in)
				.then(fnames => fnames.filter(x => x && new RegExp(ext).test(x)))
				.then(fnames => {
					fnames.map(fname => {
						cp.exec(
							`tsc ${path.resolve(
								this.tsOptions.in,
								fname
							)} --target ES6 --outFile ${path.resolve(
								out,
								fname.replace(ext, '.js')
							)}`,
							{ timeout: 2000 }
						)
					})
				})
				.then(res)
				.catch(rej)
		})
	}

	watchTs(): Promise<cp.ChildProcess> {
		return new Promise((res, rej) => {
			try {
				this.tsCompiler = cp.exec(
					`tsc ${path.resolve(
						this.tsOptions.in
					)}/*.ts -w --target ES6 --outDir ${path.resolve(this.tsOptions.out)}`
				)

				const handler = (err: Error | null = null) => {
					typeof err !== 'undefined' && console.error(err)
					this.tsCompiler && this.tsCompiler.killed && this.tsCompiler.kill()
				}

				this.tsCompiler.on('error', handler)
				this.tsCompiler.on('close', handler)
				this.tsCompiler.on('exit', handler)

				res(this.tsCompiler)
			} catch (err) {
				rej(err)
			}
		})
	}

	compileSass(): Promise<void> {
		return new Promise((res, rej) => {
			fs.readdir(this.sassOptions['in'])
				.then(fnames =>
					fnames.filter(fname => new RegExp(this.sassOptions.ext).test(fname))
				)
				.then(fnames =>
					fnames.map(fname => ({
						css: sass.renderSync({
							file: path.resolve(this.sassOptions.in, fname),
						}).css,
						fname,
					}))
				)
				.then((compiled: { fname: string; css: Buffer }[]) => {
					for (const { fname, css } of compiled) {
						fs.writeFile(
							path.resolve(
								this.sassOptions.out,
								fname.replace(this.sassOptions.ext, '.css')
							),
							String(css),
							{ encoding: 'utf8' }
						)
					}
				})
				.then(res)
				.catch(rej)
		})
	}

	compileTemplates(dir: string): Promise<Templates> {
		return new Promise((res, rej) => {
			if (!dir) return rej('Templates directory not found')

			fs.readdir(dir)
				.then(filenames => filenames.filter(x => x && /\.pug$/.test(x)))
				.then(filenames => {
					for (const fname of filenames) {
						const matches = fname.match(/(.*)\.pug$/)
						if (matches)
							this.templates[matches[1] as string] = pug.compileFile(
								path.resolve(dir, fname)
							)
					}
					return res(this.templates)
				})
				.catch(err => {
					debugger
					return rej(err)
				})
		})
	}

	private inputHandler(_d: any) {
		const d = String(_d).trim()
		if(["rs"].some(x => x === d)) return
		;(function() {
			// @ts-ignore
			function print(txt: any, ...args) {
				console.dir(txt, { colors: true, depth: 8, ...args })
			}
			try {
				print(eval(d))
			} catch (e) {
				print(e)
			}
		}.bind(this)())
	}

	private async route(
		path: string,
		method: string,
		stream: http.ServerHttp2Stream,
		headers: http.IncomingHttpHeaders,
		flag: number
	) {
		const route = this.routes&&this.routes.find(
			r =>
				(r.method === method || r.method === '*') &&
				r.path === path.replace(/\?(.*)/g, '')
		)
		if (route) {
			const query = parseQuery(path)
			await route.listener.call(this, { stream, headers, flag, query })
			if (!stream.closed) stream.close()
		} else {
			stream.respond({
				':status': 404,
				'content-type': 'text/html',
			})
			stream.end(
				this.templates['error']
					? this.templates['error']({
							error: 'Page not found',
					  })
					: 'Error'
			)
		}
	}

	use(middleware: Middleware): Error | null {
		if (!Rutux.validMethods.some(m => m === middleware.method)) {
			return new Error('Invalid method')
		}
		if (typeof middleware.listener !== 'function') {
			return new Error('Listener is not a function')
		}

		this.middleware.push(middleware)
		return null
	}

	hook(route: Route): Error | null {
		if (!Rutux.validMethods.some(m => m === route.method)) {
			return new Error('Invalid method')
		}
		if (typeof route.listener !== 'function') {
			return new Error('Listener is not a function')
		}
		if (!route.path) {
			return new Error('Invalid path')
		}

		this.routes.push(route)
		return null
	}

	render(
		stream: Http2Stream,
		template: string,
		props: { [key: string]: any } = {}
	): Error | null {
		const t = this.templates[template]
		if (!t || typeof t !== 'function')
			return new Error('Template is either undefined or not a function')

		stream.write(t(props))
		return null
	}

	readBody(stream: Http2Stream = throwError()): Promise<string | Buffer> {
		return new Promise((res, rej) => {
			if (!stream.readable) rej(new Error('Stream is not readable'))
			stream.on('data', value => {
				let toRes

				// Check if payload is JSON
				try {
					toRes = JSON.parse(String(value))
				} catch (e) {
					// Payload is not a JSON
					if(this.isDev()) console.log(e)
					toRes = String(value)
				}

				res(toRes)
			})
		})
	}

	isDev(): boolean {
		return process.env['NODE_ENV'] !== 'production'
	}

	apport(port: number = this.port): void {
		if (port !== this.port) this.port = port
		try {
			this.app.listen(port)
		} catch (err) {
			console.error(`[ERROR]> ${err}\nSwitching to another port`)
			this.port = Math.floor(Math.random() * 8999 + 1000)
			this.app.listen(this.port)
		}
		console.log(`[INFO]> Listening @port ${this.port}`)
	}
}
