import {ESPrimitive} from './esprimitive';
import { Error, InvalidOperationError, TypeError } from '../../errors';
import {createInstance} from '../instantiator';
import {ESBoolean} from './esboolean';
import type {ESFunction} from './esfunction';
import {ESObject} from './esobject';
import {ESString} from './esstring';
import type {Primitive, typeName} from './primitive';
import type { funcProps } from "../../util/util";
import { wrap } from "./wrapStrip";
import Position from "../../position";
import {str} from "../../util/util";
import { types } from "../../util/constants";
import { ESTypeArray } from "./esarray";
import type { runtimeArgument } from "../argument";

export class ESType extends ESPrimitive <undefined> {

    readonly __primordial__: boolean;

    readonly __name__: typeName;
    readonly __extends__: undefined | ESType;
    readonly __methods__: ESFunction[];
    readonly __init__: ESFunction | undefined;
    readonly __instances__: ESObject[] = [];
    readonly __targs__: runtimeArgument[];

    constructor (
        isPrimitive: boolean = false,
        name: typeName = '(anon)',
        __methods__: ESFunction[] = [],
        __extends__?: undefined | ESType,
        __init__?: undefined | ESFunction,
        targs: runtimeArgument[] = []
    ) {
        super(undefined, types?.type);

        this.__primordial__ = isPrimitive;
        this.__name__ = name;
        this.__info__.name = name;
        this.__extends__ = __extends__;
        this.__methods__ = __methods__;
        this.__targs__ = targs;

        if (__init__) {
            __init__.name = name;
            this.__init__ = __init__;
        }

        if (!types.type) {
            this.__type__ = this;
        }
    }

    override clone = () => {
        return new ESType(
            this.__primordial__,
            this.__name__,
            this.__methods__,
            this.__extends__,
            this.__init__,
            this.__targs__
        )
    }

    override isa = (props: funcProps, type: Primitive) => {
        return new ESBoolean(type === types.type);
    }

    override cast = () => {
        return new InvalidOperationError('cast', this);
    }

    override __includes__ = (props: funcProps, n: Primitive): ESBoolean | Error => {
        if (!n) return new ESBoolean();
        let t = n.__type__;

        if (
            this === types.any ||
            t === types.any ||
            this === t
        ) {
            return new ESBoolean(true);
        }

        while (t instanceof ESType) {
            let eqRes = t.__extends__?.__eq__(props, this);
            if (eqRes instanceof Error) return eqRes;
            if (eqRes?.__value__ === true) {
                return new ESBoolean(true);
            }
            if (!t.__extends__) {
                break;
            }
            t = t.__extends__;
        }

        return new ESBoolean();
    }

    override __eq__ = (props: funcProps, t: Primitive): ESBoolean | Error => {
        return new ESBoolean(t === this);
    }

    override __call__ = (props: funcProps, ...params: Primitive[]): Error | Primitive => {
        let res = createInstance(this, props, params || []);
        if (res instanceof ESObject) {
            this.__instances__.push(res);
        }
        return res;
    }

    override str = () => new ESString(this.__name__);

    override __bool__ = () => new ESBoolean(true);
    override bool = this.__bool__;

    override __get__ = (props: funcProps, k: Primitive): Primitive | Error => {
        if (!(k instanceof ESString)) {
            if (this === types.array) {
                return new ESTypeArray(k);
            }
            return new TypeError(Position.void, 'string', k.__type_name__(), str(k));
        }
        const key = k.__value__;
        if (this._.hasOwnProperty(key)) {
            return wrap(this._[key], true);
        }
        return new ESTypeArray(k);
    };

    override __pipe__ (props: funcProps, n: Primitive): Primitive | Error {
        return new ESTypeUnion(this, n);
    }
    override __ampersand__ (props: funcProps, n: Primitive): Primitive | Error {
        return new ESTypeIntersection(this, n);
    }


    override keys = () => {
        return Object.keys(this).map(s => new ESString(s));
    }
}

