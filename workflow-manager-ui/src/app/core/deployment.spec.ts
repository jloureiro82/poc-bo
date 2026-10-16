import { otherApps, parseDeployment, serviceUrl } from './deployment';

describe('parseDeployment', () => {
  it('accepts a managed deployment and keeps the valid app links', () => {
    const config = parseDeployment({
      managed: true,
      backend: 'http://svc:8081/ctx',
      apps: [{ name: 'Workflows', url: '/workflows/' }, { name: '', url: '/x/' }, { name: 'No url' }, 'junk', null],
    });
    expect(config).toEqual({ managed: true, backend: 'http://svc:8081/ctx', apps: [{ name: 'Workflows', url: '/workflows/' }] });
  });

  it('defaults the backend and the apps', () => {
    expect(parseDeployment({ managed: true })).toEqual({ managed: true, backend: '', apps: [] });
  });

  it('ignores anything that is not a managed deployment', () => {
    for (const value of [null, undefined, 'x', [], {}, { managed: 'true' }, { managed: false }]) {
      expect(parseDeployment(value)).toBeNull();
    }
  });
});

describe('otherApps', () => {
  const apps = [
    { name: 'Workflows', url: '/workflows/' },
    { name: 'Flows', url: '/flows' },
    { name: 'Elsewhere', url: 'https://other.example/workflows/' },
  ];

  it('leaves out the app served at the page base, with or without a trailing slash', () => {
    expect(otherApps(apps, 'https://portal.example/workflows/').map(a => a.name)).toEqual(['Flows', 'Elsewhere']);
    expect(otherApps(apps, 'https://portal.example/flows/').map(a => a.name)).toEqual(['Workflows', 'Elsewhere']);
  });

  it('keeps every app when this one is served on its own', () => {
    expect(otherApps(apps, 'http://localhost:8080/')).toHaveLength(3);
  });
});

describe('serviceUrl', () => {
  it('is relative to the page base without a base URL', () => {
    expect(serviceUrl('', '/api/v1/x')).toBe('api/v1/x');
  });

  it('prefixes a base URL', () => {
    expect(serviceUrl('http://svc:8081/ctx', '/api/v1/x')).toBe('http://svc:8081/ctx/api/v1/x');
  });
});
