export const parseQuery = (path: string) => {
	const _matches = path.match(/\?(.*)/)
	let query = {}
	if (_matches) {
		_matches[1].split('&').reduce((out: { [key: string]: string }, x) => {
			const [key, val] = x.split('=')
			out[key] = val
			return out
		}, query)
  }
  return query
}
