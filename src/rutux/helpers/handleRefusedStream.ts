import { Http2Stream, constants } from 'http2'

export default (pushStream: Http2Stream) => (err: any) => {
	const { NGHTTP2_REFUSED_STREAM } = constants
	const isRefusedStream =
		err.code === 'ERR_HTTP2_STREAM_ERROR' &&
		pushStream.rstCode === NGHTTP2_REFUSED_STREAM
	if (!isRefusedStream) throw err
}
