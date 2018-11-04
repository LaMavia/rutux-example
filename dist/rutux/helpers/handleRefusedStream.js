"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
exports.default = (pushStream) => (err) => {
    const { NGHTTP2_REFUSED_STREAM } = http2_1.constants;
    const isRefusedStream = err.code === 'ERR_HTTP2_STREAM_ERROR' &&
        pushStream.rstCode === NGHTTP2_REFUSED_STREAM;
    if (!isRefusedStream)
        throw err;
};
