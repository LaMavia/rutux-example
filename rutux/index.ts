import http, { ServerHttp2Stream } from 'http2'
import pug from 'pug'
import fs from 'fs-extra'
import path from 'path'
import sass from 'node-sass'
import { loadFiles, LoadFilesResponse } from './helpers/loadFiles'
import cp from 'child_process'
import { parseQuery } from './helpers/parseQuery';
import handleRefusedStream from './helpers/handleRefusedStream';

interface IncomingObject {
	stream: http.ServerHttp2Stream
	headers: http.IncomingHttpHeaders
	flag: number
	query: {[key: string]: string}
}

interface Middleware {
	method: string
	listener: (req: IncomingObject, next: Middleware | (() => void)) => void
}

interface Route {
	method: 'GET' | 'POST' | 'PUSH' | '*'
	path: string
	listener: (self: Rutux, req: IncomingObject) => void
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

export default class Rutux {
	app: http.Http2Server
	port: number = 8000
	middleware: Middleware[] = []
	templates: Templates = {}
	routes: Route[] = []
	sassOptions: SassOptions
	tsOptions: TsOptions
	files: Map<string, LoadFilesResponse>
	stdin: NodeJS.Socket
	static validMethods = ['GET', 'POST', 'PUSH', '*']

	constructor(
		templatesDir: string,
		publicDir: string,
		sassOptions: SassOptions,
		tsOptions: TsOptions
	) {
		this.files = new Map()
		this.sassOptions = {
			...sassOptions,
			in: path.resolve(__dirname, '..', sassOptions.in),
			out: path.resolve(__dirname, '..', sassOptions.out),
		}
		this.tsOptions = {
			...tsOptions,
			in: path.resolve(__dirname, '..', tsOptions.in),
			out: path.resolve(__dirname, '..', tsOptions.out),
		}
		this.app = http.createSecureServer({
			cert: fs.readFileSync(path.resolve(__dirname, '..', 'localhost.crt')),
			key: fs.readFileSync(path.resolve(__dirname, '..', 'localhost.key')),
		})
		// Appending events
		this.app.on('sessionError', console.error)
		this.app.on('stream', this.onStream.bind(this))
		// Setup stdin
		this.stdin = process.openStdin()
		this.stdin.addListener('data', this.inputHandler.bind(this))
		// Prelaunch calls
		;(async () => {
			await this.compileTemplates(templatesDir).catch(console.error)
			await this.compileSass().catch(console.error)
			await this.compileTs().catch(console.log)

			// Load files
			for (const dir of ['/css', '/js', '/img']) {
				const res = await loadFiles(path.join(publicDir, dir), dir)
				res.forEach((file, key) => this.files.set(key, file))
			}
		})().then(_ => {
			console.log('Ready for commands!')
		})
	}

	onStream(
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
				mdw.listener(
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
					push.on("error", handleRefusedStream(push))
					file &&
						push.respondWithFD(file.fileDescriptor, {
							...file.headers,
							':status': 200,
						})
				}
			)
		}
	}

	private compileTs(): Promise<void> {
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

	private compileTemplates(dir: string): Promise<Templates> {
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

	private route(
		path: string,
		method: string,
		stream: http.ServerHttp2Stream,
		headers: http.IncomingHttpHeaders,
		flag: number
	) {
		const route = this.routes.find(
			r => (r.method === method || r.method === '*') && r.path === path.replace(/\?(.*)/g, '')
		)
		if (route) {
			const query = parseQuery(path)
			route.listener(this, { stream, headers, flag, query})
			if(!stream.closed) stream.close()
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

	apport(port: number = this.port) {
		if (port !== this.port) this.port = port
		try {
			this.app.listen(port)
		} catch (err) {
			console.error(`[ERROR]> ${err}\nSwitching to another port`)
			this.port = Math.floor(Math.random() * (9999 - 1000) + 1000)
			this.app.listen(this.port)
		}
	}
}
