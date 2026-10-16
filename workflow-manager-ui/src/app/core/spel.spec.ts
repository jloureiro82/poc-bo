import { checkSpelExpression, checkSpelTemplate, findSpelProblems } from './spel';

describe('checkSpelTemplate', () => {
  // Real expressions from the stored workflows / Postman collection, plus common SpEL forms.
  const valid = [
    '${true == true }',
    "${workflow['requestContext']['failTask2'] != true}",
    "${workflow.crc == null ? 'Missing Parameter [crc]' : 'Missing parameter [externalId]'}",
    '${statusCode == 200 && !rawBody.isEmpty()}',
    "{{3ws-api-endpoint}}/user/username?un=${workflow.email}",
    "${'2'.equals(execution.getUser.outputParameters.body.user_status.user_status_id)}",
    '${T(com.multicert.workflowmanager.common.Converters).writeValueAsMap(output.rawBody)}',
    "Bearer ${T(io.jsonwebtoken.Jwts).builder().expiration(T(java.util.Date).from(T(java.time.Instant).now().plus(60, T(java.time.temporal.ChronoUnit).SECONDS))).signWith(T(io.jsonwebtoken.SignatureAlgorithm).HS512, T(java.util.Base64).getDecoder().decode(environmentProperty('APP_TOKENMANAGER_BASE64_SECRET'))).compact()}",
    '${a} and ${b}',
    "${{'a': 1, 'b': {1, 2}}}",
    '${{}}',
    '${{:}}',
    '${list.?[age > 18].![name]}',
    '${list?.^[x == 1]}',
    '${#root.items[0]?.name ?: "none"}',
    "${'it''s'}",
    '${new java.util.ArrayList()}',
    '${new int[]{1, 2, 3}}',
    '${x matches "[a-z]+" and y between {1, 5}}',
    '${a instanceof T(String)}',
    '${-1.5e3 + 0x1F % 2 ^ 2}',
    '${x eq 1 or not (y ne 2)}',
    '${@myBean.run()}',
    '${#fn(1, 2)}',
    '${a = 5}',
    '${counter++}',
    '${1.toString()}',
  ];

  for (const text of valid) {
    it(`accepts ${text.slice(0, 60)}`, () => {
      expect(checkSpelTemplate(text)).toEqual([]);
    });
  }

  const invalid: [string, string][] = [
    ['${a == }', 'ends too early'],
    ['${a b}', "Unexpected 'b'"],
    ['${foo(1, }', "'(' is never closed"],
    ['${foo(1, )}', "Unexpected ')'"],
    ['${foo(1 2)}', "missing ')' or ','"],
    ["${'abc}", 'Unterminated string'],
    ['${a.}', 'Expected a property or method name'],
    ['${(a + b}', "'(' is never closed"],
    ['${a + b)}', "Unexpected ')'"],
    ['${x ? 1}', "ternary '?' needs ':'"],
    ['${T(java.util.Date}', "'(' is never closed"],
    ['${}', 'Empty ${} expression'],
    ['${a', 'missing the closing }'],
    ['${a ~ b}', "Unexpected character '~'"],
    ['${list[]}', 'Empty indexer'],
    ["${{'a': 1, 'b'}}", "every entry needs 'key: value'"],
    ['${new java.util.Date}', "Expected '(' or '['"],
  ];

  for (const [text, message] of invalid) {
    it(`rejects ${text}`, () => {
      const problems = checkSpelTemplate(text);
      expect(problems.length).toBe(1);
      expect(problems[0].message).toContain(message);
    });
  }

  it('reports the offset within the whole string', () => {
    const [p] = checkSpelTemplate('prefix ${a == }');
    expect(p.offset).toBe(14);
  });

  it('checks each expression of a template separately', () => {
    expect(checkSpelTemplate('${a ==} / ${b +}')).toHaveLength(2);
  });

  it('parses bare expressions', () => {
    expect(checkSpelExpression('a.b(c)[0]')).toBeNull();
    expect(checkSpelExpression('a..b')?.message).toContain('Expected a property or method name');
  });
});

describe('findSpelProblems', () => {
  it('walks nested values, ignores plain text and skips the given keys', () => {
    const findings = findSpelProblems(
      {
        label: 'not ${an expression',
        inputParameters: { url: 'https://x/${id', headers: { a: '${ok}' }, list: ['${1 +}'] },
        tasks: [{ expression: '${broken' }],
        plain: 'no expression here',
      },
      ['tasks'],
    );
    expect(findings.map(f => f.field)).toEqual(['label', 'inputParameters.url', 'inputParameters.list[0]']);
    expect(findings[0].message).toContain('near "not ${an expression"');
  });
});
