import { Token } from "./tokens.js";
import * as n from '../runtime/nodes.js';
import { N_functionDefinition, N_namespace, N_undefined, N_variable } from '../runtime/nodes.js';
import { ESError, InvalidSyntaxError } from "../errors.js";
import { tokenType, tokenTypeString, tt } from "./tokens.js";
import { types } from "../runtime/primitiveTypes.js";
export class ParseResults {
    constructor() {
        this.advanceCount = 0;
        this.lastRegisteredAdvanceCount = 0;
        this.reverseCount = 0;
    }
    registerAdvance() {
        this.advanceCount = 1;
        this.lastRegisteredAdvanceCount++;
    }
    register(res) {
        this.lastRegisteredAdvanceCount = res.advanceCount;
        this.advanceCount += res.advanceCount;
        if (res.error)
            this.error = res.error;
        return res.node;
    }
    tryRegister(res) {
        if (res.error) {
            this.reverseCount += res.advanceCount;
            return;
        }
        return this.register(res);
    }
    success(node) {
        this.node = node;
        return this;
    }
    failure(error) {
        this.error = error;
        return this;
    }
}
export class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.tokenIdx = -1;
        this.currentToken = tokens[0];
        this.advance();
    }
    parse() {
        var _a;
        if (!this.currentToken || !this.tokens || (this.tokens.length === 1 && this.tokens[0].type === tt.EOF))
            return new ParseResults();
        const res = this.statements(true);
        if (!res.error && this.currentToken.type !== tokenType.EOF) {
            return res.failure(new InvalidSyntaxError((_a = this.currentToken) === null || _a === void 0 ? void 0 : _a.startPos, `Expected 'End of File', got token of type'${tokenTypeString[this.currentToken.type]}' of value ${this.currentToken.value}`));
        }
        return res;
    }
    advance(res) {
        if (res)
            res.registerAdvance();
        this.tokenIdx++;
        this.currentToken = this.tokens[this.tokenIdx];
        return this.currentToken;
    }
    reverse(amount = 1) {
        this.tokenIdx -= amount;
        this.currentToken = this.tokens[this.tokenIdx];
        return this.currentToken;
    }
    consume(res, type, errorMsg) {
        if (this.currentToken.type !== type)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, errorMsg !== null && errorMsg !== void 0 ? errorMsg : `Expected '${tokenTypeString[type]}' but got '${tokenTypeString[this.currentToken.type]}'`));
        this.advance(res);
    }
    clearEndStatements(res) {
        while (this.currentToken.type === tt.ENDSTATEMENT) {
            this.advance(res);
        }
    }
    statements(useArray = false) {
        const res = new ParseResults();
        const startPos = this.currentToken.startPos;
        let statements = [];
        this.clearEndStatements(res);
        statements.push(res.register(this.statement()));
        if (res.error)
            return res;
        let moreStatements = true;
        while (true) {
            let newLineCount = 0;
            // @ts-ignore
            while (this.currentToken.type === tt.ENDSTATEMENT) {
                this.advance(res);
                newLineCount++;
            }
            if (newLineCount === 0)
                moreStatements = false;
            if (!moreStatements)
                break;
            const statement = res.tryRegister(this.statement());
            if (!statement) {
                this.reverse(res.reverseCount);
                continue;
            }
            statements.push(statement);
        }
        this.clearEndStatements(res);
        let node = new n.N_statements(startPos, statements);
        if (useArray)
            node = new n.N_array(startPos, statements, true);
        return res.success(node);
    }
    statement() {
        const res = new ParseResults();
        const startPos = this.currentToken.startPos;
        if (this.currentToken.matches(tt.KEYWORD, 'return')) {
            this.advance(res);
            let expr = new N_undefined(this.currentToken.startPos);
            if (this.currentToken.type !== tt.ENDSTATEMENT)
                expr = res.register(this.expr());
            return res.success(new n.N_return(startPos, expr));
            // yield has the same format as return
        }
        else if (this.currentToken.matches(tt.KEYWORD, 'yield')) {
            this.advance(res);
            let expr = new N_undefined(this.currentToken.startPos);
            if (this.currentToken.type !== tt.ENDSTATEMENT)
                expr = res.register(this.expr());
            return res.success(new n.N_yield(startPos, expr));
        }
        else if (this.currentToken.matches(tt.KEYWORD, 'break')) {
            this.advance(res);
            return res.success(new n.N_break(startPos));
        }
        else if (this.currentToken.matches(tt.KEYWORD, 'continue')) {
            this.advance(res);
            return res.success(new n.N_continue(startPos));
        }
        const expr = res.register(this.expr());
        if (res.error)
            return res;
        return res.success(expr);
    }
    atom() {
        const res = new ParseResults();
        const tok = this.currentToken;
        const startPos = this.currentToken.startPos;
        switch (tok.type) {
            case tt.NUMBER:
                this.advance(res);
                return res.success(new n.N_number(startPos, tok));
            case tt.STRING:
                this.advance(res);
                return res.success(new n.N_string(startPos, tok));
            case tt.IDENTIFIER:
                return this.atomIdentifier(res, startPos, tok);
            case tt.OPAREN:
                this.advance(res);
                const expr = res.register(this.expr());
                if (res.error)
                    return res;
                if (this.currentToken.type == tt.CPAREN) {
                    this.advance(res);
                    return res.success(expr);
                }
                return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ')'"));
            case tt.OSQUARE:
                let arrayExpr = res.register(this.array());
                if (res.error)
                    return res;
                return res.success(arrayExpr);
            case tt.OBRACES:
                let objectExpr = res.register(this.object());
                if (res.error)
                    return res;
                return res.success(objectExpr);
            case tt.KEYWORD:
                if (tok.value === 'if') {
                    const expr = res.register(this.ifExpr());
                    if (res.error)
                        return res;
                    return res.success(expr);
                }
                return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Invalid Identifier ${tok.value}`));
            default:
                return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Expected number, identifier, '(', '+' or '-'`));
        }
    }
    atomIdentifier(res, startPos, tok) {
        this.advance(res);
        let node = new n.N_variable(tok);
        let prevNode = new n.N_undefined(startPos);
        let functionCall = false;
        while ([tt.OPAREN, tt.OSQUARE, tt.DOT].indexOf(this.currentToken.type) !== -1) {
            switch (this.currentToken.type) {
                case tt.OPAREN:
                    functionCall = true;
                    const tempNode = node;
                    node = res.register(this.makeFunctionCall(node, prevNode));
                    prevNode = tempNode;
                    if (res.error)
                        return res;
                    break;
                case tt.OSQUARE:
                    prevNode = node;
                    node = res.register(this.makeIndex(node));
                    if (res.error)
                        return res;
                    break;
                case tt.DOT:
                    this.advance(res);
                    // @ts-ignore
                    if (this.currentToken.type !== tt.IDENTIFIER)
                        return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Expected identifier after '.'`));
                    prevNode = node;
                    node = new n.N_indexed(this.currentToken.startPos, node, new n.N_string(this.currentToken.startPos, this.currentToken));
                    this.advance(res);
            }
        }
        if (this.currentToken.type === tt.ASSIGN) {
            let assignType = this.currentToken.value;
            if (functionCall) {
                // TODO: f(x) = x+1 syntax here
                return res.failure(new InvalidSyntaxError(startPos, `Cannot assign to return value of function`));
            }
            this.advance(res);
            const value = res.register(this.expr());
            if (node instanceof n.N_variable) {
                node = new n.N_varAssign(startPos, node.a, value, assignType, false);
            }
            else if (node instanceof n.N_indexed) {
                node.value = value;
                node.assignType = assignType;
            }
            else {
                return res.failure(new InvalidSyntaxError(startPos, `Cannot have node of type ${this.currentToken.constructor.name}. 
                            Expected either index or variable node.`));
            }
            if (res.error)
                return res;
        }
        return res.success(node);
    }
    power() {
        return this.binOp(() => this.atom(), [tokenType.POW], () => this.factor());
    }
    factor() {
        const res = new ParseResults();
        const tok = this.currentToken;
        switch (tok.type) {
            case tt.SUB:
            case tt.ADD:
                this.advance(res);
                const factor = res.register(this.factor());
                if (res.error)
                    return res;
                return res.success(new n.N_unaryOp(tok.startPos, factor, tok));
            default:
                return this.power();
        }
    }
    term() {
        return this.binOp(() => this.factor(), [tt.MUL, tt.DIV]);
    }
    arithmeticExpr() {
        return this.binOp(() => this.term(), [tt.ADD, tt.SUB]);
    }
    comparisonExpr() {
        const res = new ParseResults();
        if (this.currentToken.type === tt.NOT) {
            const opTok = this.currentToken;
            this.advance(res);
            let node = res.register(this.expr());
            if (res.error)
                return res;
            return res.success(new n.N_unaryOp(opTok.startPos, node, opTok));
        }
        let node = res.register(this.binOp(() => this.arithmeticExpr(), [tt.EQUALS, tt.NOTEQUALS, tt.GT, tt.GTE, tt.LTE, tt.LT]));
        if (res.error)
            return res;
        return res.success(node);
    }
    expr() {
        const res = new ParseResults();
        this.clearEndStatements(res);
        if (this.currentToken.type === tt.KEYWORD &&
            ['var', 'let', 'global', 'mutable', 'const', 'local'].indexOf(this.currentToken.value) !== -1) {
            return this.initiateVar(res);
        }
        else if (this.currentToken.matches(tokenType.KEYWORD, 'if')) {
            return this.ifExpr();
        }
        else if (this.currentToken.matches(tokenType.KEYWORD, 'while')) {
            return this.whileExpr();
        }
        else if (this.currentToken.matches(tokenType.KEYWORD, 'for')) {
            return this.forExpr();
        }
        else if (this.currentToken.matches(tokenType.KEYWORD, 'func')) {
            return this.funcExpr();
        }
        else if (this.currentToken.matches(tokenType.KEYWORD, 'class')) {
            return this.classExpr();
        }
        else if (this.currentToken.matches(tokenType.KEYWORD, 'namespace')) {
            return this.namespace();
        }
        let node = res.register(this.binOp(() => this.comparisonExpr(), [tt.AND, tt.OR]));
        if (res.error)
            return res;
        return res.success(node);
    }
    binOp(func, ops, funcB = func) {
        const res = new ParseResults();
        let left = res.register(func());
        if (res.error)
            return res;
        while (
        // @ts-ignore
        ops.indexOf(this.currentToken.type) !== -1
            // @ts-ignore
            || ops.indexOf([this.currentToken.type, this.currentToken.value]) !== -1) {
            const opTok = this.currentToken;
            this.advance(res);
            const right = res.register(funcB());
            if (res.error)
                return res;
            left = new n.N_binOp(left.startPos, left, opTok, right);
        }
        return res.success(left);
    }
    typeExpr() {
        const res = new ParseResults();
        if (this.currentToken.type !== tt.IDENTIFIER)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos.clone, `Expected an identifier`));
        let tok = this.currentToken;
        this.advance(res);
        return res.success(new N_variable(tok));
    }
    makeFunctionCall(to, this_ = new n.N_undefined()) {
        const res = new ParseResults();
        let args = [];
        const startPos = this.currentToken.startPos;
        if (this.currentToken.type !== tt.OPAREN)
            return res.failure(new InvalidSyntaxError(startPos, "Expected '['"));
        this.advance(res);
        // @ts-ignore
        if (this.currentToken.type === tt.CPAREN) {
            this.advance(res);
            return res.success(new n.N_functionCall(startPos, to, []));
        }
        args.push(res.register(this.expr()));
        if (res.error)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Invalid argument"));
        // @ts-ignore
        while (this.currentToken.type === tt.COMMA) {
            this.advance(res);
            args.push(res.register(this.expr()));
            if (res.error)
                return res;
        }
        // @ts-ignore
        if (this.currentToken.type !== tt.CPAREN)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ',' or ')'"));
        this.advance(res);
        return res.success(new n.N_functionCall(startPos, to, args));
    }
    makeIndex(to) {
        const res = new ParseResults();
        const startPos = this.currentToken.startPos;
        const base = to;
        if (this.currentToken.type !== tt.OSQUARE)
            return res.failure(new InvalidSyntaxError(startPos, "Expected '["));
        this.advance(res);
        // @ts-ignore
        if (this.currentToken.type === tt.CSQUARE) {
            return res.failure(new InvalidSyntaxError(startPos, `Cannot index without expression`));
        }
        let index = res.register(this.expr());
        if (res.error)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Invalid index"));
        // @ts-ignore
        if (this.currentToken.type !== tt.CSQUARE)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ']'"));
        this.advance(res);
        return res.success(new n.N_indexed(startPos, base, index));
    }
    initiateVar(res) {
        let startPos = this.currentToken.startPos;
        let isConst = false;
        let isLocal = false;
        let isGlobal = false;
        let isDeclaration = false;
        if (this.currentToken.type === tt.KEYWORD && ['var', 'let'].indexOf(this.currentToken.value) !== -1) {
            isDeclaration = true;
            isLocal = true;
            this.advance(res);
            if (res.error)
                return res;
        }
        if (this.currentToken.type === tt.KEYWORD && ['global', 'local'].indexOf(this.currentToken.value) !== -1) {
            isDeclaration = true;
            if (this.currentToken.value === 'global')
                isGlobal = true;
            else
                isLocal = true;
            this.advance(res);
            if (res.error)
                return res;
        }
        if (this.currentToken.type === tt.KEYWORD && ['const', 'mutable'].indexOf(this.currentToken.value) !== -1) {
            isDeclaration = true;
            if (this.currentToken.value === 'const')
                isConst = true;
            this.advance(res);
            if (res.error)
                return res;
        }
        if (this.currentToken.type === tt.KEYWORD) {
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Expected Identifier 'var', 'let', 'const', 'mutable', 'local', or 'global', not ${this.currentToken.value}`));
        }
        if (this.currentToken.type !== tokenType.IDENTIFIER) {
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Expected Identifier or Keyword`));
        }
        const varName = this.currentToken;
        this.advance(res);
        let type = types.any;
        // @ts-ignore
        if (this.currentToken.type === tt.COLON) {
            isDeclaration = true;
            this.consume(res, tt.COLON);
            type = res.register(this.typeExpr());
        }
        // @ts-ignore doesn't like two different comparisons after each other with different values
        if (this.currentToken.type !== tt.ASSIGN) {
            if (isConst)
                return res.failure(new InvalidSyntaxError(startPos, 'Cannot initialise constant to undefined'));
            return res.success(new n.N_varAssign(startPos, varName, new n.N_undefined(this.currentToken.startPos), '=', isGlobal, isLocal, 
            // must be false ^
            isConst, isDeclaration, type));
        }
        let assignType = this.currentToken.value;
        this.advance(res);
        const expr = res.register(this.expr());
        if (res.error)
            return res;
        if (expr instanceof n.N_class || expr instanceof n.N_functionDefinition)
            expr.name = varName.value;
        if (expr instanceof N_namespace) {
            expr.name = varName.value;
            expr.mutable = !isConst;
        }
        return res.success(new n.N_varAssign(startPos, varName, expr, assignType, isGlobal, isLocal, isConst, isDeclaration, type));
    }
    bracesExp() {
        const res = new ParseResults();
        if (this.currentToken.type !== tt.OBRACES) {
            const expr = res.register(this.statement());
            if (res.error)
                return res;
            this.clearEndStatements(res);
            return res.success(expr);
        }
        // clear brace
        this.advance(res);
        this.clearEndStatements(res);
        // @ts-ignore
        if (this.currentToken.type === tt.CBRACES) {
            this.advance(res);
            return res.success(new n.N_undefined(this.currentToken.startPos));
        }
        const expr = res.register(this.statements());
        if (res.error)
            return res;
        // @ts-ignore
        if (this.currentToken.type !== tt.CBRACES)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected '}'"));
        this.advance(res);
        return res.success(expr);
    }
    addEndStatement(res) {
        this.tokens.splice(this.tokenIdx, 0, new Token(this.currentToken.startPos, tt.ENDSTATEMENT));
        this.reverse();
        this.advance(res);
    }
    ifExpr() {
        const res = new ParseResults();
        let ifTrue;
        let ifFalse;
        let condition;
        const startPos = this.currentToken.startPos;
        if (!this.currentToken.matches(tt.KEYWORD, 'if'))
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected 'if'"));
        this.advance(res);
        if (this.currentToken.type !== tt.OPAREN)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected '(' after 'if'"));
        this.advance(res);
        condition = res.register(this.expr());
        if (res.error)
            return res;
        // @ts-ignore - comparison again
        if (this.currentToken.type !== tt.CPAREN)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ')' after 'if (condition'"));
        this.advance(res);
        ifTrue = res.register(this.bracesExp());
        if (res.error)
            return res;
        this.clearEndStatements(res);
        if (this.currentToken.matches(tt.KEYWORD, 'else')) {
            this.advance(res);
            ifFalse = res.register(this.bracesExp());
            if (res.error)
                return res;
        }
        this.addEndStatement(res);
        return res.success(new n.N_if(startPos, condition, ifTrue, ifFalse));
    }
    whileExpr() {
        const res = new ParseResults();
        let loop;
        let condition;
        const startPos = this.currentToken.startPos;
        if (!this.currentToken.matches(tt.KEYWORD, 'while'))
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected 'while'"));
        this.advance(res);
        if (this.currentToken.type !== tt.OPAREN)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected '(' after 'while'"));
        this.advance(res);
        condition = res.register(this.expr());
        if (res.error)
            return res;
        // @ts-ignore - comparison again
        if (this.currentToken.type !== tt.CPAREN)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ')' after 'while (condition'"));
        this.advance(res);
        loop = res.register(this.bracesExp());
        if (res.error)
            return res;
        this.addEndStatement(res);
        return res.success(new n.N_while(startPos, condition, loop));
    }
    /**
     * Gets the __name__ and __type__ of a parameter, for example `arg1: number`
     * @param {ParseResults} res
     * @private
     * @returns {[string, Node] | ESError}
     */
    parameter(res) {
        let name;
        let type = new n.N_any(types.any);
        if (this.currentToken.type !== tt.IDENTIFIER)
            return new InvalidSyntaxError(this.currentToken.startPos, "Expected identifier");
        name = this.currentToken.value;
        this.advance(res);
        // @ts-ignore
        if (this.currentToken.type === tt.COLON) {
            this.consume(res, tt.COLON);
            if (res.error)
                return res.error;
            type = res.register(this.typeExpr());
            if (res.error)
                return res.error;
        }
        return { name, type };
    }
    /**
     * () {} part of the function or method
     * @private
     */
    funcCore() {
        const res = new ParseResults();
        const startPos = this.currentToken.startPos;
        let body, args = [], returnType = new n.N_any(types.any);
        this.consume(res, tt.OPAREN);
        // @ts-ignore
        if (this.currentToken.type === tt.CPAREN) {
            this.advance(res);
        }
        else {
            let param = this.parameter(res);
            if (param instanceof ESError)
                return res.failure(param);
            args.push(param);
            // @ts-ignore
            while (this.currentToken.type === tt.COMMA) {
                this.advance(res);
                let param = this.parameter(res);
                if (param instanceof ESError)
                    return res.failure(param);
                args.push(param);
            }
            // @ts-ignore
            if (this.currentToken.type !== tt.CPAREN)
                return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ',' or ')'"));
            this.advance(res);
        }
        // @ts-ignore
        if (this.currentToken.type === tt.COLON) {
            this.advance(res);
            returnType = res.register(this.typeExpr());
            if (res.error)
                return res;
        }
        // @ts-ignore
        if (this.currentToken.type !== tt.OBRACES) {
            body = new n.N_return(this.currentToken.startPos, res.register(this.expr()));
            if (res.error)
                return res;
        }
        else {
            this.consume(res, tt.OBRACES);
            if (res.error)
                return res;
            if (this.currentToken.type !== tt.CBRACES)
                body = res.register(this.statements());
            else
                body = new n.N_undefined(this.currentToken.startPos);
            this.consume(res, tt.CBRACES);
            if (res.error)
                return res;
        }
        return res.success(new n.N_functionDefinition(startPos, body, args, returnType));
    }
    funcExpr() {
        const res = new ParseResults();
        if (!this.currentToken.matches(tt.KEYWORD, 'func'))
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected 'func'"));
        this.advance(res);
        const func = res.register(this.funcCore());
        if (res.error)
            return res;
        return res.success(func);
    }
    classExpr(name) {
        const res = new ParseResults();
        const startPos = this.currentToken.startPos;
        const methods = [];
        let init = undefined;
        let extends_;
        if (!this.currentToken.matches(tt.KEYWORD, 'class'))
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected 'class'"));
        this.advance(res);
        if (this.currentToken.matches(tt.KEYWORD, 'extends')) {
            this.advance(res);
            extends_ = res.register(this.expr());
            if (res.error)
                return res;
        }
        this.consume(res, tt.OBRACES);
        if (res.error)
            return res;
        if (this.currentToken.type === tt.CBRACES) {
            this.advance(res);
            return res.success(new n.N_class(startPos, [], undefined, undefined, name));
        }
        while (true) {
            if (this.currentToken.type !== tt.IDENTIFIER)
                break;
            let methodId = this.currentToken.value;
            this.advance(res);
            const func = res.register(this.funcCore());
            if (res.error)
                return res;
            if (!(func instanceof N_functionDefinition))
                return res.failure(new ESError(this.currentToken.startPos, 'ParseError', `Tried to get function, but got ${func} instead`));
            func.name = methodId;
            if (methodId === 'init')
                init = func;
            else
                methods.push(func);
        }
        this.consume(res, tt.CBRACES);
        return res.success(new n.N_class(startPos, methods, extends_, init, name));
    }
    forExpr() {
        const res = new ParseResults();
        const startPos = this.currentToken.startPos;
        let body, array, identifier, isGlobalIdentifier = false, isConstIdentifier = false;
        if (!this.currentToken.matches(tt.KEYWORD, 'for'))
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected 'for'"));
        this.advance(res);
        this.consume(res, tt.OPAREN);
        if (this.currentToken.matches(tt.KEYWORD, 'global')) {
            isGlobalIdentifier = true;
            this.advance(res);
        }
        else if (this.currentToken.matches(tt.KEYWORD, 'const')) {
            isConstIdentifier = true;
            this.advance(res);
        }
        else if (this.currentToken.matches(tt.KEYWORD, 'var') || this.currentToken.matches(tt.KEYWORD, 'let')) {
            this.advance(res);
        }
        // @ts-ignore - comparison again
        if (this.currentToken.type !== tt.IDENTIFIER)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected identifier"));
        identifier = this.currentToken;
        this.advance(res);
        if (!this.currentToken.matches(tt.KEYWORD, 'in'))
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected keyword 'in"));
        this.advance(res);
        array = res.register(this.expr());
        if (res.error)
            return res;
        // @ts-ignore - comparison again
        if (this.currentToken.type !== tt.CPAREN)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ')'"));
        this.advance(res);
        body = res.register(this.bracesExp());
        if (res.error)
            return res;
        this.addEndStatement(res);
        return res.success(new n.N_for(startPos, body, array, identifier, isGlobalIdentifier, isConstIdentifier));
    }
    array() {
        const res = new ParseResults();
        let elements = [];
        const startPos = this.currentToken.startPos;
        if (this.currentToken.type !== tt.OSQUARE)
            return res.failure(new InvalidSyntaxError(startPos, "Expected '["));
        this.advance(res);
        // @ts-ignore
        if (this.currentToken.type === tt.CSQUARE) {
            this.advance(res);
            return res.success(new n.N_array(startPos, []));
        }
        elements.push(res.register(this.expr()));
        if (res.error)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ']', 'var', 'if', 'for', 'while', number, identifier, '+', '-', '(', '[' or '!' 2"));
        // @ts-ignore
        while (this.currentToken.type === tt.COMMA) {
            this.advance(res);
            elements.push(res.register(this.expr()));
            if (res.error)
                return res;
        }
        // @ts-ignore
        if (this.currentToken.type !== tt.CSQUARE)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected ',' or ']'"));
        this.advance(res);
        return res.success(new n.N_array(startPos, elements));
    }
    object() {
        const res = new ParseResults();
        let properties = [];
        const startPos = this.currentToken.startPos;
        if (this.currentToken.type !== tt.OBRACES)
            return res.failure(new InvalidSyntaxError(startPos, "Expected '{"));
        this.advance(res);
        // @ts-ignore
        if (this.currentToken.type === tt.CBRACES) {
            this.advance(res);
            return res.success(new n.N_emptyObject(startPos));
        }
        // @ts-ignore
        while (true) {
            let keyType, key, value;
            // @ts-ignore
            if (this.currentToken.type === tt.IDENTIFIER) {
                keyType = 'id';
                key = new n.N_string(this.currentToken.startPos, this.currentToken);
                this.advance(res);
                // @ts-ignore
            }
            else if (this.currentToken.type === tt.STRING) {
                keyType = 'string';
                key = new n.N_string(this.currentToken.startPos, this.currentToken);
                this.advance(res);
                // @ts-ignore
            }
            else if (this.currentToken.type === tt.OSQUARE) {
                keyType = 'value';
                this.advance(res);
                key = res.register(this.expr());
                if (res.error)
                    return res;
                if (this.currentToken.type !== tt.CSQUARE)
                    return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Expected ']', got '${tokenTypeString[this.currentToken.type]}'`));
                this.advance(res);
            }
            else
                break;
            if (this.currentToken.type === tt.COLON) {
                this.advance(res);
                value = res.register(this.expr());
                if (res.error)
                    return res;
                if (this.currentToken.type !== tt.COMMA && this.currentToken.type !== tt.CBRACES)
                    return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Expected ',' or '}', got '${tokenTypeString[this.currentToken.type]}'`));
                if (this.currentToken.type === tt.COMMA)
                    this.advance(res);
            }
            else {
                if (this.currentToken.type !== tt.COMMA && this.currentToken.type !== tt.CBRACES)
                    return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `Expected ',' or '}', got '${tokenTypeString[this.currentToken.type]}'`));
                if (keyType !== 'id')
                    return res.failure(new InvalidSyntaxError(this.currentToken.startPos, `You must specify a value when initialising an object literal with a key that is not an identifier.
                        Try using \`key: value\` syntax.`));
                // reverse back to the identifier
                this.reverse();
                value = new n.N_variable(this.currentToken);
                this.advance(res);
                if (this.currentToken.type === tt.COMMA)
                    this.advance(res);
            }
            properties.push([key, value]);
            if (res.error)
                return res;
        }
        // @ts-ignore
        if (this.currentToken.type !== tt.CBRACES)
            return res.failure(new InvalidSyntaxError(this.currentToken.startPos, "Expected identifier, ',' or '}'"));
        this.advance(res);
        return res.success(new n.N_objectLiteral(startPos, properties));
    }
    namespace() {
        const res = new ParseResults();
        const startPos = this.currentToken.startPos;
        this.consume(res, tt.KEYWORD);
        if (res.error)
            return res;
        this.consume(res, tt.OBRACES);
        if (res.error)
            return res;
        if (this.currentToken.type === tt.CBRACES) {
            this.advance(res);
            return res.success(new n.N_namespace(startPos, new n.N_undefined()));
        }
        const statements = res.register(this.statements());
        if (res.error)
            return res;
        this.consume(res, tt.CBRACES);
        if (res.error)
            return res;
        return res.success(new n.N_namespace(startPos, statements));
    }
}