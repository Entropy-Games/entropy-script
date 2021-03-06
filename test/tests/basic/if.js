const {expect, file} = require( '../../testFramework');
file('basic/if');

expect([undefined], `
    if !true && 1 || 7 + 2 {} else {}
`);
expect(['00', undefined], `
    let current_char = '00';
    if current_char == '>' {}
`);
expect([false, undefined, undefined, true], `
    let var result = false;
    let var output: Any;
    if result {
        output = false;
    } else {
        output = !result;
    }
    output;
`);
expect([false, undefined, undefined, true], `
    let var result = false;
    let var output;
    if result {
        output = false;
    } else if 1 != 6 {
        output = !result;
    }
    output;
`);
expect([undefined, undefined, false], `
    let var output: Any;
    if true {
        output = true;
        output = false;
    } else {
        output = 1;
    }
    output;
`);