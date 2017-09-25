function tokenize (buf, cb, opt) {
  opt = opt || {}
  var end = opt.end || 69     // default end to 'E'
  var lim = buf.length        // buffer limit

  var idx = 0                           // current index offset into buf
  var tok = 0                           // current token being handled
  var si = -1                           // current or previous string index
  var slen = 0                          // previous string length  (may be a key or string value)
  var vi                                // value start index
  var err_info
  var prev_tok

  main_loop: while (idx < lim) {
    vi = -1
    err_info = null
    prev_tok = tok
    tok = buf[idx]
    tok_switch: switch (tok) {
      case 9:             // TAB
      case 10:            // NL
      case 13:            // CR
      case 32:            // SPACE
        while (++idx < lim) {
          switch (buf[idx]) {
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
      case 93:                              // ]    ARRAY END
      case 123:                             // {    OBJECT START
      case 125:                             // }    OBJECT END
        vi = idx++
        break
      case 58:                              // :    COLON
        if (si === -1) {
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
          while (buf[++idx] !== 34) {       // "    QUOTE
            if (idx === lim) {
              err_info = { tok: 34, msg: 'unterminated string' }
              tok = 0
              break tok_switch
            }
          }
          for (var i=1; buf[idx - i] === 92; i++) {}  // \    count BACKSLASH
          if (i % 2) {
            break
          }
        }
        idx++       // move past end quote
        if (si === -1) {
          // set string index (potential key)
          si = vi
          vi = -1
          slen = idx - si
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
          switch (buf[idx]) {
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
    if (si === -1) {
      // non-string
      cbres = cb(buf, -1, 0, tok, vi, idx - vi, err_info)
    } else {
      // string
      if (prev_tok === 58) {                              // COLON
        // string with-preceding-colon
        cbres = cb(buf, si, slen, tok, vi, idx - vi, err_info)
      } else {
        // string no-preceding-colon
        cbres = cb(buf, -1, 0, 34, si, slen)              // 34 STRING (QUOTE)
        if (cbres > 0) {
          // reset state (prev_tok and vi are reset in main_loop)
          tok = 0; idx = cbres; si = -1; slen = 0; continue         // cb requested index
        } else if (cbres === 0) {
          return                                                    // cb requested stop
        }
        // in valid JSON vi cannot be a key because:
        // { string:string, string:string, ... } are consumed in pairs
        cbres = cb(buf, -1, 0, tok, vi, idx - vi, err_info)
      }
      si = -1; slen = 0
    }

    if (cbres > 0) {
      // reset state (prev_tok and vi are reset in main_loop)
      tok = 0; idx = cbres; si = -1; slen = 0                       // cb requested index
    } else if (cbres === 0) {
      return                                                        // cb requested stop
    }
  }  // end main_loop: while(idx < lim) {...

    if (si !== -1) {
        cb(buf, -1, 0, 34, si, slen)  // push out pending string (34 = QUOTE) as a value
    }
    cb(buf, -1, 0, end, idx, 0)
}

tokenize.CODE = {
  END: 69,
  STR: 34,
  ERR: 0,
  NUM: 78,
  ARR_BEG: 91,
  ARR_END: 93,
  OBJ_BEG: 123,
  OBJ_END: 125,
  TRU: 116,
  FAL: 102,
  NUL: 110,
}

module.exports = tokenize
