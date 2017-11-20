// STATES   - use second byte.  LSB is for TOK / ascii
var CTX_MASK =    0x0300
var CTX_UNK =     0x0000    // unknown context - need to check stack
var CTX_OBJ =     0x0100
var CTX_ARR =     0x0200
var CTX_NONE =    0x0300

var POS_MASK =    0x0C00
var BEFORE =      0x0400
var AFTER =       0x0800
var INSIDE =      0x0C00

var KEYVAL_MASK = 0x1000
var VAL =         0x0000
var KEY =         0x1000

var FIRST =       0x2000     // is first value in an object or array

function state_to_str (state) {
  if (state == null) {
    return 'undefined'
  }
  var ret = ''
  switch (state & CTX_MASK) {
    case CTX_OBJ: ret += 'in object, '; break
    case CTX_ARR: ret += 'in array, '; break
    case CTX_UNK: ret += 'unknown context, '; break
  }
  switch (state & POS_MASK) {
    case BEFORE: ret += 'before'; break
    case AFTER: ret += 'after'; break
    case INSIDE: ret += 'inside'; break
  }
  if (state & FIRST) { ret += ' first' }
  ret += (state & KEY) ? ' key' : ' value'
  return ret
}

var NUM_CHARS = '-0123456789'      // legal number start chars
var VAL_CHARS = '"ntf' + NUM_CHARS

// create an int-int map from (state + tok) -- to --> (new state)
function state_map () {
  var ret = []

  // for each char: map (state0 + ascii) -> state1
  var map = function (s0, chars, s1) {
    for (var i=0; i<chars.length; i++) {
      ret[s0 | chars.charCodeAt(i)] = s1
    }
  }

  // start array
  map( CTX_NONE | BEFORE|FIRST|VAL, '[',        CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_ARR  | BEFORE|FIRST|VAL, '[',        CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_OBJ  | BEFORE|FIRST|VAL, '[',        CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_NONE | BEFORE|VAL,       '[',        CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_ARR  | BEFORE|VAL,       '[',        CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_OBJ  | BEFORE|VAL,       '[',        CTX_ARR | BEFORE|FIRST|VAL )

  // start object
  map( CTX_NONE | BEFORE|FIRST|VAL, '{',        CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_ARR  | BEFORE|FIRST|VAL, '{',        CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_OBJ  | BEFORE|FIRST|VAL, '{',        CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_NONE | BEFORE|VAL,       '{',        CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_ARR  | BEFORE|VAL,       '{',        CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_OBJ  | BEFORE|VAL,       '{',        CTX_OBJ | BEFORE|FIRST|KEY )

  // values (no context)
  map( CTX_NONE | BEFORE|FIRST|VAL, VAL_CHARS, CTX_NONE | AFTER|VAL )
  map( CTX_NONE | AFTER|VAL,        ',',       CTX_NONE | BEFORE|VAL )
  map( CTX_NONE | BEFORE|VAL,       VAL_CHARS, CTX_NONE | AFTER|VAL )   // etc ...

  // array values
  map( CTX_ARR | BEFORE|FIRST|VAL,  VAL_CHARS,  CTX_ARR | AFTER|VAL )
  map( CTX_ARR | AFTER|VAL,         ',',        CTX_ARR | BEFORE|VAL )
  map( CTX_ARR | BEFORE|VAL,        VAL_CHARS,  CTX_ARR | AFTER|VAL )   // etc ...

  // object fields
  map( CTX_OBJ | BEFORE|FIRST|KEY,  '"',        CTX_OBJ | AFTER|KEY )
  map( CTX_OBJ | AFTER|KEY,         ':',        CTX_OBJ | BEFORE|VAL )
  map( CTX_OBJ | BEFORE|VAL,        VAL_CHARS,  CTX_OBJ | AFTER|VAL )
  map( CTX_OBJ | AFTER|VAL,         ',',        CTX_OBJ | BEFORE|KEY )
  map( CTX_OBJ | BEFORE|KEY,        ':',        CTX_OBJ | BEFORE|VAL )  // etc ...

  // end contexts - check stack for next context
  map( CTX_ARR | BEFORE|FIRST|VAL,  ']',        CTX_UNK | AFTER|VAL )   // empty array
  map( CTX_ARR | AFTER|VAL,         ']',        CTX_UNK | AFTER|VAL )
  map( CTX_OBJ | BEFORE|FIRST|KEY,  '}',        CTX_UNK | AFTER|VAL )   // empty object
  map( CTX_OBJ | AFTER|VAL,         '}',        CTX_UNK | AFTER|VAL )

  return ret
}

var STATES = state_map()

function err (msg) { throw Error(msg) }

function map_ascii (s, code) {
  var ret = []
  for (var i=0; i<s.length; i++) { ret[s.charCodeAt(i)] = code }
  return ret
}

var WHITESPACE = map_ascii('\n\t\r ', 1)
// var NUM_CHARS_ALL = NUM_CHARS + '+.eE'   // all legal number chars

