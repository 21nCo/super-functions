import { describe, it, expect } from 'vitest';
import { compilePattern, matchPath, normalizePath, joinPaths } from '../path-matcher.js';

describe('compilePattern', () => {
  it('should compile simple pattern', () => {
    const compiled = compilePattern('/users');
    expect(compiled.keys).toEqual([]);
    expect('/users').toMatch(compiled.pattern);
    expect('/posts').not.toMatch(compiled.pattern);
  });

  it('should compile pattern with single param', () => {
    const compiled = compilePattern('/users/:id');
    expect(compiled.keys).toEqual(['id']);
    expect('/users/123').toMatch(compiled.pattern);
    expect('/users').not.toMatch(compiled.pattern);
  });

  it('should compile pattern with multiple params', () => {
    const compiled = compilePattern('/posts/:postId/comments/:commentId');
    expect(compiled.keys).toEqual(['postId', 'commentId']);
    expect('/posts/123/comments/456').toMatch(compiled.pattern);
  });
});

describe('matchPath', () => {
  it('should match path without params', () => {
    const compiled = compilePattern('/users');
    const match = matchPath(compiled, '/users');
    expect(match.matched).toBe(true);
    expect(match.params).toEqual({});
  });

  it('should extract single param', () => {
    const compiled = compilePattern('/users/:id');
    const match = matchPath(compiled, '/users/123');
    expect(match.matched).toBe(true);
    expect(match.params).toEqual({ id: '123' });
  });

  it('should extract multiple params', () => {
    const compiled = compilePattern('/posts/:postId/comments/:commentId');
    const match = matchPath(compiled, '/posts/abc/comments/xyz');
    expect(match.matched).toBe(true);
    expect(match.params).toEqual({ postId: 'abc', commentId: 'xyz' });
  });

  it('should return not matched for wrong path', () => {
    const compiled = compilePattern('/users/:id');
    const match = matchPath(compiled, '/posts/123');
    expect(match.matched).toBe(false);
    expect(match.params).toEqual({});
  });

  it('should decode URI components in params', () => {
    const compiled = compilePattern('/search/:query');
    const match = matchPath(compiled, '/search/hello%20world');
    expect(match.matched).toBe(true);
    expect(match.params).toEqual({ query: 'hello world' });
  });
});

describe('normalizePath', () => {
  it('should remove trailing slash', () => {
    expect(normalizePath('/users/')).toBe('/users');
  });

  it('should keep root path as is', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('should add leading slash', () => {
    expect(normalizePath('users')).toBe('/users');
  });

  it('should handle already normalized path', () => {
    expect(normalizePath('/users')).toBe('/users');
  });
});

describe('joinPaths', () => {
  it('should join base and route path', () => {
    expect(joinPaths('/api/v1', '/users')).toBe('/api/v1/users');
  });

  it('should handle root base path', () => {
    expect(joinPaths('/', '/users')).toBe('/users');
  });

  it('should normalize trailing slashes', () => {
    expect(joinPaths('/api/v1/', '/users/')).toBe('/api/v1/users');
  });

  it('should handle paths without leading slash', () => {
    expect(joinPaths('api', 'users')).toBe('/api/users');
  });
});
