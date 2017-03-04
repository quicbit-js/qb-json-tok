var tokenize = require('.');
var utf8 = require('qb-utf8-ez');           // to create UTF-8 from strings

// useful token constants:
var STRING = 34;       // "  (double-quote)
var NUMBER = 78;       // 'N' token for JSON number
var ERROR  = 0;        // ERROR occured - details will be in the err_info object
// other tokens are intuitive - they are the same char code as the first byte parsed
// 't' for true
// 'f' for false
// 'n' for null
// '{' for object start
// '}' for object end
// '[' for array start
// ...

function print_tokens(comment, input, opt) {
    opt = opt || {}
    var recover_from
    var cb = function(buf, key_off, key_len, tok, val_off, val_len, err_info) {
        var val_str;
        switch(tok) {
            case STRING: val_str = 'S' + val_len + '@' + val_off; break;
            case NUMBER: val_str = 'N' + val_len + '@' + val_off; break;
            case ERROR:  val_str = '!' + val_len + '@' + val_off + ': ' + JSON.stringify(err_info); break;
            default:     val_str = String.fromCharCode(tok) + '@' + val_off;
        }
        if(key_off === -1) {
            console.log(val_str);                                           // value only
        } else {
            console.log('K' + key_len + '@' + key_off + ':' + val_str);     // key and value
        }
        if(tok === ERROR) {
            switch(opt.on_error) {
                case 'stop': return 0
                case 'backup': return recover_from   // a contrived / simple recovery strategy that is more effective at fixing mismatched quotes.
                default: return -1
            }
        }
        recover_from = val_off + (val_len === 1 ? 1 : val_len -1)
    }

    console.log(comment)
    console.log( "INPUT: '" + input + "'", opt || '')
    tokenize( utf8.buffer(input), cb, opt )
    console.log('')
}


print_tokens( 'simple object', '{"a": 1, "b": 2}' );
print_tokens( 'stand-alone value', ' 7.234556    ' );
print_tokens( 'stand-alone incomplete value with the "end" set to \'E\'', '[ -2.3, "hi \\\"there\\\""', { end: 69 } );
print_tokens( 'invalid number - stop on error',     '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]',  { on_error: 'stop' } );
print_tokens( 'invalid number - continue on error', '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]',  { on_error: 'continue' } );
print_tokens( 'valid json ',                        '[ -2.3, "aaa", "bb", true, {"a": 1, "b": 2} ]' );
print_tokens( 'invalid quote - continue',                '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]',    { on_error: 'continue' } );
print_tokens( 'invalid quote - continue slow increment', '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]',    { on_error: 'backup' } );

/*
OUTPUT

 simple object
 INPUT: '{"a": 1, "b": 2}' {}
 {@0
 K3@1:N1@6
 K3@9:N1@14
 }@15

 stand-alone value
 INPUT: ' 7.234556    ' {}
 N8@1

 stand-alone incomplete value with the "end" set to 'E'
 INPUT: '[ -2.3, "hi \"there\""' { end: 69 }
 [@0
 N4@2
 S14@8
 E@22

 invalid number - stop on error
 INPUT: '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'stop' }
 [@0
 N4@2
 N1@8
 !1@9: {"tok":0,"msg":"unexpected character"}

 invalid number - continue on error
 INPUT: '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'continue' }
 [@0
 N4@2
 N1@8
 !1@9: {"tok":0,"msg":"unexpected character"}
 S4@12
 t@18
 {@24
 K3@25:N1@30
 K3@33:N1@38
 }@39
 ]@41

 valid json
 INPUT: '[ -2.3, "aaa", "bb", true, {"a": 1, "b": 2} ]' {}
 [@0
 N4@2
 S5@8
 S4@15
 t@21
 {@27
 K3@28:N1@33
 K3@36:N1@41
 }@42
 ]@44

 invalid quote - continue
 INPUT: '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'continue' }
 [@0
 N4@2
 S7@8
 !1@15: {"tok":0,"msg":"unexpected character"}
 !1@16: {"tok":0,"msg":"unexpected character"}
 S11@17
 !1@28: {"tok":0,"msg":"unexpected character"}
 S7@29
 !1@36: {"tok":0,"msg":"unexpected character"}
 !7@37: {"tok":34,"msg":"unterminated string"}

 invalid quote - continue slow increment
 INPUT: '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'backup' }
 [@0
 N4@2
 S7@8
 !1@15: {"tok":0,"msg":"unexpected character"}
 S4@14
 t@20
 {@26
 K3@27:N1@32
 K3@35:N1@40
 }@41
 ]@43

 */