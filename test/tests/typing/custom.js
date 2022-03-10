const {expect, file} = require( '../../testFramework');
file('typing/custom');

expect(['myType', {}, {}], `
    const myType = class {};
    let myInstance = myType();
    let a: myType = myInstance;
`);

expect('TypeError', `
    const myType = class {};
    let myInstance = myType();
    let a: myType = 1;
`);