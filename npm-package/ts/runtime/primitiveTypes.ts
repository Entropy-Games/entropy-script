import { global } from "../constants.js";
import {BuiltInFunction, dict, str} from '../util/util.js';
import { ESError, TypeError } from "../errors.js";
import { Position } from "../position.js";
import { Node } from "./nodes.js";
import { runtimeArgument } from "./argument.js";
import { Context, ESSymbol, generateESFunctionCallContext } from "./context.js";

export type typeName = 'Undefined' | 'String' | 'Array' | 'Number' | 'Any' | 'Function' | 'Boolean' | 'Type' | 'Object' | string;
export type Primitive = ESPrimitive<any> | ESString | ESType | ESNumber | ESUndefined | ESBoolean | ESArray | ESObject | ESFunction | ESErrorPrimitive;

export type Info = PrimitiveInfo & FunctionInfo & ObjectInfo;

export interface PrimitiveInfo {
    name?: string;
    description?: string;
    file?: string;
    helpLink?: string;
    isBuiltIn?: boolean;
}

export interface argInfo {
    name?: string;
    type?: string;
    description?: string;
    required?: boolean;
    defaultValue?: string;
}

export interface FunctionInfo extends PrimitiveInfo {
    args?: argInfo[];
    returns?: string;
    returnType?: string;
}

export interface ObjectInfo extends PrimitiveInfo {
    contents?: Info[];
}


// Optional Operator Methods
export interface ESPrimitive <T> {
    // Arithmetic
    __add__?(n: Primitive): Primitive | ESError;
    __subtract__?(n: Primitive): Primitive | ESError;
    __multiply__?(n: Primitive): Primitive | ESError;
    __divide__?(n: Primitive): Primitive | ESError;
    __pow__?(n: Primitive): Primitive | ESError;

    // Boolean Logic
    __eq__?(n: Primitive): ESBoolean | ESError;
    __gt__?(n: Primitive): ESBoolean | ESError;
    __lt__?(n: Primitive): ESBoolean | ESError;
    __and__?(n: Primitive): ESBoolean | ESError;
    __or__?(n: Primitive): ESBoolean | ESError;
    __bool__?(): ESBoolean | ESError;

    // Other
    __setProperty__?(key: Primitive, value: Primitive): void | ESError;
    __getProperty__: (key: Primitive) => Primitive;
    __call__?(parameters: Primitive[], context: Context): ESError | Primitive;

}

export abstract class ESPrimitive <T> {
    protected __value__: T;
    public __type__: ESType;
    public info: Info = {};

    /**
     * @param value
     * @param {ESType|false} type can ONLY be false for initialising the '__type__' ESType
     * @protected
     */
    protected constructor (value: T, type: ESType | false = types.any) {
        // @ts-ignore
        this.__type__ = type || this;
        this.__value__ = value;
    }

    // casting
    /**
     * @returns {ESString} this cast to string
     */
    public abstract str: () => ESString;


    /**
     * @returns {Primitive} deep clone of this
     */
    // @ts-ignore
    public abstract clone: () => Primitive;

    /**
     * @returns {boolean} this cast to a boolean. Uses __bool__ if method exists.
     */
    public bool = (): ESBoolean => {
        if (this.hasOwnProperty('__bool__'))
            // @ts-ignore
            return this['__bool__']();

        return new ESBoolean(!!this.__value__);
    }

    // getters for private props
    public valueOf = (): T => this.__value__;
    public typeOf = (): ESString => new ESString(this.__type__.__name__);

    // Object stuff
    public hasProperty = (key: ESString): boolean => this.hasOwnProperty(key.valueOf());
    public __getProperty__ = (key: Primitive): Primitive => {
        const self: any = this;
        if (self.hasOwnProperty(key.valueOf()))
            return ESPrimitive.wrap(self[key.valueOf()]);
        return ESPrimitive.wrap(new ESUndefined());
    };

