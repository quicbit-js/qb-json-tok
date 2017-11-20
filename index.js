function tokenize (cb, src, off, lim) {
  off = off || 0
  lim = lim == null ? src.length : lim

  var idx = off                         // current index offset into buf
  var tok = 0                           // current token being handled
  var koff = -1
  var klim = -1
  var vi                                // value start index
  var err_info
  var prev_tok
  var stack = []                        // collection of array and object open braces (for checking matched braces)

  main_loop: while (idx < lim) {
    vi = -1
    err_info = null
    prev_tok = tok
    tok = src[idx]
    tok_switch: switch (tok) {
      case 9:             // TAB
      case 10:            // NL
      case 13:            // CR
      case 32:            // SPACE
        while (++idx < lim) {
          switch (src[idx]) {
            case 9:                     // TAB
            case 10:                    // NL
            case 13:                    // CR
            case 32:                    // SPACE
              continue
            default:
              tok = prev_tok                // whitespace is not a token
              continue main_loop
          }
        }
        tok = prev_tok                      // whitespace is not a token
        continue
      case 91:                              // [    ARRAY START
      case 123:                             // {    OBJECT START
        vi = idx++
        stack.push(tok)
        break
      case 93:                              // ]    ARRAY END
        if (stack.pop() !== 91) {
          err_info = {tok: 93, msg: 'unexpected array end'}
          tok = 0
        }
        vi = idx++
        break
      case 125:                             // }    OBJECT END
        if (stack.pop() !== 123) {
          err_info = {tok: 123, msg: 'unexpected object end'}
          tok = 0
        }
        vi = idx++
        break
      case 58:                              // :    COLON
        if (koff === -1) {
          err_info = { tok: 34, msg: 'unexpected colon' }
          tok = 0
          vi = idx++
          break
        } else {
          idx++
          continue
        }
      case 34:                              // "    QUOTE
        vi = idx
          // console.log('string at ', vi)
        while (true) {
          while (src[++idx] !== 34) {       // "    QUOTE
            if (idx === lim) {
              err_info = { tok: 34, msg: 'unterminated string' }
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
        if (koff === -1) {
          // set string index (potential key)
          koff = vi
          vi = -1
          klim = idx
          continue  // main_loop: next tokens could be :-and-value or something else
        }
        break
      case 110:                                 // n  null
      case 116:                                 // t  true
        vi = idx
        idx += 4
        break
      case 102:                                 // f  false
        vi = idx
        idx += 5
        break
      case 48:case 49:case 50:case 51:case 52:   // digits 0-4
      case 53:case 54:case 55:case 56:case 57:   // digits 5-9
      case 45:                                   // '-'   ('+' is not legal here)
        vi = idx
        tok = 78                                 // N  Number
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
      case 44:                                // COMMA
          // console.log('comma at ', idx)
        switch (prev_tok) {
            case 34:                              // "    QUOTE (string)
            case 78:                              // N    NUMBER
            case 93:                              // ]    ARRAY END
            case 102:                             // f    false
            case 110:                             // n    null
            case 116:                             // t    true
            case 125:                             // }    OBJECT END
                idx++
                break
            default:
                err_info = { tok: 44, msg: 'unexpected comma' }
                tok = 0
                vi = idx++
                break tok_switch
        }
        continue
      default:
        vi = idx++
        err_info = { tok: 0, msg: 'unexpected character' }
        tok = 0
    }
    var cbres = -1
    if (koff === -1) {
      // non-string
      cbres = cb(src, -1, 0, tok, vi, idx - vi, err_info)
    } else {
      // string
      if (prev_tok === 58) {                              // COLON
        // string with-preceding-colon
        cbres = cb(src, koff, klim, tok, vi, idx - vi, err_info)
      } else {
        // string no-preceding-colon
        cbres = cb(src, -1, 0, 34, koff, (klim - koff))              // 34 STRING (QUOTE)
        if (cbres > 0) {
          // reset state (prev_tok and vi are reset in main_loop)
          tok = 0; idx = cbres; koff = -1; klim = -1; continue         // cb requested index
        } else if (cbres === 0) {
          return                                                    // cb requested stop
        }
        // in valid JSON vi cannot be a key because:
        // { string:string, string:string, ... } are consumed in pairs
        cbres = cb(src, -1, 0, tok, vi, idx - vi, err_info)
      }
      koff = -1; klim = -1
    }

    if (cbres > 0) {
      // reset state (prev_tok and vi are reset in main_loop)
      tok = 0; idx = cbres; koff = -1; klim = -1                       // cb requested index
    } else if (cbres === 0) {
      return                                                        // cb requested stop
    }
  }  // end main_loop: while(idx < lim) {...

    if (koff !== -1) {
        cb(src, -1, 0, 34, koff, (klim - koff))  // push out pending string (34 = QUOTE) as a value
    }
    cb(src, -1, 0, 69, idx, 0)      // 'E' - end
}

tokenize.TOK = {
  STR: 34,        // '"'
  END: 69,        // 'E' - buffer limit reached
  NUM: 78,        // 'N'
  ARR_BEG: 91,    // '['
  ARR_END: 93,    // ']'
  FAL: 102,       // 'f'
  NUL: 110,       // 'n'
  TRU: 116,       // 't'
  OBJ_BEG: 123,   // '{'
  OBJ_END: 125,   // '}'
  ERR: 0,         // error.  check err_info for information
}

module.exports = tokenize
