import { Position } from "../position.js";
import { digits, doubleCharTokens, identifierChars, KEYWORDS, multiLineCommentEnd, multiLineCommentStart, singleCharTokens, singleLineComment, stringSurrounds, tripleCharTokens, tt, } from '../constants.js';
import { IllegalCharError } from "../errors.js";
import { Token } from "../parse/tokens.js";
export class Lexer {
    constructor(program, fileName) {
        this.text = program;
        this.position = new Position(-1, 0, -1, fileName);
        this.advance();
    }
    advance() {
        this.position.advance(this.currentChar);
        this.currentChar = this.text[this.position.idx];
    }
    generate() {
        if (!this.text)
            return [[new Token(this.position, tt.EOF)], undefined];
        const tokens = [];
        while (this.currentChar !== undefined) {
            if (' \t\n'.includes(this.currentChar)) {
                this.advance();
            }
            else if (digits.includes(this.currentChar)) {
                tokens.push(this.makeNumber());
            }
            else if (this.currentChar === singleLineComment[0] &&
                this.text[this.position.idx + 1] === singleLineComment[1]) {
                this.singleLineComment();
            }
            else if (this.currentChar === multiLineCommentStart[0] &&
                this.text[this.position.idx + 1] === multiLineCommentStart[1]) {
                this.multiLineComment();
            }
            else if (identifierChars.includes(this.currentChar)) {
                tokens.push(this.makeIdentifier());
            }
            else if (stringSurrounds.indexOf(this.currentChar) !== -1) {
                tokens.push(this.makeString());
            }
            else {
                const possibleAssignFirstChar = this.currentChar;
                let token = this.unknownChar();
                if (token) {
                    if (token.type === tt.ASSIGN) {
                        token.value = possibleAssignFirstChar;
                    }
                    tokens.push(token);
                }
                else {
                    let pos = this.position.clone;
                    let char = this.currentChar;
                    this.advance();
                    return [[], new IllegalCharError(pos, char)];
                }
            }
        }
        tokens.push(new Token(this.position, tt.EOF));
        return [tokens, undefined];
    }
    makeNumber() {
        const pos = this.position.clone;
        let numStr = '';
        let dotCount = 0;
        while (this.currentChar !== undefined && (digits + '._').includes(this.currentChar)) {
            if (this.currentChar === '.') {
                if (dotCount === 1) {
                    break;
                }
                dotCount++;
                numStr += '.';
            }
            else if (this.currentChar !== '_') {
                numStr += this.currentChar;
            }
            this.advance();
        }
        return new Token(pos, tt.NUMBER, parseFloat(numStr));
    }
    makeString() {
        const pos = this.position.clone;
        let str = '';
        let strClose = this.currentChar;
        this.advance();
        while (this.currentChar !== strClose && this.currentChar !== undefined) {
            if (this.currentChar === '\\') {
                this.advance();
                if (this.currentChar === 'n') {
                    str += '\n';
                    this.advance();
                    continue;
                }
            }
            str += this.currentChar;
            this.advance();
        }
        this.advance();
        return new Token(pos, tt.STRING, str);
    }
    makeIdentifier() {
        let idStr = '';
        const posStart = this.position.clone;
        while (this.currentChar !== undefined && (identifierChars + digits).includes(this.currentChar)) {
            idStr += this.currentChar;
            this.advance();
        }
        let tokType = tt.IDENTIFIER;
        if (KEYWORDS.indexOf(idStr) !== -1) {
            tokType = tt.KEYWORD;
        }
        return new Token(posStart, tokType, idStr);
    }
    unknownChar() {
        if (this.currentChar === undefined) {
            return undefined;
        }
        for (let triple in tripleCharTokens) {
            if (triple[0] === this.currentChar)
                if (triple[1] === this.text[this.position.idx + 1])
                    if (triple[2] === this.text[this.position.idx + 2]) {
                        const pos = this.position.clone;
                        this.advance();
                        this.advance();
                        this.advance();
                        return new Token(pos, tripleCharTokens[triple]);
                    }
        }
        for (let double in doubleCharTokens) {
            if (double[0] === this.currentChar)
                if (double[1] === this.text[this.position.idx + 1]) {
                    const pos = this.position.clone;
                    this.advance();
                    this.advance();
                    return new Token(pos, doubleCharTokens[double]);
                }
        }
        if (singleCharTokens.hasOwnProperty(this.currentChar)) {
            let pos = this.position.clone;
            let val = singleCharTokens[this.currentChar];
            this.advance();
            return new Token(pos, val);
        }
        return undefined;
    }
    singleLineComment() {
        this.advance();
        while (this.currentChar !== '\n' && this.currentChar !== undefined) {
            this.advance();
        }
        this.advance();
    }
    multiLineComment() {
        this.advance();
        while (!(this.currentChar === multiLineCommentEnd[0] &&
            this.text[this.position.idx + 1] === multiLineCommentEnd[1])) {
            this.advance();
        }
        this.advance();
        this.advance();
    }
}
