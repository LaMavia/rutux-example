import fs from "fs-extra"
import p from "path"
function lines(path: string) {
	let count = 0
	const fileRegex = /.*\..*$/

	function getNumOfLines(filePath: string): Promise<number> {
		return new Promise((res, rej) => {
			let out = 1
			// debugger
			fs.createReadStream(filePath)
				.on("data", (c: any[]) => {
					// debugger
					let i = 0
					out-- // Because the loop will run once for idx=-1
					do {
						i = c.indexOf(10, i + 1)
						out++
					} while (i !== -1)
				})
				.on("end", () => {
					// console.log(`[${filePath}]> ${out}`)
					res(out)
				})
		})
	}

	if (fileRegex.test(path)) {
    let o
    getNumOfLines(path).then(x => o = x)
    return o as unknown as number
	} else {
		fs
			.readdir(path)
			.then(x => {
				for (const fname of x) {
					if (fileRegex.test(fname)) {
						getNumOfLines(p.resolve(path, fname)).then(
							c => (console.log(c), (count += c))
						)
					} else {
						count += lines(p.resolve(path, fname))
					}
        }        
			})
			.then(() => {
				console.log(`
          [${path}]> ${count} lines of code
        `)
			})
			.catch(err => {
				console.log(`
        [ERROR]> "${err}"\n
        [FILEPATH]> ${path}
      `)
				debugger
			})
	}

	return count
}
// lines("C:/Users/xelox/Projects/node/2test/server/src")
console.log(137+430+10+38+13+178+60+844)