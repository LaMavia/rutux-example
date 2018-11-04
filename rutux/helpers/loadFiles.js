"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const mime_1 = __importDefault(require("mime"));
exports.loadFiles = (dir, prefix) => new Promise((res, rej) => {
    const files = new Map();
    fs_extra_1.default.readdir(dir)
        .then(fnames => fnames.forEach(fname => {
        const filePath = path_1.default.join(dir, fname);
        const fileDescriptor = fs_extra_1.default.openSync(filePath, 'r');
        const stat = fs_extra_1.default.fstatSync(fileDescriptor);
        const contentType = mime_1.default.getType(filePath);
        files.set(`${prefix}/${fname}`, {
            fileDescriptor,
            headers: {
                'content-length': stat.size,
                'last-modified': stat.mtime.toUTCString(),
                'content-type': contentType,
            },
        });
    }))
        .then(() => res(files))
        .catch(rej);
});
