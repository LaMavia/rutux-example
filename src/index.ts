import Rutux from './rutux'
import { resolve } from 'path'

const app = new Rutux({
	templatesDir: resolve(__dirname, '..', 'views'),
	publicDir: resolve(__dirname, '..', 'public'),
	sassOptions: {
		ext: '.scss',
		in: './public/sass',
		out: './public/css',
	},
	tsOptions: {
		ext: '.ts',
		in: './public/ts',
		out: './public/js',
	}
})

app.hook({
	method: 'GET',
	path: '/',
	listener({ stream }) {
		if (this.isDev()) {
			this.compileSass().catch(console.error)
		}

		stream.respond({
			'content-type': 'text/html',
			':status': 200,
		})
		this.render(stream, 'index', {
			items: [
				{ name: 'home', href: '/' },
				{ name: 'home', href: '/' },
				{ name: 'home', href: '/' }
			],
		})
		this.pushAssets(stream, [
			'/css/index.css',
			'/css/header.css',
			'/css/md_minist.css',
			'/css/prism.css',
			'/css/nav.css',
			'/img/cat.png',
			'/img/city-header.jpg',
			'/img/logo.svg',
			'/js/nav.js',
			'/js/prism.js'
		])
	},
})

app.hook({
	method: 'POST',
	path: '/test',
	listener({ stream, headers }) {
		debugger
		stream.respond({
			'content-type': 'application/json',
			':status': 200,
		})

		this.readBody(stream).then(console.log)
		stream.end(
			JSON.stringify({
				headers,
				stream,
			})
		)
	},
})

app.apport(Number(process.env['PORT']) || 8000)
