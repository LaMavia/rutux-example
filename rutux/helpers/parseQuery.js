"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseQuery = (path) => {
    const _matches = path.match(/\?(.*)/);
    let query = {};
    if (_matches) {
        _matches[1].split('&').reduce((out, x) => {
            const [key, val] = x.split('=');
            out[key] = val;
            return out;
        }, query);
    }
    return query;
};
