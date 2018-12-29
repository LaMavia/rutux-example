import Rutux from "./rutux"
import { resolve } from "path"
import { Modulux } from "./rutux/statux/Modelux"
import b from "bson-ext"
import { MongoClient, ObjectID } from "mongodb"
;import { Statux } from "./rutux/statux";
(async () => {
	const db = (await MongoClient.connect(
		"mongodb://127.0.0.1:27017/rutux"
	).catch(console.error)) as MongoClient
	const app = new Rutux({
		templatesDir: resolve(__dirname, "..", "views"),
		publicDir: resolve(__dirname, "..", "public"),
		sassOptions: {
			ext: ".scss",
			in: "./public/sass",
			out: "./public/css",
		},
		tsOptions: {
			ext: ".ts",
			in: "./public/ts",
			out: "./public/js",
		},
		keyPath: resolve(__dirname, "..", "localhost.key"),
		certPath: resolve(__dirname, "..", "localhost.crt"),
		initialState: {
			posts: new Modulux(
				db,
				"rutux",
				"posts",
				class X {
					title: string
					content: string
					constructor({ title, content }: { title: string; content: string }) {
						this.title = title
						this.content = content
						return this
					}
				}
			),
		},
	})

	app.hook({
		method: "GET",
		path: "/",
		listener({ stream }) {
			debugger
			this.store.create("posts", {
				title: "Title",
				content: "Lorem ipsum dolor sit amet. Veni vidi vici",
			})
			if (this.isDev()) {
				this.compileSass().catch(console.error)
			}

			stream.respond({
				"content-type": "text/html",
				":status": 200,
			})
			this.render(stream, "index", {
				items: [
					{ name: "home", href: "/" },
					{ name: "home", href: "/" },
					{ name: "home", href: "/" },
				],
			})
			this.pushAssets(stream, [
				"/css/index.css",
				"/css/header.css",
				"/css/md_minist.css",
				"/css/prism.css",
				"/css/nav.css",
				"/img/cat.png",
				"/img/city-header.jpg",
				"/img/logo.svg",
				"/js/nav.js",
				"/js/prism.js",
			])

			if (this.isDev()) {
				interface Post {
					title: string
					content: string
					_id: string
				}
				console.dir(
					this.store.get(
						{
							posts: {
								$exec() {
									return true
								},
							},
						},
						{ $sort: "asc", $mapper([key, v]: [string, Uint8Array]): {_id: string} & Post {
							const o = Statux.BSON.deserialize(v) as Post
							o._id = String(o._id)
							return o
						}}
					)[0],
					{ colors: true }
				)
			}

			debugger
			this.store.update({}, {
				posts: {
					$set: {}
				}
			})
		},
	})

	app.hook({
		method: "POST",
		path: "/test",
		listener({ stream, headers }) {
			debugger
			stream.respond({
				"content-type": "application/json",
				":status": 200,
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

	app.apport(Number(process.env["PORT"]) || 8000)
})()
