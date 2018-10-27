import Rutux from './rutux'
import { resolve } from 'path'
import { OutgoingHttpHeaders } from 'http2';

const app = new Rutux(
	resolve(__dirname, 'views'),
	resolve(__dirname, 'public'),
	{
		ext: '.scss',
		in: './public/sass',
		out: './public/css',
	},
	{
		ext: '.ts',
		in: './public/ts',
		out: './public/js',
	}
)

app.hook({
	method: 'GET',
	path: '/',
	listener: (self, { stream }) => {
		self.compileSass().catch(console.error)
		const headers: OutgoingHttpHeaders = {
			'content-type': 'text/html',
			':status': 200,
		}
		stream.respond(headers)
		self.render(stream, 'index')
		self.pushAssets(stream, ['/css/cat.css','/img/cat.png'])
	},
})

app.apport(8000)