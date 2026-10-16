/**
 * Syntax check for the SpEL templates the service evaluates.
 *
 * The service's `commons-spel-engine` uses Spring's `SpelExpressionParser` with `TemplateParserContext("${", "}")`:
 * text outside `${...}` is literal, and each `${...}` body is a SpEL expression whose end is found by bracket matching
 * (string literals skipped). This module mirrors that: it finds every `${...}` and runs a recursive-descent parser
 * following Spring's SpEL grammar (`InternalSpelExpressionParser`). It only checks syntax: unknown properties,
 * methods or types are not errors here.
 */

export interface SpelProblem {
  message: string;
  /** Offset in the whole string. */
  offset: number;
}

/** Checks every `${...}` in a template string. Returns the first problem of each expression. */
export function checkSpelTemplate(text: string): SpelProblem[] {
  const problems: SpelProblem[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('${', i);
    if (start < 0) {
      break;
    }
    const bodyStart = start + 2;
    const end = findTemplateEnd(text, bodyStart);
    if (end.error) {
      problems.push({ message: end.error, offset: end.offset });
      break;
    }
    const body = text.slice(bodyStart, end.offset);
    if (!body.trim()) {
      problems.push({ message: 'Empty ${} expression', offset: start });
    } else {
      const problem = checkSpelExpression(body);
      if (problem) {
        problems.push({ message: problem.message, offset: bodyStart + problem.offset });
      }
    }
    i = end.offset + 1;
  }
  return problems;
}

/** Like Spring's `skipToCorrectEndSuffix`: matches (), [], {} and skips '...' / "..." literals. */
function findTemplateEnd(text: string, from: number): { offset: number; error?: string } {
  const stack: { ch: string; at: number }[] = [];
  const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '}' && stack.length === 0) {
      return { offset: i };
    }
    if (ch === "'" || ch === '"') {
      const close = text.indexOf(ch, i + 1);
      if (close < 0) {
        return { offset: i, error: `Unterminated string literal ${ch}…` };
      }
      i = close + 1;
      continue;
    }
    if (ch in closing) {
      stack.push({ ch, at: i });
    } else if (ch === ')' || ch === ']' || ch === '}') {
      const open = stack.pop();
      if (!open) {
        return { offset: i, error: `Unexpected '${ch}'` };
      }
      if (closing[open.ch] !== ch) {
        return { offset: open.at, error: `'${open.ch}' is never closed (found '${ch}' first)` };
      }
    }
    i++;
  }
  const open = stack.pop();
  return open
    ? { offset: open.at, error: `'${open.ch}' is never closed` }
    : { offset: from - 2, error: 'Unclosed ${ — missing the closing }' };
}

// ---- Tokenizer ------------------------------------------------------------------------------------------------

type Kind = 'num' | 'str' | 'id' | 'op' | 'eof';

interface Token {
  kind: Kind;
  text: string;
  at: number;
}

class SpelSyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

const OPERATORS = [
  '?.', '?:', '==', '!=', '<=', '>=', '&&', '||', '++', '--',
  '+', '-', '*', '/', '%', '^', '<', '>', '!', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.', '?', '#', '@', '&', '$',
];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= src.length) {
          throw new SpelSyntaxError('Unterminated string literal', i);
        }
        if (src[j] === ch) {
          if (src[j + 1] === ch) {
            j += 2; // doubled quote is an escaped quote
            continue;
          }
          break;
        }
        j++;
      }
      tokens.push({ kind: 'str', text: src.slice(i, j + 1), at: i });
      i = j + 1;
      continue;
    }
    const num = /^(0[xX][0-9a-fA-F]+[lL]?|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[lLdDfF]?)/.exec(src.slice(i));
    if (num && (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? '') && !isValueEnd(tokens)))) {
      // "1." followed by an identifier is a method call on 1, not a decimal ("1.toString()" is rare but legal)
      let text = num[0];
      if (text.endsWith('.') && /[A-Za-z_]/.test(src[i + text.length] ?? '')) {
        text = text.slice(0, -1);
      }
      tokens.push({ kind: 'num', text, at: i });
      i += text.length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch) && !(ch === '$' && src[i + 1] === '[')) {
      const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))![0];
      tokens.push({ kind: 'id', text: id, at: i });
      i += id.length;
      continue;
    }
    const op = OPERATORS.find(o => src.startsWith(o, i) && !(o === '?.' && /\d/.test(src[i + 2] ?? '')));
    if (!op) {
      throw new SpelSyntaxError(`Unexpected character '${ch}'`, i);
    }
    tokens.push({ kind: 'op', text: op, at: i });
    i += op.length;
  }
  tokens.push({ kind: 'eof', text: '', at: src.length });
  return tokens;
}

function isValueEnd(tokens: Token[]): boolean {
  const last = tokens[tokens.length - 1];
  return !!last && (last.kind === 'id' || last.kind === 'num' || last.kind === 'str' || [')', ']', '}'].includes(last.text));
}

// ---- Parser (structure follows Spring's InternalSpelExpressionParser) ----------------------------------------

