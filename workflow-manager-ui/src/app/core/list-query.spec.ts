import { fromListParams, lastListParams, rememberListParams, toListParams } from './list-query';

const STATUSES = ['COMPLETED', 'FAILED', 'ON_HOLD'];

describe('executions list query', () => {
  it('leaves defaults out of the URL', () => {
    expect(toListParams({ page: 0, statuses: [], name: ' ', id: '' })).toEqual({ page: null, status: null, name: null, id: null });
  });

  it('shows the page one-based and round-trips every field', () => {
    const q = { page: 2, statuses: ['FAILED', 'ON_HOLD'], name: 'createCustomer', id: 'abc' };
    const params = toListParams(q);
    expect(params).toEqual({ page: 3, status: 'FAILED,ON_HOLD', name: 'createCustomer', id: 'abc' });
    expect(fromListParams({ ...params, page: String(params['page']) }, STATUSES)).toEqual(q);
  });

  it('ignores bad pages, unknown or repeated statuses and non-text values', () => {
    expect(fromListParams({ page: 'x', status: 'FAILED,NOPE,FAILED', name: ['a', 'b'] }, STATUSES)).toEqual({
      page: 0,
      statuses: ['FAILED'],
      name: '',
      id: '',
    });
    expect(fromListParams({ page: '-4' }, STATUSES).page).toBe(0);
    expect(fromListParams({}, STATUSES)).toEqual({ page: 0, statuses: [], name: '', id: '' });
  });

  it('remembers the last list state for the back link', () => {
    rememberListParams({ page: 4, status: null, name: 'x', id: null });
    expect(lastListParams()).toEqual({ page: 4, status: null, name: 'x', id: null });
  });
});
