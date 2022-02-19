import {ESError, TypeError} from "../errors.js";
import {Position} from "../position.js";
import { strip, wrap } from '../runtime/primitives/wrapStrip.js';
import {
    ESArray, ESFunction, ESNamespace,
    ESNumber,
    ESObject,
    ESPrimitive,
    ESString, ESUndefined,
    FunctionInfo, types
} from '../runtime/primitiveTypes.js';
import {BuiltInFunction, indent, sleep, str} from '../util/util.js';
import { ESJSBinding } from "../runtime/primitives/esjsbinding.js";

export const builtInFunctions: {[n: string]: [BuiltInFunction, FunctionInfo]} = {
    'range': [({context}, num) => {
        if (!(num instanceof ESNumber))
            return new TypeError(Position.unknown, 'Number', num.typeName().valueOf(), num.valueOf());

        const n: any = num.valueOf();

        try {
            return new ESArray([...Array(n).keys()].map(n => new ESNumber(n)));
        } catch (e) {
            return new ESError(Position.unknown, 'RangeError', `Cannot make range of length '${str(num)}'`);
        }
    }, {
       args: [{
           name: 'N',
           type: 'Number',
       }],
        description: 'Generates an array of integers given N. Starts at 0 and goes to N-1. Can be used like for i in range(10) ..., similarly to python.',
        returns: 'array of numbers from 0 to N-1',
        returnType: 'number[] | RangeError'
    }],

    'log': [({context}, ...msgs) => {
        console.log(...msgs.map(m => str(m)));
    }, {
        args: [{
            name: '...values',
            type: 'any[]'
        }],
        description: 'Uses console.log to log all values',
        returnType: 'void'
    }],

    'parseNum': [({context}, num) => {
        try {
            const val: number = parseFloat(str(num));
            if (isNaN(val)) {
                return new ESError(Position.unknown, 'TypeError', `Cannot convert '${str(num)}' to a number.`)
            }
            return new ESNumber(val);
        } catch (e) {
            return new ESError(Position.unknown, 'TypeError', `Cannot convert '${str(num)}' to a number.`)
        }
    }, {
        args: [{
            name: 'num',
            type: 'any'
        }],
        description: `Converts a string of digits into a number. Works with decimals and integers. Calls .str() on value before using native JS 'parseFloat' function. Returns TypeError if the string can't be converted into a number.`,
        returnType: 'number | TypeError'
    }],

    'help': [({context}, ...things) => {
        // I am truly disgusted by this function.
        // But I am not going to make it look better.

        if (!things.length)
            return new ESString(`
Visit https://entropygames.io/entropy-script for help with Entropy Script!
Try 'help(object)' for help about a particular object.
`);

        let out = '';

        for (const thing of things) {
            if (!(thing instanceof ESPrimitive)) {
                console.log('Invalid arg not primitive: ' + str(thing));
                return;
            }
            const info = thing.info;
            out += `${`Help on '${info.name || '(anonymous)'.yellow}'`.yellow}:
    
    ${'Value'.yellow}: ${indent(indent(str(thing)))}
    ${'Type'.yellow}: '${str(thing.typeName())}'
    ${'Location'.yellow}: ${info.file || '(unknown)'.yellow}
    
        ${info.description?.green || `No description.`}
        
    ${info.helpLink ? (info.helpLink + '\n\n').cyan : ''}
`;
            if (info.args && thing instanceof ESFunction) {
                const total = info.args.length;
                const required = info.args.filter(a => a.required).length;
                if (total == required)
                    out += `    Arguments (${total}): \n`.yellow;
                else
                    out += `    Arguments (${required}-${total}): \n`.yellow;

                for (const [idx, arg] of info.args.entries()) {
                    if (typeof arg !== 'object') out += `        ${idx + 1}. INVALID ARG INFO`;
                    else out += `        ${idx + 1}. ${arg.name}${arg.required === false ? ' (optional) ' : ' '.yellow}{${arg.type}} ${arg.description || ''}\n`;
                }

                out += `\n\n`;
                if (info.returns)
                    out += `    Returns: ${info.returns}\n\n`;
                if (info.returnType)
                    out += `    Return Type: ${info.returnType}\n\n`;
            }

            if (info.contents && (thing instanceof ESObject || thing instanceof ESNamespace)) {
                out += '    Properties: \n      ';
                for (let contents of info.contents)
                    out += contents.name + '\n      ';
            }
        }

        console.log(out);
        if (things.length > 1) {
            return new ESArray(things);
        }
        if (things) {
            return things[0];
        }
    }, {
        args: [{
            name: 'value',
             type: 'any'
        }],
        description: 'logs info on value',
        returns: 'value passed in'
    }],

    'describe': [({context}, thing, description) => {
        thing.info.description = str(description);
        return thing;
    }, {
        args: [{
            name: 'value',
            type: 'any'
        }, {
            name: 'description',
            type: 'string'
        }],
        description: `Adds a description to whatever is passed in. Can be seen by calling help(value). Add more details with the 'detail' function`,
        returns: 'the value passed in',
        returnType: 'any'
    }],

    'detail': [(props, thing, info) => {
        if (!(info instanceof ESObject))
            return new TypeError(Position.unknown, 'object', str(info.typeName()), str(info));

       if (thing.info.isBuiltIn)
           return new ESError(Position.unknown, 'TypeError',`Can't edit info for built-in value ${thing.info.name} with 'detail'`);

        thing.info = strip(info, props);
        thing.info.isBuiltIn = false;

        return thing;
    }, {
        args: [{
            name: 'value',
            type: 'any'
        }, {
            name: 'info',
            type:
`   Info {
        name?: string,
        description?: string,
        file?: string,
        helpLink?: string,
        args?: {
            name?: string,
            type?: string,
            description?: string,
            required?: boolean
        }[],
        returns?: string,
        returnType?: string,
        contents?: Info[]
    }`
        }],
        returns: 'the value passed',

    }],

    'delete': [({context}, name) => {
        const id = str(name);
        if (!context.has(id)) {
            return new ESError(Position.unknown, 'DeleteError', `Identifier '${id}' not found in the current context`);
        }
        context.set(id, new ESUndefined());
    }, {
        name: 'delete',
        args: [{name: 'identifier', type: 'string'}],
        description: 'Deletes a variable from the current context'
    }],

    '__path': [({context}) => {
        return new ESString(context.path);
    }, {
        name: '__path',
        args: [],
        description: 'Returns the current path'
    }],

    '__allSymbols': [({context}) => {
        return wrap(context.keys);
    }, {
        name: '__allSymbols',
        args: [],
        description: 'Returns an array of the names of all symbols in the current context'
    }],

    'using': [({context}, module, global_) => {
        if (!(module instanceof ESNamespace) && !(module instanceof ESJSBinding)) {
            return new TypeError(Position.unknown, 'Namespace', str(module.typeName()));
        }

        let global = true;

        if (global_) {
            if (!global_.bool().valueOf()) {
                global = false;
            }
        }

        const values = module.valueOf();

        if (global) {
            context = context.root;
        } else if (context.parent) {
            context = context.parent;
        }

        for (const key of Object.keys(values)) {
            context.setOwn(key, values[key].value, {
                isConstant: values[key].isConstant,
                isAccessible: values[key].isAccessible,
                forceThroughConst: true
            });
        }
    }, {
        name: 'using',
        args: [
            {name: 'module', type: 'namespace'},
            {name: 'global', type: 'bool'}
        ],
        description: 'Adds contents of a namespace to the global context'
    }],

    'sleep': [({context}, time, cb) => {
        if (!(time instanceof ESNumber))
            return new TypeError(Position.unknown, 'number', str(time.typeName()), str(time));
        if (!(cb instanceof ESFunction))
            return new TypeError(Position.unknown, 'function', str(cb.typeName()), str(cb));

        sleep(time.valueOf())
            .then(() => {
                const res = cb.__call__({context});
                if (res instanceof ESError)
                    console.log(res.str);
            });
    }, {
        name: 'sleep',
        args: [{name: 'n', type: 'number'}, {name: 'callback', type: 'function'}],
        description: 'Waits n milliseconds and then executes the callback'
    }],
}
