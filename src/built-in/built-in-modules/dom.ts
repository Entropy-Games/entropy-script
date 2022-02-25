import {IS_NODE_INSTANCE} from '../../constants';
import { ESError, ReferenceError, InvalidRuntimeError } from '../../errors';
import {Position} from '../../position';
import { JSModule, JSModuleFunc } from '../module';
import { ESJSBinding } from "../../runtime/primitives/esjsbinding";

const module: JSModuleFunc = (): JSModule | ESError => {

    if (IS_NODE_INSTANCE) {
        return new InvalidRuntimeError();
    }

    const w: { [k: string]: any; } | undefined = window;

    if (typeof w === 'undefined' || !('$' in w)) {
        return new ReferenceError(Position.unknown, '$ must be property of window to use dom library');
    }

    const $: any = new ESJSBinding(w['$'], 'jquery');

    return {
        $,
        window: new ESJSBinding(w, 'window'),
        document: new ESJSBinding(w['document'], 'document'),
    };
}

export default module;