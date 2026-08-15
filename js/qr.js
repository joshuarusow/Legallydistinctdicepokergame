/*
 * Minimal QR encoder (byte mode, ECC level M, versions 1-10).
 * Implements ISO/IEC 18004: Reed-Solomon over GF(256), standard masking
 * with penalty selection, format + version information.
 * Exposes QR.encode(text) -> 2-D array of 0/1 modules (browser global + Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QR = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- GF(256) tables (polynomial 0x11D) ----
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // Reed-Solomon generator polynomial of given degree.
  function rsGenerator(degree) {
    var poly = [1];
    for (var d = 0; d < degree; d++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var i = 0; i < poly.length; i++) {
        next[i] ^= poly[i];                    // times x
        next[i + 1] ^= gfMul(poly[i], EXP[d]); // times alpha^d
      }
      poly = next;
    }
    return poly; // highest-degree coefficient first
  }

  function rsEncode(data, degree) {
    var gen = rsGenerator(degree);
    var rem = new Array(degree).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem[0];
      rem.shift();
      rem.push(0);
      if (factor !== 0) {
        for (var j = 0; j < degree; j++) {
          rem[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return rem;
  }

  // ---- ECC level M block structure, versions 1-10 ----
  // [ecPerBlock, [dataLenOfEachBlock...]]
  var BLOCKS_M = {
    1: [10, [16]],
    2: [16, [28]],
    3: [26, [44]],
    4: [18, [32, 32]],
    5: [24, [43, 43]],
    6: [16, [27, 27, 27, 27]],
    7: [18, [31, 31, 31, 31]],
    8: [22, [38, 38, 39, 39]],
    9: [22, [36, 36, 36, 37, 37]],
    10: [26, [43, 43, 43, 43, 44]]
  };

  var ALIGNMENT = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function utf8Bytes(str) {
    var out = [];
    var enc = encodeURIComponent(str);
    for (var i = 0; i < enc.length; i++) {
      var ch = enc.charAt(i);
      if (ch === '%') {
        out.push(parseInt(enc.substr(i + 1, 2), 16));
        i += 2;
      } else {
        out.push(enc.charCodeAt(i));
      }
    }
    return out;
  }

  function dataCapacityBytes(version) {
    var spec = BLOCKS_M[version];
    var total = 0;
    for (var i = 0; i < spec[1].length; i++) total += spec[1][i];
    return total;
  }

  function charCountBits(version) {
    return version >= 10 ? 16 : 8; // byte mode
  }

  function pickVersion(byteLen) {
    for (var v = 1; v <= 10; v++) {
      // mode (4 bits) + char count field, rounded up to whole bytes
      var overhead = Math.ceil((4 + charCountBits(v)) / 8);
      if (byteLen + overhead <= dataCapacityBytes(v)) return v;
    }
    throw new Error('Data too long for QR versions 1-10 (' + byteLen + ' bytes)');
  }

  function buildCodewords(bytes, version) {
    var capacity = dataCapacityBytes(version);
    var bits = [];
    function push(value, count) {
      for (var i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
    }
    push(4, 4);                              // byte mode
    push(bytes.length, charCountBits(version)); // char count field
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    // terminator (up to 4 zero bits)
    var maxBits = capacity * 8;
    push(0, Math.min(4, maxBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    var data = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b + k];
      data.push(byte);
    }
    var pads = [0xEC, 0x11], p = 0;
    while (data.length < capacity) data.push(pads[p++ % 2]);

    // split into blocks, compute ECC, interleave
    var spec = BLOCKS_M[version];
    var ecLen = spec[0], blockLens = spec[1];
    var blocks = [], eccs = [], pos = 0;
    for (i = 0; i < blockLens.length; i++) {
      var block = data.slice(pos, pos + blockLens[i]);
      pos += blockLens[i];
      blocks.push(block);
      eccs.push(rsEncode(block, ecLen));
    }
    var out = [];
    var maxLen = Math.max.apply(null, blockLens);
    for (i = 0; i < maxLen; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i < blocks[j].length) out.push(blocks[j][i]);
      }
    }
    for (i = 0; i < ecLen; i++) {
      for (j = 0; j < eccs.length; j++) out.push(eccs[j][i]);
    }
    return out;
  }

  // ---- matrix construction ----

  function makeMatrix(version) {
    var size = version * 4 + 17;
    var m = [], reserved = [];
    for (var r = 0; r < size; r++) {
      m.push(new Array(size).fill(0));
      reserved.push(new Array(size).fill(false));
    }

    function set(r, c, v) {
      m[r][c] = v ? 1 : 0;
      reserved[r][c] = true;
    }

    function placeFinder(r0, c0) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var r = r0 + dr, c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          var on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          set(r, c, on);
        }
      }
    }
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // timing patterns
    for (var i = 8; i < size - 8; i++) {
      if (!reserved[6][i]) set(6, i, i % 2 === 0);
      if (!reserved[i][6]) set(i, 6, i % 2 === 0);
    }

    // alignment patterns (skip only the three finder corners)
    var centers = ALIGNMENT[version];
    var last = centers.length - 1;
    for (i = 0; i < centers.length; i++) {
      for (var j = 0; j < centers.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
        var cr = centers[i], cc = centers[j];
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            set(cr + dr, cc + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }

    // dark module + reserve format info areas
    set(size - 8, 8, 1);
    for (i = 0; i <= 8; i++) {
      if (i !== 6) {
        if (!reserved[8][i]) set(8, i, 0);
        if (!reserved[i][8]) set(i, 8, 0);
      }
    }
    for (i = 0; i < 8; i++) {
      if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, 0);
      if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, 0);
    }

    // version info (v >= 7)
    if (version >= 7) {
      var vinfo = versionBits(version);
      for (i = 0; i < 18; i++) {
        var bit = (vinfo >> i) & 1;
        var a = Math.floor(i / 3), b = size - 11 + (i % 3);
        set(a, b, bit);
        set(b, a, bit);
      }
    }

    return { m: m, reserved: reserved, size: size };
  }

  // BCH(18,6) for version information, generator 0x1F25.
  function versionBits(version) {
    var d = version << 12;
    while (bitLength(d) >= 13) {
      d ^= 0x1F25 << (bitLength(d) - 13);
    }
    return (version << 12) | d;
  }

  // BCH(15,5) for format information, generator 0x537, mask 0x5412.
  function formatBits(maskId) {
    var data = (0x0 << 3) | maskId; // ECC level M = 00
    var d = data << 10;
    while (bitLength(d) >= 11) {
      d ^= 0x537 << (bitLength(d) - 11);
    }
    return (((data << 10) | d) ^ 0x5412) & 0x7FFF;
  }

  function bitLength(x) {
    var n = 0;
    while (x > 0) { n++; x >>= 1; }
    return n;
  }

  function placeData(grid, codewords) {
    var size = grid.size, m = grid.m, reserved = grid.reserved;
    var bitIdx = 0, totalBits = codewords.length * 8;
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // skip timing column
      for (var i = 0; i < size; i++) {
        var r = upward ? size - 1 - i : i;
        for (var dc = 0; dc < 2; dc++) {
          var c = col - dc;
          if (reserved[r][c]) continue;
          var bit = 0;
          if (bitIdx < totalBits) {
            bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
          }
          m[r][c] = bit; // remainder bits stay 0
          bitIdx++;
        }
      }
      upward = !upward;
    }
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r, c) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
  ];

  function applyMask(grid, maskId) {
    var size = grid.size, out = [];
    for (var r = 0; r < size; r++) {
      out.push(grid.m[r].slice());
      for (var c = 0; c < size; c++) {
        if (!grid.reserved[r][c] && MASKS[maskId](r, c)) out[r][c] ^= 1;
      }
    }
    return out;
  }

  function writeFormat(matrix, size, maskId) {
    var bits = formatBits(maskId);
    var i, bit;
    for (i = 0; i < 15; i++) {
      bit = (bits >> i) & 1;
      // first copy: around top-left finder (LSB at (0,8), MSB at (8,0))
      if (i < 6) matrix[i][8] = bit;
      else if (i < 8) matrix[i + 1][8] = bit;
      else if (i === 8) matrix[8][7] = bit;
      else matrix[8][14 - i] = bit;
      // second copy: top-right row (LSB end) + bottom-left column (MSB end)
      if (i < 8) matrix[8][size - 1 - i] = bit;
      else matrix[size - 15 + i][8] = bit;
    }
    matrix[size - 8][8] = 1; // dark module always set
  }

  function penalty(matrix) {
    var size = matrix.length, score = 0;
    var r, c, k;

    // Rule 1: runs of 5+ same-colored modules
    for (var dir = 0; dir < 2; dir++) {
      for (r = 0; r < size; r++) {
        var run = 1;
        for (c = 1; c < size; c++) {
          var cur = dir ? matrix[c][r] : matrix[r][c];
          var prev = dir ? matrix[c - 1][r] : matrix[r][c - 1];
          if (cur === prev) {
            run++;
          } else {
            if (run >= 5) score += 3 + (run - 5);
            run = 1;
          }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
    }

    // Rule 2: 2x2 blocks of same color
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = matrix[r][c];
        if (matrix[r][c + 1] === v && matrix[r + 1][c] === v && matrix[r + 1][c + 1] === v) score += 3;
      }
    }

    // Rule 3: finder-like patterns 1011101 with 4 light modules on either side
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (r = 0; r < size; r++) {
      for (c = 0; c <= size - 11; c++) {
        var m1 = true, m2 = true, m3 = true, m4 = true;
        for (k = 0; k < 11; k++) {
          if (matrix[r][c + k] !== pat1[k]) m1 = false;
          if (matrix[r][c + k] !== pat2[k]) m2 = false;
          if (matrix[c + k][r] !== pat1[k]) m3 = false;
          if (matrix[c + k][r] !== pat2[k]) m4 = false;
        }
        if (m1) score += 40;
        if (m2) score += 40;
        if (m3) score += 40;
        if (m4) score += 40;
      }
    }

    // Rule 4: dark module proportion
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += matrix[r][c];
    var pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function encode(text) {
    var bytes = utf8Bytes(text);
    var version = pickVersion(bytes.length);
    var codewords = buildCodewords(bytes, version);
    var grid = makeMatrix(version);
    placeData(grid, codewords);

    var best = null, bestScore = Infinity, bestMask = 0;
    for (var maskId = 0; maskId < 8; maskId++) {
      var candidate = applyMask(grid, maskId);
      writeFormat(candidate, grid.size, maskId);
      var s = penalty(candidate);
      if (s < bestScore) {
        bestScore = s;
        best = candidate;
        bestMask = maskId;
      }
    }
    return best;
  }

  // Debug helper: encode with a fixed mask (used by the verification script).
  function encodeWithMask(text, maskId) {
    var bytes = utf8Bytes(text);
    var version = pickVersion(bytes.length);
    var codewords = buildCodewords(bytes, version);
    var grid = makeMatrix(version);
    placeData(grid, codewords);
    var matrix = applyMask(grid, maskId);
    writeFormat(matrix, grid.size, maskId);
    return matrix;
  }

  return {
    encode: encode,
    _debugEncodeMask0: function (text) { return encodeWithMask(text, 0); }
  };
});
