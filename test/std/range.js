import {expect} from '../testFramework.js';

expect([[0, 1, 2]], 'range(3)');
expect ([undefined, 2], `
    for global i in range(3) {}
    i;
`);