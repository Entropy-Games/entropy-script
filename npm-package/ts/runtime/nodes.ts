import { tokenTypeString, tt } from "../parse/tokens.js";
import {Token} from "../parse/tokens.js";
import {ESError, InvalidSyntaxError, ReferenceError, TypeError} from "../errors.js";
import {Context} from './context.js';
import {Position} from "../position.js";
import {now} from "../constants.js";
import { interpretArgument, runtimeArgument, uninterpretedArgument } from "./argument.js";
import {
    ESArray,
    ESBoolean,
    ESFunction, ESNamespace,
    ESNumber,
    ESObject,
    ESPrimitive,
    ESString,
    ESType,
    ESUndefined,
    Primitive,
    types
} from "./primitiveTypes.js";
import {dict, str} from '../util/util.js';

export class interpretResult {
    val: Primitive = new ESUndefined();
    error: ESError | undefined;
    funcReturn: Primitive | undefined;
    shouldBreak = false;
    shouldContinue = false;
}

export abstract class Node {
    startPos: Position;
    isTerminal;

    static interprets = 0;
    static totalTime = 0;
    static maxTime = 0;

    protected constructor (startPos: Position, isTerminal=false) {
        this.startPos = startPos;
        this.isTerminal = isTerminal;
    }

    abstract interpret_ (context: Context): ESError | Primitive | interpretResult;

    interpret (context: Context): interpretResult {
        const start = now();
        const res = new interpretResult();
        const val = this.interpret_(context);

        if (val instanceof ESError)
            res.error = val;

        else if (val instanceof interpretResult) {
            res.val = val.val;
            res.error = val.error;
            res.funcReturn = val.funcReturn;
            res.shouldBreak = val.shouldBreak;
            res.shouldContinue = val.shouldContinue;

        } else
            res.val = val;

        if (res.error && res.error.startPos.isUnknown)
            res.error.startPos = this.startPos;

        if (!(res.val instanceof ESPrimitive)) {
            res.error = new TypeError(Position.unknown, 'Primitive', 'Native JS value', str(res.val));
            res.val = new ESUndefined();
        }

        res.val.info.file ||= this.startPos.file;

        Node.interprets++;
        let time = now() - start;
        Node.totalTime += time;
        if (time > Node.maxTime) Node.maxTime = time;

        return res;
    }
}


// --- NON-TERMINAL NODES ---

export class N_binOp extends Node {
    left: Node;
    right: Node;
    opTok: Token;

    constructor (startPos: Position, left: Node, opTok: Token, right: Node) {
        super(startPos);
        this.left = left;
        this.opTok = opTok;
        this.right = right;
    }