    public static wrap (thing: any = undefined): Primitive {
        if (thing instanceof ESPrimitive)
            return thing;

        // catch 'null' which is of type 'object'
        if (thing == undefined)
            return new ESUndefined();

        if (thing instanceof ESError)
            return new ESErrorPrimitive(thing);
        if (thing instanceof ESSymbol)
            return thing.value;

        if (typeof thing == 'function')
            return new ESFunction(thing);
        if (typeof thing === 'number')
            return new ESNumber(thing);
        if (typeof thing === 'string')
            return new ESString(thing);
        if (typeof thing === 'boolean')
            return new ESBoolean(thing);
        if (typeof thing === 'object') {
            if (Array.isArray(thing))
                return new ESArray(thing.map(s => ESPrimitive.wrap(s)));

            let newObj: {[s: string]: Primitive} = {};
            if (thing === Math) console.log();
            Object.getOwnPropertyNames(thing).forEach(key => {
                newObj[key] = ESPrimitive.wrap(thing[key]);
            });
            return new ESObject(newObj);
        }
        if (typeof thing === 'bigint')
            return new ESNumber(Number(thing));
        if (typeof thing === 'symbol')
            return new ESString(String(thing));

        // for typeof === undefined
        return new ESUndefined();
    }

    /**
     * Returns the thing passed in its js form
     * @param {Primitive} thing
     */
    public static strip (thing: Primitive | undefined): any {
        if (!thing)
            return undefined;
        if (!(thing instanceof ESPrimitive))
            return thing;

        if (thing instanceof ESArray)
            return thing.valueOf().map(m => ESPrimitive.strip(m));
        if (thing instanceof ESObject) {
            let val: any = {};
            for (let key in thing.valueOf())
                val[key] = ESPrimitive.strip(thing.valueOf()[key]);
            return val;
        }
        if (thing instanceof ESUndefined)
            return undefined;
        if (thing instanceof ESType || thing instanceof ESFunction)
            return thing;
        return thing.valueOf();
    }
}

export class ESType extends ESPrimitive<undefined> {
    readonly __isPrimitive__: boolean;
    readonly __name__: typeName;
    readonly __extends__: undefined | ESType;
    readonly __methods__: ESFunction[];
    readonly __init__: ESFunction | undefined;
    readonly __instances__: ESObject[] = [];

    constructor (
        isPrimitive: boolean = false,
        name: typeName = '(anon)',
        __methods__: ESFunction[] = [],
        __extends__?: undefined | ESType,
        __init__?: undefined | ESFunction
    ) {
        super(undefined, types?.type);

        this.__isPrimitive__ = isPrimitive;
        this.__name__ = name;
        this.info.name = name;
        this.__extends__ = __extends__;
        this.__methods__ = __methods__;
        if (__init__) {
            __init__.name = name;
            this.__init__ = __init__;
        }

        if (!types.type)
            this.__type__ = this;
    }

    clone = () => {
        return new ESType(
            this.__isPrimitive__,
            this.__name__,
            this.__methods__.map(f => f.clone()),
            this.__extends__,
            this.__init__?.clone()
        )
    }

    includesType = (t: ESType) => {
        if (this.equals(types.any) || t.equals(types.any)) return true;

        if (this.__extends__?.equals(t)) return true;
        if (this.__extends__?.equals(types.any)) return true;
        if (this.__extends__?.includesType(t)) return true;

        if (t.__extends__?.equals(this)) return true;
        if (t.__extends__?.equals(types.any)) return true;
        if (t.__extends__?.includesType(this)) return true;

        return this.equals(t);
    }

    equals = (t: ESType) => {
        return t.__name__ === this.__name__ && t.__isPrimitive__ === this.__isPrimitive__ && Object.is(this.valueOf(), t.valueOf());
    }

