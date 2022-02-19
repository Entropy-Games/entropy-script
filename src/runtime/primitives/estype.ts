import { ESError, IndexError, InvalidOperationError } from '../../errors.js';
import {createInstance} from '../instantiator.js';
import {ESBoolean} from './esboolean.js';
import {ESFunction} from './esfunction.js';
import {ESObject} from './esobject.js';
import {ESString} from './esstring.js';
import {ESPrimitive} from './esprimitive.js';
import {Primitive, types, typeName} from './primitive.js';
import { funcProps } from "../../util/util.js";
import { wrap } from "./wrapStrip.js";
import { Position } from "../../position.js";
import {str} from "../../util/util.js";

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

        if (!types.type) {
            this.__type__ = this;
        }
    }

    clone = () => {
        return new ESType(
            this.__isPrimitive__,
            this.__name__,
            this.__methods__,
            this.__extends__,
            this.__init__
        )
    }

    isa = ({}, type: Primitive) => {
        return new ESBoolean(type === types.type);
    }

    cast = ({}, type: Primitive) => new InvalidOperationError('cast', this);

    includesType = (props: funcProps, t: ESType): ESBoolean => {
        if (
            this.equals(props, types.any).bool().valueOf() ||
            t.equals(props, types.any).bool().valueOf() ||

            (this.__extends__?.equals(props, t).valueOf() === true) ||
            (this.__extends__?.equals(props, types.any).valueOf() === true) ||
            (this.__extends__?.includesType(props, t).valueOf() === true) ||

            (t.__extends__?.equals(props, this).valueOf() === true) ||
            (t.__extends__?.equals(props, types.any).valueOf() === true) ||
            (t.__extends__?.includesType(props, this).valueOf() === true)
        ) {
            return new ESBoolean(true);
        }

        return this.equals(props, t);
    }

    equals = ({}: funcProps, t: ESType): ESBoolean => {
        return new ESBoolean(
            t.__name__ === this.__name__ &&
            t.__isPrimitive__ === this.__isPrimitive__ &&
            Object.is(this.valueOf(), t.valueOf())
        );
    }

    __call__ = ({ context }: funcProps, ...params: Primitive[]): ESError | Primitive => {
        return createInstance(this, {context}, params || []);
    }

    str = () => new ESString(`<Type: ${this.__name__}>`);

    __bool__ = () => new ESBoolean(true);
    bool = this.__bool__;

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
