import {ESPrimitive} from './esprimitive.js';
import {global} from '../../constants.js';
import { ESError, IndexError } from '../../errors.js';
import {Position} from '../../position.js';
import { BuiltInFunction, funcProps } from '../../util/util.js';
import {runtimeArgument} from '../argument.js';
import type {Context} from '../context.js';
import {call} from '../functionCaller.js';
import {Node} from '../nodes.js';
import {str} from '../../util/util.js';
import {ESBoolean} from './esboolean.js';
import {ESObject} from './esobject.js';
import {ESString} from './esstring.js';
import {ESType} from './estype.js';
import {Primitive, types} from './primitive.js';
import { wrap } from "./wrapStrip.js";


export class ESFunction extends ESPrimitive <Node | BuiltInFunction> {
    arguments_: runtimeArgument[];
    this_: ESObject;
    returnType: ESType;
    __closure__: Context;

    constructor (
        func: Node | BuiltInFunction = (() => {}),
        arguments_: runtimeArgument[] = [],
        name='(anon)',
        this_: ESObject = new ESObject(),
        returnType = types.any,
        closure = global
    ) {
        super(func, types.function);
        this.arguments_ = arguments_;
        this.info.name = name;
        this.this_ = this_;
        this.returnType = returnType;
        this.__closure__ = closure;

        this.info.returnType = str(returnType);
        this.info.args = arguments_.map(arg => ({
            name: arg.name,
            defaultValue: str(arg.defaultValue),
            type: arg.type.info.name,
            required: true
        }));
        // TODO: info.helpLink
    }

    cast = ({}, type: Primitive) => {
        return new ESError(Position.unknown, 'TypeError', `Cannot cast type 'function'`)
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

    __eq__ = ({}: {context: Context}, n: Primitive) => {
        if (!(n instanceof ESFunction))
            return new ESBoolean(false);
        return new ESBoolean(this.__value__ === n.__value__);
    };

    __bool__ = () => new ESBoolean(true);
    bool = this.__bool__;

    __call__ = ({context}: funcProps, ...params: Primitive[]): ESError | Primitive => {
        this.__closure__.path = context.path;
        return call(this.__closure__, this, params);
    }

    __getProperty__ = ({}: funcProps, key: Primitive): Primitive | ESError => {
        if (this.self.hasOwnProperty(str(key))) {
            const val = this.self[str(key)];
            if (typeof val === 'function') {
                return new ESFunction(val);
            }
            return wrap(val);
        }
        return new IndexError(Position.unknown, key.valueOf(), this);
    };
}