    __call__ = (params: Primitive[] = [], context = global, runInit=true, on: any = {}): ESError | Primitive => {

        if (this.__isPrimitive__) {
            // make sure we have at least one arg
            if (params.length < 1)
                return new ESUndefined();

            switch (this.__name__) {
                case 'Undefined':
                case 'Type':
                    if (params.length < 1)
                        return new ESType();
                    else
                        return params[0].typeOf();
                case 'String':
                    return new ESString(params[0].str().valueOf());
                case 'Array':
                    return new ESArray(params);
                case 'Number':
                    return new ESNumber(params[0].valueOf());
                case 'Function':
                    return new ESFunction(params[0].valueOf());
                case 'Boolean':
                    return new ESBoolean(params[0].bool().valueOf());
                case 'Object':
                    return new ESObject(<dict<any>>params[0]);
                case 'Error':
                    return new ESError(Position.unknown, 'UserError', params[0].str().valueOf());
                default:
                    return ESPrimitive.wrap(params[0]);
            }
        }

        // old code from N_class.genInstance - create instance of class

        function dealWithExtends(context_: Context, class_: ESType, instance: dict<Primitive>): ESError | void {
            const constructor = instance.constructor;
            if (!class_) return;
            if (!(class_ instanceof ESType))
                return new TypeError(
                    Position.unknown,
                    'Type',
                    typeof class_,
                    class_
                );

            let setRes = context_.setOwn('super', new ESFunction(() => {
                const newContext = new Context();
                newContext.parent = context;
                let setRes = newContext.setOwn('this', new ESObject(instance));
                if (setRes instanceof ESError) return setRes;

                if (class_.__extends__ !== undefined) {
                    let _a = dealWithExtends(newContext, class_.__extends__, instance);
                    if (_a instanceof ESError) return _a;
                }

                const res_ = class_?.__init__?.__call__([]);
                if (res_ instanceof ESPrimitive) return res_;
            }));
            if (setRes instanceof ESError) return setRes;

            const res = class_.__call__([], context, false, instance);
            if (res instanceof ESError) return res;
            instance = res.valueOf();

            instance.constructor = constructor;
        }

        const newContext = new Context();
        newContext.parent = this.__init__?.__closure__;

        if (this.__extends__) {
            let _a = dealWithExtends(newContext, this.__extends__, on);
            if (_a instanceof ESError) return _a;
        }

        on['constructor'] = this.__init__?.clone() ?? new ESUndefined();

        const instance = new ESObject(on);

        for (let method of this.__methods__) {
            const methodClone = method.clone();
            methodClone.this_ = instance;
            on[method.name] = methodClone;
        }

        if (runInit && this.__init__) {
            this.__init__.this_ = instance;

            // newContext, which inherits from the current closure
            this.__init__.__closure__ = newContext;

            const res = this.__init__.__call__(params);
            // return value of init is ignored
            if (res instanceof ESError) return res;
        }

        instance.__type__ = this;

        this.__instances__.push(instance);

        return instance;
    }

    str = () => new ESString(`<Type: ${this.__name__}>`);
}

export class ESNumber extends ESPrimitive <number> {
    constructor (value: number = 0) {
        super(value, types.number);
    }

    str = () => new ESString(this.valueOf().toString());

    __add__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESNumber(this.valueOf() + n.valueOf());
    };
    __subtract__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESNumber(this.valueOf() - n.valueOf());
    };
    __multiply__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESNumber(this.valueOf() * n.valueOf());
    };
    __divide__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESNumber(this.valueOf() / n.valueOf());
    };
    __pow__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESNumber(this.valueOf() ** n.valueOf());
    };
    __eq__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new ESBoolean(false);
        return new ESBoolean(this.valueOf() === n.valueOf());
    };
    __gt__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESBoolean(this.valueOf() > n.valueOf());
    };
    __lt__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESBoolean(this.valueOf() < n.valueOf());
    };
    __bool__ = () => {
        return new ESBoolean(this.valueOf() > 0);
    }
    clone = (): ESNumber => new ESNumber(this.valueOf());
}

export class ESString extends ESPrimitive <string> {
    constructor (value: string = '') {
        super(value, types.string);
    }

    str = () => this;