export class ESTypeUnion extends ESType {

    private readonly __left__: Primitive;
    private readonly __right__: Primitive;

    constructor (left: Primitive, right: Primitive) {
        super(false, `(${str(left)}) | (${str(right)})`);
        this.__left__ = left;
        this.__right__ = right;
    }

    override __call__ = (): Error | Primitive => {
        return new InvalidOperationError('__call__', this);
    }

    override __includes__ = (props: funcProps, t: Primitive): ESBoolean | Error => {
        const leftRes = this.__left__.__includes__(props, t);
        const rightRes = this.__right__.__includes__(props, t);
        if (leftRes instanceof Error) return leftRes;
        if (rightRes instanceof Error) return rightRes;

        return new ESBoolean(
            leftRes.__value__ ||
            rightRes.__value__
        );
    }

    override clone = (): ESType => {
        return new ESTypeUnion(this.__left__, this.__right__);
    }

    override __eq__ = (props: funcProps, t: Primitive) => {
        if (!(t instanceof ESTypeUnion)) return new ESBoolean();

        let leftTypeCheckRes = this.__left__.__eq__(props, t.__left__);
        if (leftTypeCheckRes instanceof Error) return leftTypeCheckRes;

        let rightTypeCheckRes = this.__right__.__eq__(props, t.__right__);
        if (rightTypeCheckRes instanceof Error) return rightTypeCheckRes;

        return new ESBoolean(leftTypeCheckRes.__value__ && rightTypeCheckRes.__value__);
    }
}


export class ESTypeIntersection extends ESType {

    private readonly __left__: Primitive;
    private readonly __right__: Primitive;

    constructor (left: Primitive, right: Primitive) {
        super(false, `(${str(left)}) & (${str(right)})`);
        this.__left__ = left;
        this.__right__ = right;
    }

    override __call__ = (): Error | Primitive => {
        return new InvalidOperationError('__call__', this);
    }

    override __includes__ = (props: funcProps, t: Primitive): ESBoolean | Error => {
        const leftRes = this.__left__.__includes__(props, t);
        const rightRes = this.__right__.__includes__(props, t);
        if (leftRes instanceof Error) return leftRes;
        if (rightRes instanceof Error) return rightRes;

        return new ESBoolean(
            leftRes.__value__ &&
            rightRes.__value__
        );
    }

    override clone = () => {
        return new ESTypeIntersection(this.__left__, this.__right__);
    }

    override __eq__ = (props: funcProps, t: Primitive) => {
        if (!(t instanceof ESTypeIntersection)) return new ESBoolean();

        let leftTypeCheckRes = this.__left__.__eq__(props, t.__left__);
        if (leftTypeCheckRes instanceof Error) return leftTypeCheckRes;

        let rightTypeCheckRes = this.__right__.__eq__(props, t.__right__);
        if (rightTypeCheckRes instanceof Error) return rightTypeCheckRes;

        return new ESBoolean(leftTypeCheckRes.__value__ && rightTypeCheckRes.__value__);
    }
}

export class ESTypeNot extends ESType {
    private readonly __val__: Primitive;

    constructor (type: Primitive) {
        super(false, `~(${str(type)})`);
        this.__val__ = type;
    }

    override __call__ = (): Error | Primitive => {
        return new InvalidOperationError('__call__', this);
    }

    override __includes__ = (props: funcProps, t: Primitive): ESBoolean | Error => {
        const res = this.__val__.__includes__(props, t);
        if (res instanceof Error) return res;

        return new ESBoolean(!res.__value__);
    }

    override clone = () => {
        return new ESTypeNot(this.__val__);
    }

    override __eq__ = (props: funcProps, t: Primitive) => {
        if (!(t instanceof ESTypeNot)) return new ESBoolean();

        let typeCheckRes = this.__val__.__eq__(props, t.__val__);
        if (typeCheckRes instanceof Error) return typeCheckRes;
        return new ESBoolean(typeCheckRes.__value__ === true);
    }
}