import { StoreMiddleware } from './store.middleware';

describe('StoreMiddleware', () => {
  it('should be defined', () => {
    expect(new StoreMiddleware()).toBeDefined();
  });
});