const RELATIONAL_WORDS = new Set(['eq', 'ne', 'lt', 'gt', 'le', 'ge', 'instanceof', 'matches', 'between']);
const RELATIONAL_OPS = new Set(['==', '!=', '<', '>', '<=', '>=']);

/** Parses one expression body (the text inside `${...}`). Returns null when it is syntactically valid. */
export function checkSpelExpression(src: string): SpelProblem | null {
  try {
    new Parser(tokenize(src)).parseAll();
    return null;
  } catch (e) {
    if (e instanceof SpelSyntaxError) {
      return { message: e.message, offset: e.offset };
    }
    throw e;
  }
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parseAll(): void {
    this.expression();
    const t = this.peek();
    if (t.kind !== 'eof') {
      throw new SpelSyntaxError(`Unexpected '${t.text}': missing an operator before it?`, t.at);
    }
  }

  // expression : logicalOr ( '=' expression | '?:' expression | '?' expression ':' expression )?
  private expression(): void {
    this.logicalOr();
    if (this.acceptOp('=')) {
      this.expression();
    } else if (this.acceptOp('?:')) {
      this.expression();
    } else if (this.acceptOp('?')) {
      this.expression();
      this.expectOp(':', "ternary '?' needs ':'");
      this.expression();
    }
  }

  private logicalOr(): void {
    this.logicalAnd();
    while (this.acceptOp('||') || this.acceptWord('or')) {
      this.logicalAnd();
    }
  }

  private logicalAnd(): void {
    this.relational();
    while (this.acceptOp('&&') || this.acceptWord('and')) {
      this.relational();
    }
  }

  private relational(): void {
    this.sum();
    const t = this.peek();
    if ((t.kind === 'op' && RELATIONAL_OPS.has(t.text)) || (t.kind === 'id' && RELATIONAL_WORDS.has(t.text.toLowerCase()))) {
      this.pos++;
      this.sum();
    }
  }

  private sum(): void {
    this.product();
    while (this.acceptOp('+') || this.acceptOp('-')) {
      this.product();
    }
  }

  private product(): void {
    this.power();
    while (this.acceptOp('*') || this.acceptOp('/') || this.acceptOp('%') || this.acceptWord('div') || this.acceptWord('mod')) {
      this.power();
    }
  }

  private power(): void {
    this.unary();
    if (this.acceptOp('^')) {
      this.unary();
    }
    while (this.acceptOp('++') || this.acceptOp('--')) {
      // postfix increment/decrement
    }
  }

  private unary(): void {
    if (this.acceptOp('+') || this.acceptOp('-') || this.acceptOp('!') || this.acceptOp('++') || this.acceptOp('--') || this.acceptWord('not')) {
      this.unary();
      return;
    }
    this.primary();
  }

  private primary(): void {
    this.startNode();
    for (;;) {
      if (this.acceptOp('.') || this.acceptOp('?.')) {
        this.navigation();
      } else if (this.peekOp('[')) {
        this.indexer();
      } else {
        return;
      }
    }
  }

  /** After '.' or '?.': property, method call, or selection/projection. */
  private navigation(): void {
    const t = this.peek();
    if (t.kind === 'op' && ['?', '!', '^', '$'].includes(t.text) && this.peek(1).text === '[') {
      this.pos += 2;
      this.expression();
      this.expectOp(']', `'${t.text}[' is never closed`);
      return;
    }
    if (t.kind !== 'id') {
      throw new SpelSyntaxError(`Expected a property or method name after '.', found ${describe(t)}`, t.at);
    }
    this.pos++;
    if (this.peekOp('(')) {
      this.args();
    }
  }

  private indexer(): void {
    const open = this.expectOp('[');
    if (this.peekOp(']')) {
      throw new SpelSyntaxError('Empty indexer []', open.at);
    }
    this.expression();
    this.expectOp(']', "'[' is never closed");
  }

  private startNode(): void {
    const t = this.peek();
    if (t.kind === 'num' || t.kind === 'str') {
      this.pos++;
      return;
    }
    if (t.kind === 'op') {
      switch (t.text) {
        case '(': {
          this.pos++;
          this.expression();
          this.expectOp(')', "'(' is never closed");
          return;
        }
        case '{':
          return this.inlineCollection();
        case '[':
          return this.indexer();
        case '#': {
          this.pos++;
          const name = this.peek();
          if (name.kind !== 'id') {
            throw new SpelSyntaxError(`Expected a variable or function name after '#', found ${describe(name)}`, name.at);
          }
          this.pos++;
          if (this.peekOp('(')) {
            this.args();
          }
          return;
        }
        case '@':
        case '&': {
          this.pos++;
          const name = this.peek();
          if (name.kind !== 'id' && name.kind !== 'str') {
            throw new SpelSyntaxError(`Expected a bean name after '${t.text}'`, name.at);
          }
          this.pos++;
          return;
        }
        case '?':
        case '!':
        case '^':
        case '$':
          if (this.peek(1).text === '[') {
            // selection/projection on the root object
            this.pos += 2;
            this.expression();
            this.expectOp(']', `'${t.text}[' is never closed`);
            return;
          }
      }
      throw new SpelSyntaxError(t.text === ')' || t.text === ']' || t.text === '}' ? `Unexpected '${t.text}'` : `Expected a value, found '${t.text}'`, t.at);
    }
    if (t.kind === 'id') {
      this.pos++;
      if (t.text === 'T' && this.peekOp('(')) {
        return this.typeReference();
      }
      if (t.text === 'new' && this.peek().kind === 'id') {
        return this.constructorCall();
      }
      if (this.peekOp('(')) {
        this.args();
      }
      return;
    }
    throw new SpelSyntaxError(t.kind === 'eof' ? 'The expression ends too early: a value is missing' : `Unexpected ${describe(t)}`, t.at);
  }

  private typeReference(): void {
    this.expectOp('(');
    this.qualifiedName('a type name in T(...)');
    while (this.acceptOp('[')) {
      this.expectOp(']', "array type: '[' is never closed");
    }
    this.expectOp(')', "'T(' is never closed");
  }

  private constructorCall(): void {
    this.qualifiedName('a class name after new');
    if (this.peekOp('(')) {
      this.args();
      return;
    }
    let dims = 0;
    while (this.acceptOp('[')) {
      if (!this.peekOp(']')) {
        this.expression();
      }
      this.expectOp(']', "'[' is never closed");
      dims++;
    }
    if (dims === 0) {
      const t = this.peek();
      throw new SpelSyntaxError(`Expected '(' or '[' after the class name, found ${describe(t)}`, t.at);
    }
    if (this.peekOp('{')) {
      this.inlineCollection();
    }
  }

  private qualifiedName(what: string): void {
    const first = this.peek();
    if (first.kind !== 'id') {
      throw new SpelSyntaxError(`Expected ${what}, found ${describe(first)}`, first.at);
    }
    this.pos++;
    while (this.acceptOp('.')) {
      const part = this.peek();
      if (part.kind !== 'id') {
        throw new SpelSyntaxError(`Expected a name after '.', found ${describe(part)}`, part.at);
      }
      this.pos++;
    }
  }

  private args(): void {
    this.expectOp('(');
    if (this.acceptOp(')')) {
      return;
    }
    do {
      this.expression();
    } while (this.acceptOp(','));
    this.expectOp(')', "missing ')' or ',' in the argument list");
  }

  /** `{}`, `{:}`, `{a, b}` or `{k: v, k2: v2}`. */
  private inlineCollection(): void {
    this.expectOp('{');
    if (this.acceptOp('}')) {
      return;
    }
    if (this.acceptOp(':')) {
      this.expectOp('}', "empty map '{:}' must close right away");
      return;
    }
    this.expression();
    if (this.acceptOp(':')) {
      this.expression();
      while (this.acceptOp(',')) {
        this.expression();
        this.expectOp(':', "inline map: every entry needs 'key: value'");
        this.expression();
      }
    } else {
      while (this.acceptOp(',')) {
        this.expression();
      }
    }
    this.expectOp('}', "'{' is never closed");
  }

  // ---- token helpers ----

  private peek(ahead = 0): Token {
    return this.tokens[Math.min(this.pos + ahead, this.tokens.length - 1)];
  }

  private peekOp(text: string): boolean {
    const t = this.peek();
    return t.kind === 'op' && t.text === text;
  }

  private acceptOp(text: string): boolean {
    if (this.peekOp(text)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private acceptWord(word: string): boolean {
    const t = this.peek();
    if (t.kind === 'id' && t.text.toLowerCase() === word) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expectOp(text: string, message?: string): Token {
    const t = this.peek();
    if (t.kind === 'op' && t.text === text) {
      this.pos++;
      return t;
    }
    throw new SpelSyntaxError(message ? `${message} (found ${describe(t)})` : `Expected '${text}', found ${describe(t)}`, t.at);
  }
}

function describe(t: Token): string {
  return t.kind === 'eof' ? 'the end of the expression' : `'${t.text}'`;
}

/** One SpEL problem found inside a JSON value, with the relative path of the string it is in. */
export interface SpelFinding {
  field: string;
  message: string;
}

/**
 * Walks a JSON value and syntax-checks every string containing `${`. `skip` lists top-level keys not to descend into
 * (e.g. nested task lists, which are validated on their own).
 */
export function findSpelProblems(value: unknown, skip: string[] = [], base = ''): SpelFinding[] {
  const out: SpelFinding[] = [];
  const walk = (node: unknown, path: string, depth: number) => {
    if (typeof node === 'string') {
      if (node.includes('${')) {
        for (const p of checkSpelTemplate(node)) {
          out.push({ field: path, message: `SpEL syntax: ${p.message} — near "${excerpt(node, p.offset)}"` });
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (depth === 0 && skip.includes(k)) {
          continue;
        }
        walk(v, path ? `${path}.${k}` : k, depth + 1);
      }
    }
  };
  walk(value, base, 0);
  return out;
}

function excerpt(text: string, offset: number): string {
  const from = Math.max(0, offset - 12);
  const to = Math.min(text.length, offset + 18);
  return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
}
