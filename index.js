function parse_err(msg, buf, off) {
    throw Error(msg + ': ' + String.fromCharCode(buf[off]) + ' at ' + off)
}

function tokenize(buf, cb, opt) {
    var tok = 0             // current token
    var idx = 0             // current index offset into buf
    var lim = buf.length    // buffer limit
    var vi = -1             // value start index
    var vlen = -1           // value length
    // track previous string, which may be object key
    var si = -1             // string index
    var slen = -1           // string length
    var prev_tok = 0
    main_loop: while(idx < lim) {
        prev_tok = tok
        tok = buf[idx]
        tok_switch: switch (tok) {
            case 9:             // TAB
            case 10:            // NL
            case 13:            // CR
            case 32:            // SPACE
                while(++idx < lim) {
                    switch(buf[idx]) {
                        case 9:             // TAB
                        case 10:            // NL
                        case 13:            // CR
                        case 32:            // SPACE
                            continue
                        default:
                            continue main_loop
                    }
                }
                continue
            case 91:        // [    ARRAY START
            case 93:        // ]    ARRAY END
            case 123:       // {    OBJECT START
            case 125:       // }    OBJECT END
                vi = idx++
                vlen = 1
                break
            case 58:        // :    COLON
                idx++
                continue
            case 34:        // "    QUOTE
                vi = idx
                while(true) {
                    while(buf[++idx] !== 34) {  // " QUOTE
                        if(idx === lim) {
                            parse_err('non-terminated string', buf, idx-1)
                        }
                    }
                    if(buf[idx - 1] !== 92) {   // \  BACKSLASH
                        break
                    }
                }
                idx++ // move past end quote
                if(si === -1) {
                    // set string index (potential key)
                    si = vi
                    slen = idx - si
                    continue  // next tokens will yield either value or key/value
                }
                break
            case 110:           // 'n'  null
            case 116:           // 't'  true
                vi = idx
                idx += 4
                break
            case 102:           // 'f'  false
                vi = idx
                idx += 5
                break
            case 48:case 49:case 50:case 51:case 52:case 53:case 54:case 55:case 56:case 57:    // 0-9
            case 45:                                                                            // '-'
                vi = idx
                tok = 0xF1                  // NUMBER
                while(++idx < lim) {
                    switch(buf[idx]) {
                        case 32:            // SPACE
                        case 9:             // TAB
                        case 10:            // NL
                        case 13:            // CR
                        case 44:            // ,    COMMA
                        case 123:           // {    OBJECT START
                        case 125:           // }    OBJECT END
                        case 91:            // [    ARRAY START
                        case 93:            // ]    ARRAY END
                            break tok_switch
                        // skip all possibly-valid characters - as fast as we can
                        case 48:case 49:case 50:case 51:case 52:case 53:case 54:case 55:case 56:case 57:    // 0-9
                        case 43:  // +
                        case 45:  // '-'
                        case 46:  // .
                        case 69:  // E
                        case 101: // e
                            break
                        default:
                            parse_err('illegal number character', buf, idx-1)
                    }
                }
                break
            case 44:   // ,    COMMA
                idx++
                continue
            default:
                parse_err('unexpected character', buf, idx)
        }
        var stop = false
        if(si === -1) {
            // non-string value
            stop = cb(buf, -1, 0, tok, vi, idx - vi, buf)
        } else {
            // string value plus subsequent token
            if(prev_tok === 58) {   // :  COLON
                // key and value
                stop = cb(buf, si, slen, tok, vi, idx - vi)
            } else {
                // string value and non-colon token (not a key-value)
                stop = cb(buf, -1, 0, 34, si, slen)            // 34 = QUOTE/STRING
                if(stop) {
                    return si + slen
                }
                stop = cb(buf, -1, 0, tok, vi, idx - vi)
            }
            si = slen = -1
        }
        if(stop) {
            return idx
        }
    }  // end tokenLoop: while(idx < lim) {...
    if(si !== -1) {
        cb(buf, -1, 0, 34, si, slen) // push out pending string (34 = QUOTE/STRING ) as a value - this would not work for truncation mode
    }
    if(opt && opt.end) {
        cb(buf, -1, 0, opt.end, lim, 0)        // END
    }
    return idx  // return new position
}

module.exports = tokenize
