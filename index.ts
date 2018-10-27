import Rutux from './rutux'
import { resolve } from 'path'

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
		stream.respond({
			'content-type': 'text/html',
		})
		stream.write(self.templates['index']({}))
		self.pushAssets(stream, ['/css/cat.css','/img/cat.png'])
	},
})

app.hook({
	method: "GET",
	path: '/cat',
	listener(self, {stream, headers, query}) {
		console.dir({headers, query}, {colors: true, depth: 10})
		stream.respond({
			'content-type': 'text/html'
		})
		stream.write(self.templates["cat"]())
		self.pushAssets(stream, ['/css/cat.css','/img/cat.jpeg'])
	}
})

app.apport(8000)
/**
 * {
    debugger
    console.log(self)
    stream.respond({
      ":status": 200,
      "content-type": "text/html"
    })
    stream.write(self.templates["index"]({}), () => console.log("wrote to the stream"))
    stream.end('ok\n')
  }
 */