     interpret_(context: Context): ESError | Primitive {
        const left = this.left.interpret(context);
         if (left.error) return left.error;
        const right = this.right.interpret(context);
        if (right.error) return right.error;

        const l = left.val;
        const r = right.val;
        if (typeof l === 'undefined')
            return new TypeError(this.opTok.startPos, '~undefined', 'undefined', l, 'N_binOp.interpret_');

        if (typeof r === 'undefined')
            return new TypeError(this.opTok.startPos, '~undefined', 'undefined', r, 'N_binOp.interpret_');

        function declaredBinOp (l: Primitive, r: Primitive, fnName: string, opTokPos: Position): ESError | Primitive {
            if (!(l instanceof ESPrimitive) || !(r instanceof ESPrimitive) || !l.hasProperty({context}, new ESString(fnName)))
                return new TypeError(opTokPos, 'unknown', l?.typeOf().valueOf(), l?.valueOf(), `Unsupported operand for ${fnName}`);
            const prop = l.__getProperty__({context}, new ESString(fnName));
            if (!(prop instanceof ESFunction))
                return new ESError(opTokPos, 'TypeError', `_Unsupported operand ${fnName} on type ${l.typeOf().valueOf()} | .${fnName}=${str(prop)}`);
            const res = prop.__call__({context}, r);
            if (res instanceof ESError) return res;
            if (!(res instanceof ESPrimitive))
                return new ESError(opTokPos, 'TypeError', `__Unsupported operand ${fnName} on type ${l.typeOf().valueOf()}`);
            return res;
        }

        switch (this.opTok.type) {
            case tt.LTE: {
                const lt = declaredBinOp(l, r, '__lt__', this.opTok.startPos);
                const eq = declaredBinOp(l, r, '__eq__', this.opTok.startPos);
                if (lt instanceof ESError) return lt;
                if (eq instanceof ESError) return eq;
                return declaredBinOp(lt, eq, '__or__', this.opTok.startPos);

            } case tt.GTE: {
                const gt = declaredBinOp(l, r, '__gt__', this.opTok.startPos);
                const eq = declaredBinOp(l, r, '__eq__', this.opTok.startPos);
                if (gt instanceof ESError) return gt;
                if (eq instanceof ESError) return eq;
                return declaredBinOp(gt, eq, '__or__', this.opTok.startPos);

            } case tt.NOTEQUALS: {
                const res = declaredBinOp(l, r, '__eq__', this.opTok.startPos);
                if (res instanceof ESError) return res;
                return new ESBoolean(!res.bool().valueOf());

            } case tt.ADD:
                return declaredBinOp(l, r, '__add__', this.opTok.startPos);
            case tt.SUB:
                return declaredBinOp(l, r, '__subtract__', this.opTok.startPos);
            case tt.MUL:
                return declaredBinOp(l, r, '__multiply__', this.opTok.startPos);
            case tt.DIV:
                return declaredBinOp(l, r, '__divide__', this.opTok.startPos);
            case tt.POW:
                return declaredBinOp(l, r, '__pow__', this.opTok.startPos);
            case tt.EQUALS:
                return declaredBinOp(l, r, '__eq__', this.opTok.startPos);
            case tt.LT:
                return declaredBinOp(l, r, '__lt__', this.opTok.startPos);
            case tt.GT:
                return declaredBinOp(l, r, '__gt__', this.opTok.startPos);
            case tt.AND:
                return declaredBinOp(l, r, '__and__', this.opTok.startPos);
            case tt.OR:
                return declaredBinOp(l, r, '__or__', this.opTok.startPos);

            default:
                return new InvalidSyntaxError(
                    this.opTok.startPos,
                    `Invalid binary operator: ${tokenTypeString[this.opTok.type]}`
                );
        }
    }
}

export class N_unaryOp extends Node {
    a: Node;
    opTok: Token;

    constructor (startPos: Position, a: Node, opTok: Token) {
        super(startPos);
        this.a = a;
        this.opTok = opTok;
    }

    interpret_(context: Context): ESError | Primitive {
        const res = this.a.interpret(context);
        if (res.error) return res.error;

        switch (this.opTok.type) {
            case tt.SUB:
            case tt.ADD:
                if (!(res.val instanceof ESNumber))
                    return new TypeError(this.startPos, 'Number', res.val?.typeOf().toString() || 'undefined_', res.val?.valueOf());
                const numVal = res.val.valueOf();
                return new ESNumber(this.opTok.type === tt.SUB ? -numVal : Math.abs(numVal));
            case tt.NOT:
                return new ESBoolean(!res?.val?.bool().valueOf());
            default:
                return new InvalidSyntaxError(
                    this.opTok.startPos,
                    `Invalid unary operator: ${tokenTypeString[this.opTok.type]}`
                );
        }
    }
}

export class N_varAssign extends Node {
    value: Node;
    varNameTok: Token;
    isGlobal: boolean;
    isConstant: boolean;
    isLocal: boolean;
    isDeclaration: boolean;
    assignType: string;
    type: Node;

    constructor (
        startPos: Position,
        varNameTok: Token, value: Node,
        assignType='=',
        isGlobal=false,
        isLocal=false,
        isConstant=false,
        isDeclaration=false,
        type: ESType | Node = types.any
    ) {
        super(startPos);
        this.value = value;
        this.varNameTok = varNameTok;
        this.isGlobal = isGlobal;
        this.assignType = assignType;
        this.isConstant = isConstant;
        this.isDeclaration = isDeclaration;
        this.isLocal = isLocal;

        if (type instanceof ESType) {
            // wrap raw ESType in node
            this.type = new N_primWrapper(type);
        } else this.type = type;
    }