    __add__ = (n: Primitive) => {
        if (!(n instanceof ESString))
            return new TypeError(Position.unknown, 'String', n.typeOf().valueOf(), n.valueOf());
        return new ESString(this.valueOf() + n.valueOf());
    };
    __multiply__ = (n: Primitive) => {
        if (!(n instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', n.typeOf().valueOf(), n.valueOf());
        return new ESString(this.valueOf().repeat(n.valueOf()));
    };
    __eq__ = (n: Primitive) => {
        if (!(n instanceof ESString))
            return new ESBoolean(false);
        return new ESBoolean(this.valueOf() === n.valueOf());
    };
    __gt__ = (n: any) => {
        if (!(n instanceof ESString))
            return new TypeError(Position.unknown, 'String', n.typeOf().valueOf(), n.valueOf());
        return new ESBoolean(this.valueOf().length > n.valueOf().length);
    };
    __lt__ = (n: any) => {
        if (!(n instanceof ESString))
            return new TypeError(Position.unknown, 'String', n.typeOf().valueOf(), n.valueOf());
        return new ESBoolean(this.valueOf().length < n.valueOf().length);
    };
    __bool__ = () => {
        return new ESBoolean(this.valueOf().length > 0);
    }

    len = () => {
        return new ESNumber(this.valueOf().length);
    }
    clone = (): ESString => new ESString(this.valueOf());

    __getProperty__ = (key: Primitive): Primitive => {
        const self: any = this;
        if (key instanceof ESString && self.hasOwnProperty(key.valueOf().toString()))
            return self[key.valueOf().toString()];

        if (!(key instanceof ESNumber))
            return new ESString();

        let idx = key.valueOf();

        while (idx < 0)
            idx = this.valueOf().length + idx;

        if (idx < this.valueOf().length)
            return new ESString(this.valueOf()[idx]);

        return new ESString();
    };

    __setProperty__(key: Primitive, value: Primitive): void {
        if (!(key instanceof ESNumber))
            return;

        if (!(value instanceof ESString))
            value = ESPrimitive.wrap(value);

        let idx = key.valueOf();

        while (idx < 0)
            idx = this.valueOf().length + idx;

        const strToInsert = value.str().valueOf();

        let firstPart = this.__value__.substr(0, idx);
        let lastPart = this.__value__.substr(idx + strToInsert.length);

        this.__value__ = firstPart + strToInsert + lastPart;
    }
}

export class ESUndefined extends ESPrimitive <any> {
    constructor () {
        super(undefined, types.undefined);

        // define the same info for every instance
        this.info = {
            name: 'undefined',
            description: 'Not defined, not a value.',
            file: 'built-in',
            isBuiltIn: true
        };
    }

    str = () => new ESString('<Undefined>');

    __eq__ = (n: Primitive) => new ESBoolean(n instanceof ESUndefined || typeof n === 'undefined' || typeof n.valueOf() === 'undefined');
    __bool__ = () => new ESBoolean(false);
    clone = (): ESUndefined => new ESUndefined();
}

export class ESErrorPrimitive extends ESPrimitive <ESError> {
    constructor (error: ESError = new ESError(Position.unknown, 'Unknown', 'error type not specified')) {
        super(error, types.error);
    }

    str = () => new ESString(`<Error: ${this.valueOf().str}>`);

    __eq__ = (n: Primitive) => new ESBoolean(n instanceof ESErrorPrimitive && this.valueOf().constructor === n.valueOf().constructor);
    __bool__ = () => new ESBoolean(true);
    clone = (): ESErrorPrimitive => new ESErrorPrimitive(this.valueOf());
}

export class ESFunction extends ESPrimitive <Node | BuiltInFunction> {
    arguments_: runtimeArgument[];
    this_: ESObject;
    returnType: ESType;
    __closure__: Context;
    constructor (
        func: Node | BuiltInFunction = (() => {}),
        arguments_: runtimeArgument[] = [],
        name='(anonymous)',
        this_: ESObject = new ESObject(),
        returnType = types.any,
        closure = global
    ) {
        super(func, types.function);
        this.arguments_ = arguments_;
        this.info.name = name;
        this.this_ = this_;
        this.returnType = returnType;
        this.__closure__ = closure ?? new Context();

        this.info.returnType = str(returnType);
        this.info.args = arguments_.map(arg => ({
            name: arg.name,
            defaultValue: str(arg.defaultValue),
            type: arg.type.info.name,
            required: true
        }));
        // TODO: info.helpLink
    }

    get name () {
        return this.info.name ?? '(anonymous)';
    }

    set name (v: string) {
        this.info.name = v;
    }

    clone = (): ESFunction => {
        return new ESFunction(
            this.__value__,
            this.arguments_,
            this.name,
            this.this_,
            this.returnType,
            this.__closure__
        );
    };

    // @ts-ignore
    valueOf = () => this;

    str = () => new ESString(`<Func: ${this.name}>`);

    __eq__ = (n: Primitive) => {
        if (!(n instanceof ESFunction))
            return new ESBoolean(false);
        return new ESBoolean(this.__value__ === n.__value__);
    };
    __bool__ = () => new ESBoolean(true);
    
    __call__ = (params: Primitive[] = []): ESError | Primitive => {

        // generate context
        const context = this.__closure__;
        const fn = this.__value__;

        if (fn instanceof Node) {
            // fn is the function root node

            const newContext = generateESFunctionCallContext(params, this, context);
            if (newContext instanceof ESError) return newContext;

            let this_ = this.this_ ?? new ESObject();

            if (!(this_ instanceof ESObject))
                return new TypeError(
                    Position.unknown,
                    'object',
                    typeof this_,
                    this_,
                    '\'this\' must be an object'
                );

            let setRes = newContext.set('this', this_);
            if (setRes instanceof ESError) return setRes;

            const res = fn.interpret(newContext);

            if (res.error) return res.error;
            if (res.funcReturn !== undefined) {
                res.val = res.funcReturn;
                res.funcReturn = undefined;
            }

            if (!this.returnType.includesType(res.val?.__type__ ?? types.any))
                return new TypeError(
                    Position.unknown,
                    this.returnType.__name__,
                    res.val?.typeOf().valueOf() || 'undefined',
                    res.val?.str().valueOf(),
                    '(from function return)');

            if (res.val)
                return res.val;
            else
                return new ESUndefined();

        } else if (typeof fn === 'function') {
            for (let i = params.length; i < fn.length; i++)
                params.push(new ESUndefined());
            const res = fn({
                context
            }, ...params);
            if (res instanceof ESError) return res;
            return ESPrimitive.wrap(res);

        } else
            return new TypeError(Position.unknown,'function', typeof fn);
    }
}

export class ESBoolean extends ESPrimitive <boolean> {
    constructor (val: boolean = false) {
        super(!!val, types.bool);

        this.info = {
            name: str(val),
            description: `Boolean global constant which evaluates to ${str(val)}, the opposite of ${str(!val)}`,
            file: 'built-in',
            isBuiltIn: true,
            helpLink: 'https://en.wikipedia.org/wiki/Boolean_expression'
        };
    }

    __eq__ = (n: Primitive) => {
        if (!(n instanceof ESBoolean))
            return new TypeError(Position.unknown, 'Boolean', n.typeOf().str().valueOf(), n.valueOf())
        return new ESBoolean(this.valueOf() === n.valueOf());
    };
    __bool__ = () => this;

    __and__ = (n: Primitive) => {
        return new ESBoolean(this.bool().valueOf() && n.bool().valueOf());
    };

    __or__ = (n: Primitive) => {
        return new ESBoolean(this.bool().valueOf() || n.bool().valueOf());
    };

    str = () => new ESString(this.valueOf() ? 'true' : 'false');
    clone = (): ESBoolean => new ESBoolean(this.valueOf());
}

export class ESObject extends ESPrimitive <dict<Primitive>> {
    constructor (val: dict<Primitive> = {}) {
        super(val, types.object);
    }

    str = () => {
        let val = str(this.valueOf());
        // remove trailing new line
        if (val[val.length-1] === '\n')
            val = val.substr(0, val.length-1);
        return new ESString(`<ESObject ${val}>`);
    }

    __eq__ = (n: Primitive) => {
        if (!(n instanceof ESObject))
            return new ESBoolean();
        return new ESBoolean(this.valueOf() === n.valueOf());
    };
    __bool__ = () => new ESBoolean(true);

    __getProperty__ = (key: Primitive): Primitive => {
        const self: any = this;

        if (key instanceof ESString && this.valueOf().hasOwnProperty(key.valueOf()))
            return this.valueOf()[key.valueOf()];

        if (self.hasOwnProperty(key.valueOf()))
            return self[key.valueOf()];

        return new ESUndefined();
    };

    __setProperty__(key: Primitive, value: Primitive): void | ESError {
        if (!(key instanceof ESString))
            return;
        if (!(value instanceof ESPrimitive))
            value = ESPrimitive.wrap(value);
        this.__value__[key.valueOf()] = value;
    }

    clone = (): ESObject => {
        let obj: dict<Primitive> = {};
        let toClone = this.valueOf();
        for (let key in toClone) {
            try {
                obj[key] = toClone[key].clone();
            } catch (e) {
                throw Error('Couldn\'t clone ' + str(toClone[key]));
            }
        }
        return new ESObject(obj);
    }
}

export class ESArray extends ESPrimitive <Primitive[]> {
    len: number;

    constructor(values: Primitive[] = []) {
        super(values, types.array);
        this.len = values.length;
    }

    str = () => new ESString(str(this.valueOf()));

    __eq__ = (n: Primitive) => {
        if (!(n instanceof ESArray))
            return new ESBoolean();
        return new ESBoolean(this.valueOf() === n.valueOf());
    };
    __bool__ = () => new ESBoolean(this.valueOf().length > 0);

    __getProperty__ = (key: Primitive): Primitive => {
        const self: any = this;
        if (key instanceof ESString && self.hasOwnProperty(<string>key.valueOf()))
            return self[key.valueOf()];

        if (!(key instanceof ESNumber))
            return new ESUndefined();

        let idx = key.valueOf();

        while (idx < 0)
            idx = this.valueOf().length + idx;

        if (idx < this.valueOf().length)
            return this.valueOf()[idx]?.valueOf();

        return new ESUndefined();
    };

    __setProperty__(key: Primitive, value: Primitive): void {
        if (!(key instanceof ESNumber))
            return;

        if (!(value instanceof ESPrimitive))
            value = ESPrimitive.wrap(value);

        let idx = key.valueOf();

        while (idx < 0)
            idx = this.valueOf().length + idx;

        this.__value__[idx] = value;
    }

    // Util
    /**
     * Uses JS Array.prototype.splice
     * @param val value to insert
     * @param idx index to insert at, defaults to end of array
     */
    add = (val: Primitive, idx: Primitive = new ESNumber(this.len - 1)) => {
        this.len++;
        this.__value__.splice(idx.valueOf(), 0, val);
        return new ESNumber(this.len);
    }

    /**
     * Uses JS Array.prototype.includes
     * @param val value to check for
     */
    contains = (val: Primitive) => {
        for (let element of this.__value__)
            if (val.valueOf() == element.valueOf())
                return true;
        return false;
    };

    clone = (): ESArray => new ESArray(this.valueOf().map(v => v.clone()));
}

export class ESNamespace extends ESPrimitive<dict<ESSymbol>> {
    public mutable: boolean;
    constructor(name: ESString, value: dict<ESSymbol>, mutable=false) {
        super(value, types.object);
        this.info.name = name.valueOf();
        this.mutable = mutable;
    }

    get name () {
        return new ESString(this.info.name);
    }

    set name (v: ESString) {
        this.info.name = v.valueOf();
    }

    clone = (): Primitive => {
        let obj: dict<ESSymbol> = {};
        let toClone = this.valueOf();
        for (let key in toClone) {
            try {
                obj[key] = toClone[key].clone();
            } catch (e) {
                throw Error('Couldn\'t clone ' + str(toClone[key]));
            }
        }
        return new ESNamespace(this.name, obj);
    }

    str = (): ESString => {
        const keys = Object.keys(this.valueOf());
        return new ESString(`<Namespace ${str(this.name)}: ${keys.slice(0, 5)}${keys.length >= 5 ? '...' : ''}>`);
    }

    __eq__ = (n: Primitive): ESBoolean => {
        return new ESBoolean(this === n);
    };
    __bool__ = () => new ESBoolean(true);

    __getProperty__ = (key: Primitive): Primitive => {
        const self: any = this;

        if (key instanceof ESString && this.valueOf().hasOwnProperty(key.valueOf())) {
            const symbol = this.valueOf()[key.valueOf()];
            if (symbol.isAccessible)
                return symbol.value;
        }

        if (self.hasOwnProperty(key.valueOf()))
            return ESPrimitive.wrap(self[key.valueOf()]);

        return new ESUndefined();
    };

    __setProperty__(key: Primitive, value: Primitive): void | ESError {
        if (!(key instanceof ESString))
            return;

        let idx = str(key);

        if (!this.mutable)
            return new TypeError(Position.unknown, 'mutable', 'immutable', `${str(this.name)}`);

        if (!(value instanceof ESPrimitive))
            value = ESPrimitive.wrap(value);

        const symbol = this.__value__[idx];
        if (!symbol)
            return new ESError(Position.unknown, 'SymbolError', `Symbol ${idx} is not declared in namespace ${str(this.name)}.`);
        if (symbol.isConstant)
            return new TypeError(Position.unknown, 'mutable', 'immutable', `${str(this.name)}.${idx}`);
        if (!symbol.isAccessible)
            return new TypeError(Position.unknown, 'accessible', 'inaccessible', `${str(this.name)}.${idx}`);

        symbol.value = value;
    }
}

export let types: {[key: string] : ESType} = {};

types['type'] = new ESType(true, 'Type');
types['undefined'] = new ESType(true, 'Undefined');
types['string'] = new ESType(true, 'String');
types['array'] = new ESType(true, 'Array');
types['number'] = new ESType(true, 'Number');
types['any'] = new ESType(true, 'Any');
types['function'] = new ESType(true, 'Function');
types['bool'] = new ESType(true, 'Boolean');
types['object'] = new ESType(true, 'Object');
types['error'] = new ESType(true, 'Error');

// Documentation for types
types.any.info = {
    name: 'any',
    description: 'Matches any other type',
    file: 'built-in',
    isBuiltIn: true
};
types.number.info = {
    name: 'any',
    description: 'The ES Number type. Is a a double-precision 64-bit binary format IEEE 754 value, like double in Java and c#',
    file: 'built-in',
    isBuiltIn: true
};
types.string.info = {
    name: 'string',
    description: 'The ES String type. Holds an array of characters, and can be defined with any of \', " and `. Can be indexed like an array.',
    file: 'built-in',
    isBuiltIn: true
};
types.bool.info = {
    name: 'bool',
    description: 'The ES Bool type. Exactly two instances exist, true and false.',
    file: 'built-in',
    isBuiltIn: true
};
types.function.info = {
    name: 'function',
    description: 'The ES Function type. Is a block of code which executes when called and takes in 0+ parameters.',
    file: 'built-in',
    isBuiltIn: true
};
types.array.info = {
    name: 'array',
    description: 'The ES Array type. Defines a set of items of any type which can be accessed by an index with [].',
    file: 'built-in',
    isBuiltIn: true
};
types.object.info = {
    name: 'object',
    description: 'The ES Object type. Similar to JS objects or python dictionaries.',
    file: 'built-in',
    isBuiltIn: true
};
types.error.info = {
    name: 'error',
    description: 'The ES Error type. Call to throw an error.',
    file: 'built-in',
    isBuiltIn: true
};
types.type.info = {
    name: 'type',
    description: 'The ES Type type. Call to get the type of a value at a string.',
    file: 'built-in',
    isBuiltIn: true
};