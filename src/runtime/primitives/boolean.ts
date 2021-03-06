import { Error, IndexError, TypeError } from '../../errors';
import {ESPrimitive} from '../primitive';
import { IFuncProps, Primitive, str } from '../../util/util';
import {ESNumber} from './number';
import {ESString} from './string';
import { wrap } from "../wrapStrip";
import { types } from "../../util/constants";
import { ESTypeIntersection } from "./intersection";
import { ESTypeUnion } from "./type";

export class ESBoolean extends ESPrimitive <boolean> {
    constructor (val = false) {
        super(Boolean(val), types.bool);

        this.__info__ = {
            name: str(val),
            description: `Boolean global constant which evaluates to ${str(val)}, the opposite of ${str(!val)}`,
            file: 'built-in',
            builtin: true,
            helpLink: 'https://en.wikipedia.org/wiki/Boolean_expression'
        };
    }

    override __get__ = (props: IFuncProps, key: Primitive): Primitive | Error => {
        if (str(key) in this) {
            return wrap(this._[str(key)], true);
        }
        return new IndexError(key.__value__, this);
    };

    override cast = (props: IFuncProps, type: Primitive) => {
        switch (type) {
            case types.number:
                return new ESNumber(this.__value__ ? 1 : 0);
            default:
                return new Error('TypeError', `Cannot cast boolean to type '${str(type.__type_name__())}'`);
        }
    }

    override __eq__ = (props: IFuncProps, n: Primitive) => {
        if (!(n instanceof ESBoolean)) {
            return new TypeError('Boolean', n.__type_name__(), n.__value__);
        }
        return new ESBoolean(this.__value__ === n.__value__);
    };
    override __bool__ = () => this;

    override __and__ = (props: IFuncProps, n: Primitive) =>
        new ESBoolean(this.__value__ && n.bool(props)?.__value__ === true);

    override __or__ = (props: IFuncProps, n: Primitive): Error | ESBoolean => {
        return new ESBoolean(this.__value__ || n.bool(props).__value__ === true);
    };

    override str = () => new ESString(this.__value__ ? 'true' : 'false');
    override clone = () => new ESBoolean(this.__value__);

    override bool = () => this;

    override __includes__ = this.__eq__;
    override __subtype_of__ = (props: IFuncProps, n: Primitive) => {
        if (Object.is(n, types.any) || Object.is(n, types.boolean)) {
            return new ESBoolean(true);
        }
        return this.__eq__(props, n);
    }

    override __pipe__ = (props: IFuncProps, n: Primitive): Primitive | Error => {
        return new ESTypeUnion(this, n);
    }
    override __ampersand__ = (props: IFuncProps, n: Primitive): Primitive | Error => {
        return new ESTypeIntersection(this, n);
    }

    override keys = () => {
        return Object.keys(this).map(s => new ESString(s));
    }
}