    interpret_(context: Context): interpretResult | ESError | Primitive {

        if (this.isDeclaration && context.hasOwn(this.varNameTok.value))
            return new InvalidSyntaxError(this.startPos, `Symbol '${this.varNameTok.value}' already exists, and cannot be redeclared`);


        const res = this.value.interpret(context);
        const typeRes = this.type.interpret(context);

        if (res.error) return res.error;
        if (typeRes.error) return typeRes.error;

        if (!typeRes.val || !(typeRes.val instanceof ESType))
            return new TypeError(this.varNameTok.startPos, 'Type',
                typeRes.val?.typeOf().valueOf() ?? 'undefined', typeRes.val?.str(), `@ !typeRes.val || !(typeRes.val instanceof ESType)`);

        if (!res.val)
            return new TypeError(this.varNameTok.startPos, '~undefined', 'undefined', 'N_varAssign.interpret_');

        if (typeRes.val.includesType({context}, res.val.__type__).valueOf() === false)
            return new TypeError(this.varNameTok.startPos,
                str(typeRes.val),
                str(res.val?.typeOf()),
                str(res.val)
            );


        if (this.isDeclaration) {
            if (this.assignType !== '=')
                return new InvalidSyntaxError(this.startPos, `Cannot declare variable with operator '${this.assignType}'`);
            context.setOwn(this.varNameTok.value, res.val, {
                global: false,
                isConstant: this.isConstant
            });
            return res.val;
        }

        if (this.assignType === '=') {
            // simple assign
            let value = res.val;
            if (value === undefined)
                value = new ESUndefined();

            const setRes = context.set(this.varNameTok.value, value, {
                global: this.isGlobal,
                isConstant: this.isConstant
            });
            if (setRes instanceof ESError) return setRes;


        } else {

            if (this.isDeclaration)
                return new InvalidSyntaxError(this.startPos, `Cannot declare variable with operator '${this.assignType}'`);

            // assign with modifier like *= or -=
            const currentVal = context.get(this.varNameTok.value);
            if (currentVal instanceof ESError) return currentVal;

            if (currentVal == undefined)
                return new InvalidSyntaxError(this.startPos, `Cannot declare variable with operator '${this.assignType}'`);

            let newVal: Primitive | ESError;
            let assignVal = res.val;

            switch (this.assignType[0]) {
                case '*':
                    if (!currentVal?.__multiply__)
                        return new TypeError(this.startPos, 'unknown', currentVal.typeOf().valueOf(),
                            currentVal?.valueOf(), `Unsupported operand for '*'`);
                    newVal = currentVal.__multiply__({context}, assignVal);
                    break;
                case '/':
                    if (!currentVal?.__divide__)
                        return new TypeError(this.startPos, 'unknown', currentVal.typeOf().valueOf(),
                            currentVal?.valueOf(), `Unsupported operand for '/'`);
                    newVal = currentVal.__divide__({context}, assignVal);
                    break;
                case '+':
                    if (!currentVal?.__add__)
                        return new TypeError(this.startPos, 'unknown', currentVal.typeOf().valueOf(),
                            currentVal?.valueOf(), `Unsupported operand for '+'`);
                    newVal = currentVal.__add__({context}, assignVal);
                    break;
                case '-':
                    if (!currentVal?.__subtract__)
                        return new TypeError(this.startPos, 'unknown', currentVal.typeOf().valueOf(),
                            currentVal?.valueOf(), `Unsupported operand for '-'`);
                    newVal = currentVal.__subtract__({context}, assignVal);
                    break;

                default:
                    return new ESError(
                        this.startPos,
                        'AssignError',
                        `Cannot find assignType of ${this.assignType[0]}`
                    );
            }

            if (newVal instanceof ESError) return newVal;

            let setRes = context.set(this.varNameTok.value, newVal, {
                global: this.isGlobal,
                isConstant: this.isConstant
            });
            if (setRes instanceof ESError) return setRes;
            res.val = newVal;
        }

        if (res.val.info.name === '(anonymous)' || !res.val.info.name)
            res.val.info.name = this.varNameTok.value;

        return res;
    }
}

export class N_if extends Node {
    comparison: Node;
    ifTrue: Node;
    ifFalse: Node | undefined;

    constructor (startPos: Position, comparison: Node, ifTrue: Node, ifFalse: Node | undefined) {
        super(startPos);
        this.comparison = comparison;
        this.ifFalse = ifFalse;
        this.ifTrue = ifTrue;
    }

    interpret_(context: Context): interpretResult {
        let newContext = new Context();
        newContext.parent = context;
        let res: interpretResult = new interpretResult();

        let compRes = this.comparison.interpret(context);
        if (compRes.error) return compRes;

        if (compRes.val?.bool().valueOf()) {
            res = this.ifTrue.interpret(newContext);
            // so that if statements always return a value of None
            res.val = new ESUndefined();
            if (res.error) return res;

        } else if (this.ifFalse) {
            res = this.ifFalse.interpret(newContext);
            // so that if statements always return a value of None
            res.val = new ESUndefined();
            if (res.error) return res;
        }

        return res;
    }
}

