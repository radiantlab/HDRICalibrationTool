export function Paths(path: string) {
    for (let i = 0; i < path.length; i++) {
        if (path[i] == "/" || path[i] == "\\") {
            path = path.slice(i + 1);
            i = -1;
        }
    }
    return path;
}

export function Extensions(ext: string) {
    for (let i = 0; i < ext.length; i++) {
        if (ext[i] == ".") {
            ext = ext.slice(i + 1);
            i = -1;
        }
    }
    return ext;
}

export function Directories(path: string) {
    for (let i = path.length - 1; i >= 0; i--) {
        if (path[i] == "/" || path[i] == "\\") {
            path = path.slice(0, i + 1);
            break;
        }
    }
    return path;
}