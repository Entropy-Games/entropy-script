import './util/colourString.js';

import { Lexer } from "./tokenise/lexer.js";
import { Parser } from "./parse/parser.js";
import { global, now } from "./constants.js";
import { initialise } from "./init.js";
import { ESError } from "./errors.js";
import { Position } from "./position.js";
import { interpretResult, Node } from "./runtime/nodes.js";
import { ESArray } from "./runtime/primitiveTypes.js";
import { timeData } from "./util/util";

export function init (
    printFunc: (...args: any) => void = console.log,
    inputFunc: (msg: string, cb: (...arg: any[]) => any) => void, libs: string[]
) {
    initialise(global, printFunc, inputFunc, libs);
}

export function run (msg: string, {
    env = global,
    measurePerformance = false,
    fileName = '(unknown)'
}={}): interpretResult | ({ timeData: timeData } & interpretResult) {

    Node.maxTime = 0;
    Node.totalTime = 0;
    Node.interprets = 0;

    const timeData: timeData = {
        total: 0,
        lexerTotal: 0,
        parserTotal: 0,
        interpretTotal: 0,
        nodeMax: 0,
        nodeAvg: 0,
        nodeTotal: 0,
        interprets: 0,
    }

    let start = now();

    if (!env.root.initialisedAsGlobal){
        const res = new interpretResult();
        res.error = new ESError(
            Position.unknown,
            'Uninitialised',
            'Global context has not been initialised with global values'
        );
        return res;
    }

    const lexer = new Lexer(msg, fileName);
    const [tokens, error] = lexer.generate();
    if (error) {
        const res_ = new interpretResult();
        res_.error = error;
        return res_;
    }
    timeData.lexerTotal = now() - start;
    start = now();

    const parser = new Parser(tokens);
    const res = parser.parse();
    if (res.error) {
        const res_ = new interpretResult();
        res_.error = res.error;
        return res_;
    }
    timeData.parserTotal = now() - start;
    start = now();


    if (!res.node) {
        const res = new interpretResult();
        res.val = new ESArray([]);
        return res;
    }
    const finalRes = res.node.interpret(env);
    timeData.interpretTotal = now() - start;
    timeData.total = now() - start;

    timeData.nodeMax = Node.maxTime;
    timeData.nodeTotal = Node.totalTime;
    timeData.nodeAvg = Node.totalTime / Node.interprets;
    timeData.interprets = Node.interprets;

    if (measurePerformance)
        console.log(timeData);

    return {...finalRes, timeData};
}