export class N_while extends Node {
    comparison: Node;
    loop: Node;

    constructor (startPos: Position, comparison: Node, loop: Node) {
        super(startPos);
        this.comparison = comparison;
        this.loop = loop;
    }

    interpret_(context: Context) {
        let newContext = new Context();
        newContext.parent = context;

        while (true) {
            let shouldLoop = this.comparison.interpret(context);
            if (shouldLoop.error) return shouldLoop;

            if (!shouldLoop.val?.bool()?.valueOf()) break;

            let potentialError = this.loop.interpret(newContext)
            if (potentialError.error) return potentialError;
            if (potentialError.shouldBreak) break;
        }
        return new ESUndefined();
    }
}

export class N_for extends Node {
    array: Node;
    body: Node;
    identifier: Token;
    isGlobalId: boolean;
    isConstId: boolean;

    constructor (startPos: Position, body: Node, array: Node, identifier: Token, isGlobalIdentifier: boolean, isConstIdentifier: boolean) {
        super(startPos);
        this.body = body;
        this.array = array;
        this.identifier = identifier;
        this.isGlobalId = isGlobalIdentifier;
        this.isConstId = isConstIdentifier;
    }

    interpret_ (context: Context) {
        let newContext = new Context();
        newContext.parent = context;

        const array = this.array.interpret(context);
        if (array.error) return array;

        if (['Array', 'Number', 'Object', 'String', 'Any'].indexOf(array.val?.typeOf().valueOf() || '') === -1)
            return new TypeError(
                this.identifier.startPos,
                'Array | Number | Object | String',
                typeof array.val + ' | ' + array.val?.typeOf()
            );

        function iteration (body: Node, id: string, element: Primitive, isGlobal: boolean, isConstant: boolean): 'break' | interpretResult | undefined {
            newContext.set(id, element, {
                global: isGlobal,
                isConstant
            });

            const res = body.interpret(newContext);
            if (res.error || (res.funcReturn !== undefined)) return res;
            if (res.shouldBreak) {
                res.shouldBreak = false;
                return 'break';
            }
            if (res.shouldContinue)
                res.shouldContinue = false;
        }

        if (array.val instanceof ESNumber || typeof array.val?.valueOf() == 'number') {
            for (let i = 0; i < array.val.valueOf(); i++) {
                const res = iteration(this.body, this.identifier.value, new ESNumber(i), this.isGlobalId, this.isConstId);
                if (res === 'break') break;
                if (res && (res.error || (res.funcReturn !== undefined))) return res;
            }

        } else if (array.val instanceof ESObject ||
            (typeof array.val?.valueOf() == 'number' && !Array.isArray(array.val?.valueOf()))
        ) {
            for (let element in array.val?.valueOf()) {
                const res = iteration(this.body, this.identifier.value, new ESString(element), this.isGlobalId, this.isConstId);
                if (res === 'break') break;
                if (res && (res.error || (res.funcReturn !== undefined))) return res;
            }
        } else if (array.val instanceof ESArray || Array.isArray(array.val?.valueOf())) {
            for (let element of array.val?.valueOf()) {
                const res = iteration(this.body, this.identifier.value, element, this.isGlobalId, this.isConstId);
                if (res === 'break') break;
                if (res && (res.error || (res.funcReturn !== undefined))) return res;
            }
        } else
            return new TypeError(
                this.identifier.startPos,
                'Array | Number | Object | String',
                typeof array.val
            );

        return new ESUndefined();
    }
}

export class N_array extends Node {
    items: Node[];
    shouldClone: boolean;
    constructor(startPos: Position, items: Node[], shouldClone=false) {
        super(startPos);
        this.items = items;
        this.shouldClone = shouldClone
    }

    interpret_ (context: Context) {
        let result = new interpretResult();
        let interpreted: Primitive[] = [];

        for (let item of this.items) {
            const res = item.interpret(context);
            if (res.error || (res.funcReturn !== undefined)) return res;
            if (!res.val) continue;
            let val = res.val;
            if (this.shouldClone)
                val = val.clone();
            interpreted.push(val);
        }

        result.val = new ESArray(interpreted);

        return result;
    }
}

