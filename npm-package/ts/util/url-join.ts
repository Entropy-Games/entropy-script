// src: https://github.com/jfromaniello/url-join/blob/master/lib/url-join.js
function normalize (strArray: string[]): string {
    let resultArray = [];
    if (strArray.length === 0) {
        return '';
    }
    if (typeof strArray[0] !== 'string') {
        throw new TypeError('Url must be a string. Received ' + strArray[0]);
    }
    if (strArray[0].match(/^[^/:]+:\/*$/) && strArray.length > 1) {
        let first = strArray.shift();
        strArray[0] = first + strArray[0];
    }
    if (strArray[0].match(/^file:\/\/\//)) {
        strArray[0] = strArray[0].replace(/^([^/:]+):\/*/, '$1:///');
    } else {
        strArray[0] = strArray[0].replace(/^([^/:]+):\/*/, '$1://');
    }
    for (let i = 0; i < strArray.length; i++) {
        let component = strArray[i];
        if (typeof component !== 'string') {
            throw new TypeError('Url must be a string. Received ' + component);
        }
        if (component === '') {
            continue;
        }
        if (i > 0) {
            component = component.replace(/^[\/]+/, '');
        }
        if (i < strArray.length - 1) {
            component = component.replace(/[\/]+$/, '');
        } else {
            component = component.replace(/[\/]+$/, '/');
        }
        resultArray.push(component);
    }
    let str = resultArray.join('/');
    str = str.replace(/\/(\?|&|#[^!])/g, '$1');
    let parts = str.split('?');
    str = parts.shift() + (parts.length > 0 ? '?': '') + parts.join('&');
    return str;
}

export function joinURLS (...input: string[]) {
    if (typeof arguments[0] === 'object') {
        input = arguments[0];
    } else {
        input = [].slice.call(arguments);
    }

    return normalize(input);
}

