import { tokenTypeString, tt } from "./tokens.js";
import { ESError, InvalidSyntaxError, ReferenceError, TypeError } from "./errors.js";
import { Context } from "./context.js";
import { Position } from "./position.js";
import { deepClone } from "./util.js";
import { None, now } from "./constants.js";
import { ESType } from "./type.js";
export class interpretResult {
    constructor() {
        this.type = ESType.any;
        this.shouldBreak = false;
        this.shouldContinue = false;
    }
}
export class Node {
    constructor(startPos, isTerminal = false) {
        this.startPos = startPos;
        this.isTerminal = isTerminal;
    }
    interpret(context) {
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
            res.type = val.type;
        }
        else
            res.val = val;
        let time = now() - start;
        Node.interprets++;
        Node.totalTime += time;
        if (time > Node.maxTime)
            Node.maxTime = time;
        return res;
    }
}
Node.interprets = 0;
Node.totalTime = 0;
Node.maxTime = 0;
// --- NON-TERMINAL NODES ---
export class N_binOp extends Node {
    constructor(startPos, left, opTok, right) {
        super(startPos);
        this.left = left;
        this.opTok = opTok;
        this.right = right;
    }
    interpret_(context) {
        const left = this.left.interpret(context);
        const right = this.right.interpret(context);
        if (left.error)
            return left;
        if (right.error)
            return right;
        const l = left.val;
        const r = right.val;
        switch (this.opTok.type) {
            case tt.ADD:
                return l + r;
            case tt.DIV:
                return l / r;
            case tt.MUL:
                return l * r;
            case tt.SUB:
                return l - r;
            case tt.POW:
                return Math.pow(l, r);
            case tt.LTE:
                return l <= r;
            case tt.GTE:
                return l >= r;
            case tt.GT:
                return l > r;
            case tt.LT:
                return l < r;
            case tt.EQUALS:
                return l === r;
            case tt.NOTEQUALS:
                return l !== r;
            case tt.AND:
                return l && r;
            case tt.OR:
                return l || r;
            default:
                return 0;
        }
    }
}
export class N_unaryOp extends Node {
    constructor(startPos, a, opTok) {
        super(startPos);
        this.a = a;
        this.opTok = opTok;
    }
    interpret_(context) {
        var _b;
        const res = this.a.interpret(context);
        if (res.error)
            return res;
        switch (this.opTok.type) {
            case tt.SUB:
                return -res.val;
            case tt.ADD:
                return res.val;
            case tt.NOT:
                if (((_b = res.val) === null || _b === void 0 ? void 0 : _b.type) === ESType.undefined)
                    return true;
                return !res.val;
            default:
                return new InvalidSyntaxError(this.opTok.startPos, `Invalid unary operator: ${tokenTypeString[this.opTok.type]}`);
        }
    }
}
export class N_varAssign extends Node {
    constructor(startPos, varNameTok, value, assignType = '=', isGlobal = false, isConstant = false, type = ESType.any) {
        super(startPos);
        this.value = value;
        this.varNameTok = varNameTok;
        this.isGlobal = isGlobal;
        this.assignType = assignType;
        this.isConstant = isConstant;
        if (type instanceof ESType) {
            // wrap raw ESType in node
            this.type = new N_any(type);
        }
        else
            this.type = type;
    }
    interpret_(context) {
        const res = this.value.interpret(context);
        const typeRes = this.type.interpret(context);
        if (res.error)
            return res;
        if (typeRes.error)
            return res;
        if (!(typeRes.val instanceof ESType))
            return new TypeError(this.varNameTok.startPos, 'Type', typeof typeRes.val, typeRes.val);
        if (!typeRes.val.includesType(res.type))
            return new TypeError(this.varNameTok.startPos, typeRes.val.name, res.type.name, res.val);
        if (this.assignType === '=') {
            const setRes = context.set(this.varNameTok.value, res.val, {
                global: this.isGlobal,
                isConstant: this.isConstant,
                type: typeRes.val
            });
            if (setRes instanceof ESError)
                return setRes;
        }
        else {
            const currentVal = context.get(this.varNameTok.value);
            if (currentVal instanceof ESError)
                return currentVal;
            let newVal;
            let assignVal = res.val;
            switch (this.assignType[0]) {
                case '*':
                    newVal = currentVal * assignVal;
                    break;
                case '/':
                    newVal = currentVal / assignVal;
                    break;
                case '+':
                    newVal = currentVal + assignVal;
                    break;
                case '-':
                    newVal = currentVal - assignVal;
                    break;
                default:
                    return new ESError(this.startPos, 'AssignError', `Cannot find assignType of ${this.assignType[0]}`);
            }
            let setRes = context.set(this.varNameTok.value, newVal, {
                global: this.isGlobal,
                isConstant: this.isConstant
            });
            if (setRes instanceof ESError)
                return setRes;
            res.val = newVal;
        }
        return res;
    }
}
export class N_if extends Node {
    constructor(startPos, comparison, ifTrue, ifFalse) {
        super(startPos);
        this.comparison = comparison;
        this.ifFalse = ifFalse;
        this.ifTrue = ifTrue;
    }
    interpret_(context) {
        let newContext = new Context();
        newContext.parent = context;
        let res = None;
        let compRes = this.comparison.interpret(context);
        if (compRes.error)
            return compRes;
        if (compRes.val) {
            res = this.ifTrue.interpret(newContext);
            // so that if statements always return a value of None
            res.val = None;
            if (res.error)
                return res;
        }
        else if (this.ifFalse) {
            res = this.ifFalse.interpret(newContext);
            // so that if statements always return a value of None
            res.val = None;
            if (res.error)
                return res;
        }
        return res;
    }
}
export class N_while extends Node {
    constructor(startPos, comparison, loop) {
        super(startPos);
        this.comparison = comparison;
        this.loop = loop;
    }
    interpret_(context) {
        let newContext = new Context();
        newContext.parent = context;
        while (true) {
            let shouldLoop = this.comparison.interpret(context);
            if (shouldLoop.error)
                return shouldLoop;
            if (!shouldLoop.val)
                break;
            let potentialError = this.loop.interpret(newContext);
            if (potentialError.error)
                return potentialError;
            if (potentialError.shouldBreak)
                break;
        }
        return None;
    }
}
export class N_for extends Node {
    constructor(startPos, body, array, identifier, isGlobalIdentifier, isConstIdentifier) {
        super(startPos);
        this.body = body;
        this.array = array;
        this.identifier = identifier;
        this.isGlobalId = isGlobalIdentifier;
        this.isConstId = isConstIdentifier;
    }
    interpret_(context) {
        let newContext = new Context();
        newContext.parent = context;
        let res = None;
        const array = this.array.interpret(context);
        if (array.error)
            return array;
        if (!Array.isArray(array.val) && !['string', 'number', 'object'].includes(typeof array.val))
            return new TypeError(this.identifier.startPos, 'array | string', typeof array.val);
        function iteration(body, id, element, isGlobal, isConstant) {
            newContext.set(id, element, {
                global: isGlobal,
                isConstant
            });
            res = body.interpret(newContext);
            if (res.error || (res.funcReturn !== undefined))
                return res;
            if (res.shouldBreak) {
                res.shouldBreak = false;
                return 'break';
            }
            if (res.shouldContinue)
                res.shouldContinue = false;
        }
        if (typeof array.val === 'number') {
            for (let i = 0; i < array.val; i++) {
                const res = iteration(this.body, this.identifier.value, i, this.isGlobalId, this.isConstId);
                if (res === 'break')
                    break;
                if (res && (res.error || (res.funcReturn !== undefined)))
                    return res;
            }
        }
        else if (typeof array.val === 'object' && !Array.isArray(array.val)) {
            for (let element in array.val) {
                const res = iteration(this.body, this.identifier.value, element, this.isGlobalId, this.isConstId);
                if (res === 'break')
                    break;
                if (res && (res.error || (res.funcReturn !== undefined)))
                    return res;
            }
        }
        else {
            for (let element of array.val) {
                const res = iteration(this.body, this.identifier.value, element, this.isGlobalId, this.isConstId);
                if (res === 'break')
                    break;
                if (res && (res.error || (res.funcReturn !== undefined)))
                    return res;
            }
        }
        return res;
    }
}
export class N_array extends Node {
    constructor(startPos, items) {
        super(startPos);
        this.items = items;
    }
    interpret_(context) {
        let result = new interpretResult();
        let interpreted = [];
        for (let item of this.items) {
            const res = item.interpret(context);
            if (res.error || (res.funcReturn !== undefined))
                return res;
            interpreted.push(deepClone(res.val));
        }
        result.val = interpreted;
        result.type = ESType.array;
        return result;
    }
}
export class N_objectLiteral extends Node {
    constructor(startPos, properties) {
        super(startPos);
        this.properties = properties;
    }
    interpret_(context) {
        let interpreted = {};
        for (const [keyNode, valueNode] of this.properties) {
            const value = valueNode.interpret(context);
            if (value.error)
                return value;
            const key = keyNode.interpret(context);
            if (key.error)
                return key;
            interpreted[key.val] = deepClone(value.val);
        }
        return interpreted;
    }
}
export class N_emptyObject extends Node {
    constructor(startPos) {
        super(startPos);
    }
    interpret_(context) {
        return {};
    }
}
export class N_statements extends Node {
    constructor(startPos, items) {
        super(startPos);
        this.items = items;
    }
    interpret_(context) {
        for (let item of this.items) {
            const res = item.interpret(context);
            if (res.error || (res.funcReturn !== undefined) || res.shouldBreak || res.shouldContinue)
                return res;
        }
        return None;
    }
}
export class N_functionCall extends Node {
    constructor(startPos, to, args) {
        super(startPos);
        this.arguments = args;
        this.to = to;
    }
    interpret_(context) {
        let func = this.to.interpret(context);
        if (func.error)
            return func;
        if (func.val instanceof N_function)
            return this.runFunc(func.val, context);
        else if (func.val instanceof N_builtInFunction)
            return this.runBuiltInFunction(func.val, context);
        else if (func.val instanceof N_class)
            return this.runConstructor(func.val, context);
        else if (func.val instanceof ESType) {
            if (!func.val.value)
                return {};
            return this.runConstructor(func.val.value, context);
        }
        else if (typeof func.val === 'function') {
            let args = [];
            for (let arg of this.arguments) {
                let value = arg.interpret(context);
                if (value.error)
                    return value.error;
                args.push(value.val);
            }
            return func.val(...args);
        }
        else
            return new TypeError(this.startPos, 'function', typeof func.val);
    }
    genContext(context, params) {
        var _b, _c;
        const newContext = new Context();
        newContext.parent = context;
        let args = [];
        let max = Math.max(params.length, this.arguments.length);
        for (let i = 0; i < max; i++) {
            let value = None;
            let type = ESType.any;
            if (this.arguments[i] !== undefined) {
                let res = this.arguments[i].interpret(context);
                if (res.error)
                    return res.error;
                value = (_b = res.val) !== null && _b !== void 0 ? _b : None;
                type = (_c = res.type) !== null && _c !== void 0 ? _c : ESType.any;
            }
            args.push(value);
            if (params[i] !== undefined) {
                // type checking
                const [name, typeNode] = params[i];
                let typeRes = typeNode.interpret(context);
                if (!(typeRes.val instanceof ESType))
                    return new TypeError(this.startPos, 'Type', typeof typeRes.val, typeRes.val);
                if (!typeRes.val.includesType(type))
                    return new TypeError(this.startPos, typeRes.val.name, type.name);
                newContext.setOwn(value, name, { type });
            }
        }
        let setRes = newContext.setOwn(args, 'args');
        if (setRes instanceof ESError)
            return setRes;
        return newContext;
    }
    runFunc(func, context) {
        var _b;
        const newContext = this.genContext(context, func.arguments);
        if (newContext instanceof ESError)
            return newContext;
        let this_ = (_b = func.this_) !== null && _b !== void 0 ? _b : None;
        if (typeof this_ !== 'object')
            return new TypeError(this.startPos, 'object', typeof this_, this_, '\'this\' must be an object');
        let setRes = newContext.set('this', this_);
        if (setRes instanceof ESError)
            return setRes;
        const res = func.body.interpret(newContext);
        // type checking
        let returnTypeRes = func.returnType.interpret(context).val;
        if (!(returnTypeRes instanceof ESType))
            return new TypeError(this.startPos, 'Type', typeof returnTypeRes, returnTypeRes);
        if (!returnTypeRes.includesType(res.type))
            return new TypeError(this.startPos, returnTypeRes.name, res.type.name, res.funcReturn, '(from function return)');
        if (res.funcReturn !== undefined) {
            res.val = res.funcReturn;
            res.funcReturn = undefined;
        }
        return res;
    }
    runBuiltInFunction(func, context) {
        const args = func.argNames.map(([name, type]) => [name, new N_any(type)]);
        const newContext = this.genContext(context, args);
        if (newContext instanceof ESError)
            return newContext;
        return func.interpret(newContext);
    }
    runConstructor(constructor, context) {
        var _b, _c;
        const newContext = this.genContext(context, (_c = (_b = constructor === null || constructor === void 0 ? void 0 : constructor.init) === null || _b === void 0 ? void 0 : _b.arguments) !== null && _c !== void 0 ? _c : []);
        if (newContext instanceof ESError)
            return newContext;
        return constructor.genInstance(newContext);
    }
}
export class N_function extends Node {
    constructor(startPos, body, argNames, returnType, name = '<anon func>', this_ = {}) {
        super(startPos);
        this.arguments = argNames;
        this.body = body;
        this.name = name;
        this.this_ = this_;
        this.returnType = returnType;
    }
    interpret_(context) {
        const res = new interpretResult();
        res.val = this;
        res.type = ESType.function;
        return res;
    }
}
export class N_builtInFunction extends Node {
    constructor(func, argNames) {
        super(Position.unknown);
        this.func = func;
        this.argNames = argNames;
    }
    interpret_(context) {
        // never called except to execute, so can use this function
        return this.func(context);
    }
}
export class N_return extends Node {
    constructor(startPos, value) {
        super(startPos);
        this.value = value;
    }
    interpret_(context) {
        const res = new interpretResult();
        if (this.value === undefined) {
            res.funcReturn = None;
            return res;
        }
        let val = this.value.interpret(context);
        if (val.error)
            return val.error;
        res.funcReturn = val.val;
        res.type = val.type;
        return res;
    }
}
export class N_yield extends Node {
    constructor(startPos, value) {
        super(startPos);
        this.value = value;
    }
    interpret_(context) {
        const res = new interpretResult();
        if (this.value === undefined) {
            res.funcReturn = None;
            return res;
        }
        let val = this.value.interpret(context);
        if (val.error)
            return val.error;
        if (val.val) {
            res.funcReturn = val.val;
            res.type = val.type;
        }
        return res;
    }
}
export class N_indexed extends Node {
    constructor(startPos, base, index) {
        super(startPos);
        this.base = base;
        this.index = index;
    }
    interpret_(context) {
        var _b;
        let baseRes = this.base.interpret(context);
        if (baseRes.error)
            return baseRes;
        let indexRes = this.index.interpret(context);
        if (indexRes.error)
            return indexRes;
        const index = indexRes.val;
        const base = baseRes.val;
        if (!['string', 'number'].includes(typeof index))
            return new TypeError(this.startPos, 'string | number', typeof index, index, `With base ${base} and index ${index}`);
        if (!['object', 'function', 'string'].includes(typeof base))
            return new TypeError(this.startPos, 'object | array | string | function', typeof base);
        if (this.value !== undefined) {
            let valRes = this.value.interpret(context);
            if (valRes.error)
                return valRes;
            const currentVal = base[index];
            let newVal;
            let assignVal = valRes.val;
            (_b = this.assignType) !== null && _b !== void 0 ? _b : (this.assignType = '=');
            switch (this.assignType[0]) {
                case '*':
                    newVal = currentVal * assignVal;
                    break;
                case '/':
                    newVal = currentVal / assignVal;
                    break;
                case '+':
                    newVal = currentVal + assignVal;
                    break;
                case '-':
                    newVal = currentVal - assignVal;
                    break;
                case '=':
                    newVal = assignVal;
                    break;
                default:
                    return new ESError(this.startPos, 'AssignError', `Cannot find assignType of ${this.assignType[0]}`);
            }
            base[index] = newVal !== null && newVal !== void 0 ? newVal : None;
        }
        return base[index];
    }
}
export class N_class extends Node {
    constructor(startPos, methods, extends_, init, name = '<anon class>') {
        super(startPos);
        this.init = init;
        this.methods = methods;
        this.name = name;
        this.extends_ = extends_;
        this.instances = [];
    }
    interpret_(context) {
        return new ESType(false, this.name, this);
    }
    genInstance(context, runInit = true, on = { constructor: this }) {
        function dealWithExtends(context_, classNode, instance) {
            var _b;
            const constructor = instance.constructor;
            const classNodeRes = classNode.interpret(context);
            if (classNodeRes.error)
                return classNodeRes.error;
            if (!(classNodeRes.val instanceof ESType))
                return new TypeError(classNode.startPos, 'ESType', typeof classNodeRes.val, classNodeRes.val);
            const extendsClass = (_b = classNodeRes.val) === null || _b === void 0 ? void 0 : _b.value;
            if (!extendsClass)
                return instance;
            let setRes = context_.setOwn(() => {
                var _b, _c;
                const newContext = new Context();
                newContext.parent = context;
                let setRes = newContext.setOwn(instance, 'this');
                if (setRes instanceof ESError)
                    return setRes;
                if (extendsClass.extends_ !== undefined) {
                    let _a = dealWithExtends(newContext, extendsClass.extends_, instance);
                    if (_a instanceof ESError)
                        return _a;
                }
                const res_ = (_c = (_b = extendsClass === null || extendsClass === void 0 ? void 0 : extendsClass.init) === null || _b === void 0 ? void 0 : _b.body) === null || _c === void 0 ? void 0 : _c.interpret(newContext);
                if (res_ && res_.error)
                    return res_;
            }, 'super');
            if (setRes instanceof ESError)
                return setRes;
            instance = extendsClass.genInstance(context, false, instance);
            if (instance instanceof ESError)
                return instance;
            // index access to prevent annoying wiggly red line
            instance.constructor = constructor;
            return instance;
        }
        let instance = on;
        const newContext = new Context();
        newContext.parent = context;
        if (this.extends_ !== undefined) {
            let _a = dealWithExtends(newContext, this.extends_, instance);
            if (_a instanceof ESError)
                return _a;
        }
        for (let method of this.methods) {
            // shallow clone of method with instance as this_
            instance[method.name] = new N_function(method.startPos, method.body, method.arguments, method.returnType, method.name, instance);
        }
        if (runInit) {
            newContext.setOwn(instance, 'this');
            if (this.init) {
                const res = this.init.body.interpret(newContext);
                // return value of init is ignored
                if (res.error)
                    return res.error;
            }
        }
        this.instances.push(instance);
        return instance;
    }
}
/*
export class N_fString extends Node {
    parts: Node[];
    constructor (startPos: Position, parts: Node[]) {
        super(startPos);
        this.parts = parts;
    }

    interpret_ (context: Context) {
        let out = '';
        for (let part of this.parts) {
            let res = part.interpret(context);
            if (res.error) return res;

            // 1 to prevent '' around string
            out += str(res.val, 1);
        }

        return out;
    }
}
 */