export class N_objectLiteral extends Node {
    properties: [Node, Node][];
    constructor(startPos: Position, properties: [Node, Node][]) {
        super(startPos);
        this.properties = properties;
    }

    interpret_ (context: Context): Primitive | ESError {
        let interpreted: dict<Primitive> = {};

        for (const [keyNode, valueNode] of this.properties) {
            const value = valueNode.interpret(context);
            if (value.error) return value.error;

            const key = keyNode.interpret(context);
            if (key.error) return key.error;

            if (key.val && value.val)
                interpreted[key.val.valueOf()] = value.val;
        }

        return new ESObject(interpreted);
    }
}

export class N_emptyObject extends Node {
    constructor(startPos: Position) {
        super(startPos);
    }

    interpret_ (context: Context) {
        return new ESObject({});
    }
}

export class N_statements extends Node {
    items: Node[];
    constructor(startPos: Position, items: Node[]) {
        super(startPos);
        this.items = items;
    }

    interpret_ (context: Context) {
        let last;
        for (let item of this.items) {
            const res = item.interpret(context);
            if (res.error || (typeof res.funcReturn !== 'undefined') || res.shouldBreak || res.shouldContinue)
                return res;
            // return last statement
            last = res.val;
        }

        if (last) return last;
        return new ESUndefined();
    }
}

export class N_functionCall extends Node {
    arguments: Node[];
    to: Node;

    constructor(startPos: Position, to: Node, args: Node[]) {
        super(startPos);
        this.arguments = args;
        this.to = to;
    }

    interpret_ (context: Context) {
        let { val, error } = this.to.interpret(context);
        if (error) return error;
        if (!val)
            return new TypeError(this.startPos, 'any', 'undefined', undefined, 'On function call');
        if (!val.hasOwnProperty('__call__')) {
            return new TypeError(this.startPos, 'unknown',
                val?.typeOf().valueOf() || 'unknown', val?.valueOf(),
                'Can only () on something with __call__ property');
        }

        let params: Primitive[] = [];

        for (let arg of this.arguments) {
            const res = arg.interpret(context);
            if (res.error) return res.error;
            if (res.val) params.push(res.val);
        }

        const __call__ = val.__getProperty__({context}, new ESString('__call__'));

        if (!(__call__ instanceof ESFunction))
            return new TypeError(this.startPos, 'function',
                str(val?.typeOf()), str(val),
                '__call__ property must be function');

        if (typeof __call__.__value__ !== 'function')
            return new TypeError(Position.unknown, 'native function', 'es function');
        const res = __call__.__value__({context}, ...params);

        if (res instanceof ESError) {
            res.traceback.push({
                position: this.startPos,
                // do the best we can to recreate line,
                // giving some extra info as well as it is the interpreted arguments so variables values not names
                line: `${val.info.name}(${params.map(str).join(', ')})`
            });
            return res;
        }

        if (!(res instanceof ESPrimitive))
            return new ESUndefined();

        return res;
    }
}

export class N_functionDefinition extends Node {
    body: Node;
    arguments: uninterpretedArgument[];
    name: string;
    this_: ESObject;
    returnType: Node;
    description: string;

    constructor(
        startPos: Position,
        body: Node,
        argNames: uninterpretedArgument[],
        returnType: Node,
        name = '(anon)',
        this_: ESObject = new ESObject(),
        description=''
    ) {
        super(startPos);
        this.arguments = argNames;
        this.body = body;
        this.name = name;
        this.this_ = this_;
        this.returnType = returnType;
        this.description = description;
    }

    interpret_ (context: Context): Primitive | ESError {

        let args: runtimeArgument[] = [];
        for (let arg of this.arguments) {
            const res = interpretArgument(arg, context);
            if (res instanceof ESError)
                return res;
            args.push(res);
        }
        const returnTypeRes = this.returnType.interpret(context);
        if (returnTypeRes.error) return returnTypeRes.error;
        if (!(returnTypeRes.val instanceof ESType))
            return new TypeError(
                this.returnType.startPos,
                'Type',
                returnTypeRes.val?.typeOf().valueOf() ?? '<Undefined>',
                returnTypeRes.val?.str().valueOf(),
                `On func '${this.name }' return type`
            );

        return new ESFunction(this.body, args, this.name, this.this_, returnTypeRes.val, context);
    }
}

