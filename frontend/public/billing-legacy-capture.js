/* M05: read-only evidence, never an entitlement or proof of a fresh install.
 * Load synchronously before launcher writers ONLY with the native seal gate.
 * Released code 8 artifact: installed-base.apk SHA256
 * 34f0d81997905f331c085dae186d2c33c2671f70815c688339886f458ca88258;
 * main.587f8b6b.js SHA256
 * ba111d13b59e3174e3bcdb5312d31c39a8bdebf1741d4eeb0642935ef503b571.
 * Earlier code 5 has no such keys: absence leaves cohort coverage unknown.
 */
(function (root) {
  'use strict';
  if (!root) return;
  try {
    var location = root.location;
    var views = new URLSearchParams(location.search).getAll('view');
    if (views.indexOf('keyboard') !== -1 || location.pathname !== '/' ||
        views.some(function (view) { return view !== 'launcher'; })) return;
    // Reexecution never rescans. Do not invoke or trust a preexisting accessor.
    // Bootstrap must validate the value; a collision is a recovery condition.
    if (Object.getOwnPropertyDescriptor(root, '__nokiaBillingLegacyCapture')) return;

    var limit = 2048;
    var storage;
    try { storage = root.localStorage; } catch (_) { storage = null; }

    function utf8Fits(raw) {
      // getItem necessarily returns the whole stored string. All subsequent
      // work is bounded by 2048 UTF-16 units AND 2048 UTF-8 bytes, no encoding
      // buffer allocation. Unpaired surrogates count as replacement characters.
      if (raw.length > limit) return false;
      var bytes = 0;
      for (var i = 0; i < raw.length; i++) {
        var code = raw.charCodeAt(i);
        if (code < 128) bytes++;
        else if (code < 2048) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < raw.length &&
                 raw.charCodeAt(i + 1) >= 0xdc00 && raw.charCodeAt(i + 1) <= 0xdfff) {
          bytes += 4; i++;
        } else bytes += 3;
        if (bytes > limit) return false;
      }
      return true;
    }

    function flatObject(raw) {
      // A bounded flat JSON tokenizer. No recursive/generic object parser and
      // no lossy duplicate-field collapse (escaped field names are decoded).
      var position = 0;
      var fields = Object.create(null);
      function whitespace() { while (/[\x20\t\r\n]/.test(raw.charAt(position)) && position < raw.length) position++; }
      function string() {
        var start = position++;
        while (position < raw.length) {
          var character = raw.charAt(position++);
          if (character === '"') return JSON.parse(raw.slice(start, position));
          if (character === '\\') position++;
        }
        throw 'malformed'; // eslint-disable-line no-throw-literal
      }
      whitespace();
      if (position === raw.length) throw 'malformed'; // eslint-disable-line no-throw-literal
      if (raw.charAt(position++) !== '{') throw 'unsupported'; // eslint-disable-line no-throw-literal
      whitespace();
      if (raw.charAt(position) === '}') { position++; }
      else {
        while (position < raw.length) {
          if (raw.charAt(position) !== '"') throw 'malformed'; // eslint-disable-line no-throw-literal
          var key = string();
          if (Object.prototype.hasOwnProperty.call(fields, key)) throw 'malformed'; // eslint-disable-line no-throw-literal
          whitespace();
          if (raw.charAt(position++) !== ':') throw 'malformed'; // eslint-disable-line no-throw-literal
          whitespace();
          var value;
          var first = raw.charAt(position);
          if (first === '{' || first === '[') throw 'unsupported'; // eslint-disable-line no-throw-literal
          if (first === '"') value = string();
          else {
            var token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(position));
            if (!token) throw 'malformed'; // eslint-disable-line no-throw-literal
            position += token[0].length;
            value = JSON.parse(token[0]);
          }
          fields[key] = value;
          whitespace();
          var separator = raw.charAt(position++);
          if (separator === '}') break;
          if (separator !== ',') throw 'malformed'; // eslint-disable-line no-throw-literal
          whitespace();
        }
        if (raw.charAt(position - 1) !== '}') throw 'malformed'; // eslint-disable-line no-throw-literal
      }
      whitespace();
      if (position !== raw.length) throw 'malformed'; // eslint-disable-line no-throw-literal
      return fields;
    }

    function capture(key, onboarding) {
      var raw;
      try { raw = storage.getItem(key); } catch (_) { return { classification: 'unreadable' }; }
      if (raw === null) return { classification: 'missing' };
      if (typeof raw !== 'string') return { classification: 'unreadable' };
      if (!utf8Fits(raw)) return { classification: 'oversized' };
      var saved;
      try { saved = flatObject(raw); }
      catch (error) { return { classification: error === 'unsupported' ? 'unsupported' : 'malformed' }; }
      var names = Object.keys(saved);
      var integerIndex = typeof saved.index === 'number' && Number.isInteger(saved.index);
      if (onboarding && typeof saved.completed === 'boolean' && integerIndex) {
        if (names.length === 2 && saved.index >= 0 && saved.index <= 4) {
          return { classification: 'historical_valid', completed: saved.completed };
        }
        var ids = ['welcome', 'dumb-mode', 'navigation', 'setup'];
        if (names.length === 4 && saved.schema === 2 && saved.index >= 0 && saved.index < 4 &&
            saved.stepId === ids[saved.index]) {
          return { classification: 'current_valid', completed: saved.completed };
        }
      }
      // Historical and current check-in writers have the exact same schema.
      if (!onboarding && names.length === 2 && typeof saved.shown === 'boolean' &&
          typeof saved.startedAt === 'number' && Number.isFinite(saved.startedAt) && saved.startedAt >= 0) {
        return { classification: 'historical_valid', shown: saved.shown };
      }
      return { classification: 'unsupported' };
    }

    var onboarding = Object.freeze(capture('nokia-launcher.onboarding', true));
    var checkIn = Object.freeze(capture('nokia-launcher.week-check-in.v1', false));
    var captureResult = Object.freeze({
      version: 1,
      coverage: 'unknown',
      readStatus: onboarding.classification === 'unreadable' || checkIn.classification === 'unreadable' ? 'unreadable' : 'complete',
      onboarding: onboarding,
      checkIn: checkIn
    });
    Object.defineProperty(root, '__nokiaBillingLegacyCapture', {
      value: captureResult, writable: false, configurable: false, enumerable: false
    });
  } catch (_) { /* Capture failures must never prevent the local shell/IME. */ }
}(typeof window === 'undefined' ? null : window));