// --- TERMINAL NODES ---
export class N_number extends Node {
    constructor(startPos, a) {
        super(startPos, true);
        this.a = a;
    }
    interpret_(context) {
        let val = this.a.value;
        if (typeof val !== 'number')
            return new TypeError(this.startPos, 'number', typeof val);
        const res = new interpretResult();
        res.val = val;
        res.type = ESType.number;
        return res;
    }
}
export class N_string extends Node {
    constructor(startPos, a) {
        super(startPos, true);
        this.a = a;
    }
    interpret_(context) {
        let val = this.a.value;
        if (typeof val !== 'string')
            return new TypeError(this.startPos, 'string', typeof val);
        const res = new interpretResult();
        res.val = val;
        res.type = ESType.string;
        return res;
    }
}
export class N_variable extends Node {
    constructor(a) {
        super(a.startPos, true);
        this.a = a;
    }
    interpret_(context) {
        if (!context.has(this.a.value))
            return new ReferenceError(this.a.startPos, this.a.value);
        let res = new interpretResult();
        let symbol = context.getSymbol(this.a.value);
        if (!symbol)
            return undefined;
        if (symbol instanceof ESError)
            return symbol;
        res.val = symbol.value;
        res.type = symbol.type;
        return res;
    }
}
export class N_undefined extends Node {
    constructor(startPos = Position.unknown) {
        super(startPos, true);
    }
    interpret_(context) {
        const res = new interpretResult();
        res.val = None;
        res.type = ESType.undefined;
        return res;
    }
}
export class N_break extends Node {
    constructor(startPos) {
        super(startPos, true);
    }
    interpret_(context) {
        const res = new interpretResult();
        res.shouldBreak = true;
        return res;
    }
}
export class N_continue extends Node {
    constructor(startPos) {
        super(startPos, true);
    }
    interpret_(context) {
        const res = new interpretResult();
        res.shouldContinue = true;
        return res;
    }
}
export class N_any extends Node {
    constructor(value, startPos = Position.unknown) {
        super(startPos, true);
        this.val = value;
    }
    interpret_(context) {
        return this.val;
    }
}
