import fs from 'fs-extra'
import path from 'path'
import mime from 'mime'

export interface LoadFilesResponse {
	fileDescriptor: number
	headers: {
		'content-length': number
		'last-modified': string
		'content-type': string
	}
}

export const loadFiles = (dir: string, prefix: string) =>
	new Promise<Map<string, LoadFilesResponse>>((res, rej) => {
		const files = new Map()
		fs.readdir(dir)
			.then(fnames =>
				fnames.forEach(fname => {
					const filePath = path.join(dir, fname)
					const fileDescriptor = fs.openSync(filePath, 'r')
					const stat = fs.fstatSync(fileDescriptor)
					const contentType = mime.getType(filePath)
          
					files.set(`${prefix}/${fname}`, {
						fileDescriptor,
						headers: {
							'content-length': stat.size,
							'last-modified': stat.mtime.toUTCString(),
							'content-type': contentType,
						},
					})
				})
			)
			.then(() => res(files))
			.catch(rej)
	})