export class N_return extends Node {
    value: Node | undefined;
    constructor(startPos: Position, value: Node | undefined) {
        super(startPos);
        this.value = value;
    }

    interpret_ (context: Context) {
        const res = new interpretResult();

        if (this.value === undefined)  {
            res.funcReturn = new ESUndefined();
            return res;
        }

        let val = this.value.interpret(context);
        if (val.error) return val.error;

        res.funcReturn = val.val;
        return res;
    }
}

export class N_yield extends Node {
    value: Node | undefined;
    constructor(startPos: Position, value: Node | undefined) {
        super(startPos);
        this.value = value;
    }

    interpret_ (context: Context) {
        const res = new interpretResult();

        if (this.value === undefined)  {
            res.funcReturn = new ESUndefined();
            return res;
        }

        let val = this.value.interpret(context);
        if (val.error) return val.error;

        if (val.val?.bool().valueOf())
            res.funcReturn = val.val;

        return res;
    }
}

export class N_indexed extends Node {
    base: Node;
    index: Node;
    // not undefined if setting value
    value: Node | undefined;
    assignType: string | undefined;

    constructor(startPos: Position, base: Node, index: Node) {
        super(startPos);
        this.base = base;
        this.index = index;
    }

    declaredBinOp (l: Primitive, r: Primitive, fnName: string, opTokPos: Position, context: Context): ESError | Primitive {
        if (!l.hasProperty({context}, new ESString(fnName)))
            return new ESError(opTokPos, 'TypeError', `Unsupported operand ${fnName} on type ${l.typeOf().valueOf()}`);
        const prop = l.__getProperty__({context}, new ESString(fnName));
        if (!(prop instanceof ESFunction))
            return new ESError(opTokPos, 'TypeError', `_Unsupported operand ${fnName} on type ${l.typeOf().valueOf()} | .${fnName}=${str(prop)}`);
        const res = prop.__call__({context}, r);
        if (!(res instanceof ESPrimitive))
            return new ESError(opTokPos, 'TypeError', `__Unsupported operand ${fnName} on type ${l.typeOf().valueOf()}`);
        return res;
    }

    interpret_ (context: Context) {
        let baseRes = this.base.interpret(context);
        if (baseRes.error) return baseRes;

        let indexRes = this.index.interpret(context);
        if (indexRes.error) return indexRes;

        const index = indexRes.val;
        const base = baseRes.val;

        if (!base || !index)
            return new ESUndefined();

        if (this.value !== undefined) {
            let valRes = this.value.interpret(context);
            if (valRes.error) return valRes;

            const currentVal = ESPrimitive.wrap(base.__getProperty__({context}, index));
            let newVal: Primitive | ESError;
            let assignVal = valRes.val;
            this.assignType ??= '=';

            if (!assignVal)
                return new TypeError(this.startPos, '~undefined', 'undefined', 'undefined', 'N_indexed.interpret_')

            switch (this.assignType[0]) {
                case '*':
                    newVal = this.declaredBinOp(currentVal, assignVal, '__multiply__', this.startPos, context); break;
                case '/':
                    newVal = this.declaredBinOp(currentVal, assignVal, '__divide__', this.startPos, context); break;
                case '+':
                    newVal = this.declaredBinOp(currentVal, assignVal, '__add__', this.startPos, context); break;
                case '-':
                    newVal = this.declaredBinOp(currentVal, assignVal, '__subtract__', this.startPos, context); break;
                case '=':
                    newVal = assignVal; break;

                default:
                    return new ESError(
                        this.startPos,
                        'AssignError',
                        `Cannot find assignType of ${this.assignType[0]}`
                    );
            }

            if (newVal instanceof ESError)
                return newVal;

            if (!base.__setProperty__)
                return new TypeError(this.startPos, 'mutable', 'immutable', base.valueOf());

            const res = base.__setProperty__({context}, index, newVal ?? new ESUndefined());
            if (res instanceof ESError)
                return res;
        }
        return base.__getProperty__({context}, index);
    }
}

export class N_class extends Node {

    init: N_functionDefinition | undefined;
    methods: N_functionDefinition[];
    name: string;
    extends_: Node | undefined;
    instances: ESObject[];

    constructor(startPos: Position, methods: N_functionDefinition[], extends_?: Node, init?: N_functionDefinition, name = '<anon class>') {
        super(startPos);
        this.init = init;
        this.methods = methods;
        this.name = name;
        this.extends_ = extends_;
        this.instances = [];
    }

