import { Error, IndexError, TypeError as ESTypeError } from '../../errors';
import Position from '../../position';
import {ESBoolean} from './esboolean';
import {ESString} from './esstring';
import {ESPrimitive} from './esprimitive';
import { dict, funcProps, str } from '../../util/util';
import type {NativeObj, Primitive} from './primitive';
import { strip, wrap } from './wrapStrip';
import { ESFunction } from "./esfunction";
import { types } from "../../util/constants";
import { ESTypeIntersection, ESTypeUnion } from "./estype";
import { ESArray } from "./esarray";
import { ESErrorPrimitive } from "./eserrorprimitive";


function tryCall (fTakesProps: boolean, val: any, key: any, props: funcProps, args: Primitive[], catchErs: boolean): Primitive | Error {
    if (typeof val[key] !== 'function') {
        return new ESTypeError(Position.void, 'Func', typeof val[key], str(val[key]));
    }
    let res;
    if (fTakesProps) {
        try {
            res = new val[key](props, ...args);
        } catch (e: any) {
            if (!(e instanceof TypeError)) {
                return new Error(Position.void, e.name, e.toString());
            }
            try {
                res = val[key](props, ...args);
            } catch (e: any) {
                return new Error(Position.void, '', e.toString());
            }
        }
    } else {
        try {
            res = new val[key](...args.map(o => strip(o, props)));
        } catch (e: any) {
            if (!(e instanceof TypeError)) {
                return new Error(Position.void, e.name, e.toString());
            }
            try {
                res = val[key](...args.map(o => strip(o, props)));
            } catch (e: any) {
                return new Error(Position.void, '', e.toString());
            }
        }
    }
    if (res instanceof Error && catchErs) {
        return new ESErrorPrimitive(res);
    }
    return wrap(res);
}


export class ESJSBinding<T=NativeObj> extends ESPrimitive<T> {

    functionsTakeProps: boolean;
    catchErrorsToPrimitive: boolean;

    constructor (value: T, name='<AnonNative>', functionsTakeProps=false, catchErrors=false) {
        super(value, types.object);
        this.__info__.name = str(name);
        this.functionsTakeProps = functionsTakeProps;
        this.catchErrorsToPrimitive = catchErrors;
    }

    override cast = (props: funcProps): Error | Primitive => {
        return new Error(Position.void, 'ESTypeError', `Cannot cast native object`);
    };

    override clone = (): Primitive => new ESJSBinding<T>(this.__value__);

    override str = (): ESString => {
        return new ESString(str(this.__value__));
    };

    override __eq__ = (props: funcProps, n: Primitive): ESBoolean => {
        return new ESBoolean(this === n);
    };

    override __bool__ = (): ESBoolean => new ESBoolean(true);
    override bool = this.__bool__;

    override __get__ = (props: funcProps, k: Primitive): Primitive | Error => {
        const key = str(k);

        const val: any = this.__value__;

        const res = val[key];

        if (res === undefined) {

            // check on self after confirming it doesn't exist on the native value
            if (this._.hasOwnProperty(key)) {
                return wrap(this._[key], true);
            }

            return new IndexError(Position.void, key, this);
        }

        if (res instanceof ESPrimitive) {
            return res;
        }

        // preserve this context
        if (typeof res === 'function') {

            const fTakesProps = this.functionsTakeProps;

            const fn = new ESFunction((props, ...args) => {
                return tryCall(fTakesProps, val, key, props, args, this.catchErrorsToPrimitive);
            });

            fn.__allow_kwargs__ = true;
            fn.__allow_args__ = true;

            return fn;
        }

        return wrap(res);
    };

    override __set__ (props: funcProps, k: Primitive, value: Primitive): void | Error {
        const key = str(k);

        const val: dict<NativeObj> = this.__value__;

        if (this._.hasOwnProperty(key)) {
            this._[str(key)] = value;
            return;
        }

        val[key] = strip(value, props);
    }

    override __call__ = (props: funcProps, ...args: Primitive[]): Error | Primitive => {
        if (typeof this.__value__ !== 'function') {
            return new ESTypeError(Position.void, 'function', typeof this.__value__, str(this));
        }

       return tryCall(this.functionsTakeProps, this, '__value__', props, args, this.catchErrorsToPrimitive);
    };

    override has_property = (props: funcProps, key: Primitive): ESBoolean => {
        return new ESBoolean(!(this.__get__(props, key) instanceof Error));
    };

    override type_check = this.__eq__;

    override __pipe__ (props: funcProps, n: Primitive): Primitive | Error {
        return new ESTypeUnion(this, n);
    }
    override __ampersand__ (props: funcProps, n: Primitive): Primitive | Error {
        return new ESTypeIntersection(this, n);
    }

    override __iter__(props: funcProps): Error | Primitive {
        // returns array of keys in the object
        return new ESArray(Object.keys(this.valueOf()).map(s => new ESString(s)));
    }
}
