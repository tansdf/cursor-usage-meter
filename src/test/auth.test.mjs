import assert from 'assert';

function normalizeStoredToken(raw) {
  if (typeof raw === 'string') {
    let value = raw.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    return value.length > 0 ? value : null;
  }
  return null;
}

assert.equal(normalizeStoredToken('"eyJ.test"'), 'eyJ.test');
assert.equal(normalizeStoredToken('eyJ.test'), 'eyJ.test');
assert.equal(normalizeStoredToken(''), null);

console.log('auth tests passed');
