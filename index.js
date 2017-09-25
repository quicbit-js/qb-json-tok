function tokenize (buf, cb, opt) {
  opt = opt || {}
  opt.end = opt.end || 69     // default end to 'E'
  var lim = buf.length        // buffer limit
  var idx = 0                 // current index offset into buf
  var tok = 0                 // current token
  var vi = -1                 // value start index
  var si = -1                 // previous string index   (may be a key or string value)
  var slen = -1               // previous string length  (may be a key or string value)
  var prev_tok = 0
  var err_info = null
  main_loop: while (idx < lim) {
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
        idx++
        continue    // main_loop
      case 34:                              // "    QUOTE
        vi = idx
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
          slen = idx - si
          continue  // main_loop: next tokens could be :-and-value or something else
        }
        break
      case 110:                             // 'n'  null
      case 116:                             // 't'  true
        vi = idx
        idx += 4
        break
      case 102:                             // 'f'  false
        vi = idx
        idx += 5
        break
      case 48:case 49:case 50:              // 0-9
      case 51:case 52:case 53:
      case 54:case 55:case 56:
      case 57:
      case 45:                              // '-'   ('+' is not legal here)
        vi = idx
        tok = 78                            // NUMBER  'N'
        while (++idx < lim) {
          switch (buf[idx]) {
            // skip all possibly-valid characters - as fast as we can
            case 48:case 49:case 50:   // 0-9
            case 51:case 52:case 53:
            case 54:case 55:case 56:
            case 57:
            case 43:                    // +
            case 45:                    // '-'
            case 46:                    // .
            case 69:                    // E
            case 101:                   // e
              break
            default:
              break tok_switch
          }
        }
        break
      case 44:                                // COMMA
        idx++
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
          tok = 0; idx = cbres; si = -1; slen = 0; continue        // cb requested index
        } else if (cbres === 0) {
          return si + slen                                // cb requested stop
        }
        // in valid JSON vi cannot be a key because:
        // { string:string, string:string, ... } are consumed in pairs
        cbres = cb(buf, -1, 0, tok, vi, idx - vi, err_info)
      }
      si = -1; slen = 0
    }

    if (cbres > 0) {
      // reset state (prev_tok and vi are reset in main_loop)
      tok = 0; idx = cbres; si = -1; slen = 0; continue              // cb requested index
    } else if (cbres === 0) {
      return idx                                            // cb requested stop
    }

    if (err_info) {
      err_info = null
    }
  }  // end main_loop: while(idx < lim) {...
  if (si !== -1) {
    cb(buf, -1, 0, 34, si, slen, err_info)  // push out pending string (34 = QUOTE) as a value - this would not work for truncation mode
  }
  cb(buf, -1, 0, opt.end, idx, 0)                                 // END
  return idx
}

module.exports = tokenize