function tokenize (cb, src, off, lim) {
  off = off || 0
  lim = lim == null ? src.length : lim

  var idx = off                     // current index offset into buf
  var koff = -1
  var klim = -1
  var voff = -1                     // value start index
  var info = null                   // extra information about errors or split values
  var stack = []                    // collection of array and object open braces (for checking matched braces)
  var state0 = CTX_NONE|BEFORE|FIRST|VAL  // state we are transitioning from. see state_map()
  var state1 = 0                    // new state
  var tok = -1                      // current token/byte being handled

  // skip whitspace and set tok prior to loop

  while (idx < lim) {
    voff = -1
    info = null
    tok = src[idx]
    if (WHITESPACE[tok]) {
      while (WHITESPACE[src[++idx]] && idx < lim) {}
      if (idx === lim) {
        break
      }
      tok = src[idx]
    }
    state1 = STATES[state0 + tok]
    if (state1 === undefined) {
      info = { msg: 'unexpected character', where: state_to_str(state0), tok: tok }
      tok = 0
      voff = idx++
    } else {
      tok_switch: switch (tok) {
        case 34:                              // "    QUOTE
          voff = idx
          // console.log('string at ', vi)
          while (true) {
            while (src[++idx] !== 34) {
              if (idx === lim) {
                info = {msg: 'unterminated string'}
                tok = 0
                break tok_switch
              }
            }
            for (var i=1; src[idx - i] === 92; i++) {}  // \    count BACKSLASH
            if (i % 2) {
              break
            }
          }
          idx++       // move past end quote

          if ((state0 & (POS_MASK | KEYVAL_MASK)) === (BEFORE | KEY)) {
            koff = voff
            klim = idx
            voff = -1         // indicate no val
          }
          break
        case 91:                                  // [    ARRAY START
        case 123:                                 // {    OBJECT START
          voff = idx++
          stack.push(tok)
          break
        case 93:                                  // ]    ARRAY END
        case 125:                                 // }    OBJECT END
          voff = idx++
          stack.pop()
          ;(state1 & CTX_MASK) === CTX_UNK || err('bad context')
          if (stack.length > 0) {
            state1 |= stack[stack.length-1] === 91 ? CTX_ARR : CTX_OBJ   // CTX_NONE is zero
          }
          break
        case 44:                                  // ,    COMMA
        case 58:                                  // :    COLON
          idx++
          break
        case 110:                                 // n    null
        case 116:                                 // t    true
          voff = idx
          idx += 4
          break
        case 102:                                 // f    false
          voff = idx
          idx += 5
          break
        case 48:case 49:case 50:case 51:case 52:   // digits 0-4
        case 53:case 54:case 55:case 56:case 57:   // digits 5-9
        case 45:                                   // '-'   ('+' is not legal here)
          voff = idx
          tok = TOK.NUM                                 // N  Number
          while (++idx < lim) {
            switch (src[idx]) {
              // skip all possibly-valid characters - as fast as we can
              case 48:case 49:case 50:case 51:case 52:   // digits 0-4
              case 53:case 54:case 55:case 56:case 57:   // digits 5-9
              case 43:                                   // +
              case 45:                                   // -
              case 46:                                   // .
              case 69:                                   // E
              case 101:                                  // e
                break
              default:
                break tok_switch
            }
          }
          break
        default:
          voff = idx++
          info = {msg: 'unexpected character' }
          tok = 0
      }

      // update state 
      state0 = state1
    }
    if (voff !== -1) {
      var cbres = cb(src, koff, klim, tok, voff, idx - voff, info)
      koff = -1
      klim = -1
      if (cbres > 0) {
        err('cb index not handled')
      } else if (cbres === 0) {
        return                                                        // cb requested stop
      }
    }
  }  // end main_loop: while(idx < lim) {...

  // handle this when implementing split handling
  // if (koff !== -1) {
  //     cb(src, -1, 0, 34, koff, (klim - koff))  // push out pending string
  // }
  cb(src, -1, 0, TOK.END, idx, 0)
}

var TOK = {
  ARR_BEG: 91,    // '['
  ARR_END: 93,    // ']'
  OBJ_BEG: 123,   // '{'
  OBJ_END: 125,   // '}'
  STR: 34,        // '"'
  FAL: 102,       // 'f'
  NUL: 110,       // 'n'
  TRU: 116,       // 't'
  ERR: 0,         // error.  check err_info for information
  END: 69,        // 'E' - buffer limit reached
  NUM: 78,        // 'N'
}

// where codes combine with
var WHERE = {
  BEFORE_KEY:      0x100,    // before an object key was started (before the start quote)
  IN_KEY:          0x200,    // inside an object key (before the end quote)
  AFTER_KEY:       0x300,    // after an object key, but before the colon ':'
  BEFORE_VAL:      0x400,    // before an object or array value (after the comma, colon, or starting array brace
  IN_VAL:          0x800,    // inside an object or array value (includes uncertain number cases like 12.3<end>)
  AFTER_VAL:      0x1000,    // after an object or array value, but before the comma or closing array or object brace
}
tokenize.WHERE = WHERE
tokenize.TOK = TOK

module.exports = tokenize