    interpret_ (context: Context) {
        const methods: ESFunction[] = [];
        for (let method of this.methods) {
            const res = method.interpret(context);
            if (res.error)
                return res.error;
            if (!(res.val instanceof ESFunction))
                return new TypeError(
                    this.startPos,
                    'Function',
                    res.val?.typeOf().valueOf() || 'undefined',
                    'method on ' + this.name
                );
            methods.push(res.val);
        }
        let extends_;
        if (this.extends_) {
            const extendsRes = this.extends_.interpret(context);
            if (extendsRes.error)
                return extendsRes.error;
            if (!(extendsRes.val instanceof ESType))
                return new TypeError(
                    this.startPos,
                    'Function',
                    extendsRes.val?.typeOf().valueOf() || 'undefined',
                    'method on ' + this.name
                );
                extends_ = extendsRes.val;
        }
        let init;
        if (this.init) {
            const initRes = this.init.interpret(context);
            if (initRes.error)
                return initRes.error;
            if (!(initRes.val instanceof ESFunction))
                return new TypeError(
                    this.startPos,
                    'Function',
                    initRes.val?.typeOf().valueOf() || 'undefined',
                    'method on ' + this.name
                );
            init = initRes.val;
        }

        return new ESType(false, this.name, methods, extends_, init);
    }
}

export class N_namespace extends Node {
    public name: string;
    private statements: Node;
    public mutable: boolean;
    constructor(startPos: Position, statements: Node, name = '(anon)', mutable=false) {
        super(startPos);
        this.name = name;
        this.statements = statements;
        this.mutable = mutable;
    }

    interpret_(context: Context): Primitive | interpretResult {
        const newContext = new Context();
        newContext.parent = context;

        const res = this.statements.interpret(newContext);
        if (res.error) return res;

        return new ESNamespace(new ESString(this.name), newContext.getSymbolTableAsDict(), this.mutable);
    }
}

// --- TERMINAL NODES ---
export class N_number extends Node {
    a: Token;
    constructor(startPos: Position, a: Token) {
        super(startPos, true);
        this.a = a;
    }
    interpret_ (context: Context): interpretResult | ESError {
        let val = this.a.value;

        if (typeof val !== 'number') return new TypeError(
            this.startPos,
            'number',
            typeof val
        );

        const res = new interpretResult();
        res.val = new ESNumber(val);
        return res;
    }
}

export class N_string extends Node {
    a: Token;
    constructor (startPos: Position, a: Token) {
        super(startPos, true);
        this.a = a;
    }
    interpret_ (context: Context): interpretResult | ESError {
        let val = this.a.value;

        if (typeof val !== 'string') return new TypeError(
            this.startPos,
            'string',
            typeof val
        );

        const res = new interpretResult();
        res.val = new ESString(val);
        return res;
    }
}

export class N_variable extends Node {
    a: Token;
    constructor(a: Token) {
        super(a.startPos, true);
        this.a = a;
    }

    interpret_ (context: Context) {
        if (!context.has(this.a.value))
            return new ReferenceError(this.a.startPos, this.a.value);

        let res = new interpretResult();
        let symbol = context.getSymbol(this.a.value);

        if (!symbol)
            return new ESUndefined();
        if (symbol instanceof ESError)
            return symbol;

        res.val = symbol.value;

        return res;
    }
}

export class N_undefined extends Node {

    constructor(startPos = Position.unknown) {
        super(startPos, true);
    }

    interpret_ (context: Context) {
        const res = new interpretResult();
        res.val = new ESUndefined();
        return res;
    }
}

export class N_break extends Node {
    constructor(startPos: Position) {
        super(startPos, true);
    }

    interpret_ (context: Context) {
        const res = new interpretResult();
        res.shouldBreak = true;
        return res;
    }
}
export class N_continue extends Node {
    constructor(startPos: Position) {
        super(startPos, true);
    }

    interpret_ (context: Context) {
        const res = new interpretResult();
        res.shouldContinue = true;
        return res;
    }
}

export class N_primWrapper extends Node {
    value: Primitive;
    constructor(val: Primitive, pos = Position.unknown) {
        super(pos, true);
        this.value = val;
    }

    public interpret_(context: Context): Primitive {
        return this.value;
    }
}