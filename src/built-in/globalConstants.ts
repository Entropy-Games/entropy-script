import { ESBoolean, ESJSBinding, ESNumber, ESNull, Primitive } from '../runtime/primitiveTypes';
import type { Context } from "../runtime/context";
import { types } from "../util/constants";
import type { Map } from "../util/util";

import * as errors from '../errors';

export default function (context: Context) {

    // must be declared inside function as get import error otherwise
    const globalConstants: Map<Primitive> = {
        'false': new ESBoolean(false),
        'true': new ESBoolean(true),
        'nil': new ESNull(),
        'inf': new ESNumber(Infinity),

        '__main__': new ESBoolean(true),

        'Any': types.any,
        'Num': types.number,
        'Str': types.string,
        'Bool': types.bool,
        'Func': types.function,
        'Arr': types.array,
        'Obj': types.object,
        'Type': types.type,
        'Err': types.error,
        'Null': types.undefined
    };

    for (const cls of Object.keys(errors)) {
        globalConstants[cls] = new ESJSBinding((errors as any)[cls], cls, false, true);
    }

    for (const constant in globalConstants) {
        const value = globalConstants[constant];
        context.set(constant, value, {
            global: true,
            isConstant: true
        });
    }
}


