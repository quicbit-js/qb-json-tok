# qb-json-tok

Fast (~300 MB/sec) and light (1.3 kb) tokenizer for custom JSON/UTF-8 parsers.

qb-json-tok allows flexibility and efficiency by performing minimum processing 
and leaving heavy-lifting, such as value decoding, as optional work for the callback (delegate)

## Install

    npm install qb-json-tok

## tokenize(buffer, callback, options)

The tokenizer is just a function with three inputs:

    buffer:    A UTF-8 encoded buffer containing ANY JSON value such as an object, quoted
               string, array, or valid JSON number.  IOW, it doesn't have to be a {...} object.
               
    callback:  A function called for each token encountered.
               Returning a truthy value from the function will halt processing.
               Takes these parameters:
    
        function(
            buffer:      the buffer being parsed
            keyIndex:    index start of a key (in a key/value pair), or -1 if this is a stand-alone or array value
            keyLength:   length of key in UTF-8 bytes (in a key/value pair) or 0 if this is a stand-alone or array value
            token:       integer representing token encountered.  In almost all cases, this is the same as the 
                         first character encountered.  'n' for null, 't' for true, '{' for object start...
            valIndex:    index start of a stand-alone value or the value in a key/value pair
            valLength:   length of value in UTF-8 bytes - a stand alone value or value in a key/value pair
        )
    
    options:
        end:    If set, then this value will be passed to callback as the 'token' when parsing completes.

## Example

Tokenizer tracks no state, it simply sifts through JSON tokens without a care - 
and without overhead.  Validating numbers and unicode escape sequences, keeping track of depth and paths,
validating open/closed objects and arrays, searching for key patterns...  any of that is 
up to the callback.

Here is an example copied from **test.js** showing how to write a callback that outputs token summary info:

    tokenize = require('qb-json-tok');
    
    // useful token constants:
    var STRING = 0x22       // "  (double-quote)
    var NUMBER = 0xF1       // token for JSON number
    // other tokens are intuitive - they are the same char code as the first byte parsed
    // 't' for true
    // 'f' for false
    // 'n' for null
    // '{' for object start
    // '}' for object end
    // '[' for array start
    // ...
    
    function format_callback(buf, key_off, key_len, tok, val_off, val_len) {
        var val_str
        switch(tok) {
            case STRING:  val_str = 'S' + val_len; break;
            case NUMBER:  val_str = 'N' + val_len; break;
            default:      val_str = String.fromCharCode(tok);
        }
        val_str += '@' + val_off
        if(key_off === -1) {
            // value only
            console.log(val_str);
        } else {
            // key and value
            console.log('K' + key_len + '@' + key_off + ':' + val_str);
        }
    }

    var utf8 = require('qb-utf8-ez');           // to create UTF-8 from strings
    
    tokenize(utf8.buffer('[ -2.3, "bb", true, {"a": 1, "b": 2} ]'), format_callback, {end:0x45})
        
    > [@0           // start array at 0
    > N4@2          // 4-byte number at 2                    
    > S4@8          // 4-byte string (including quotes) at 8
    > t@14          // true at 14 (always 4 bytes)
    > {@20          // start object at 20
    > K3@21:N1@26   // 3-byte key at 21: 1 byte number at 26
    > K3@29:N1@34   // 3-byte key at 29, 1 byte number at 34
    > }@35          // end-object at 35
    > ]@37          // end-array at 37
    > E@38          // end of parsing at 38

