# qb-json-tok

Fast (~300 MB/sec) and light (1.7 kb) tokenizer for custom JSON/UTF-8 parsers.

qb-json-tok allows flexibility and efficiency by performing minimum processing 
and leaving heavy-lifting, such as value decoding, as optional work for the callback (delegate)

## Install

    npm install qb-json-tok

## tokenize(buffer, callback)

The tokenizer is just a function with two inputs:

    buffer:    a UTF-8 encoded buffer containing ANY JSON value such as an object, quoted
               string, array, or valid JSON number.  IOW, it doesn't have to be an {..} object.
               
    callback   a function called for each token encountered with the following parameters:
    
        function(
            buffer:      the buffer being parsed
            keyIndex:    index start of a key (in a key/value pair), or -1 if this is a stand-alone or array value
            keyLength:   length of key in UTF-8 bytes (in a key/value pair) or 0 if this is a stand-alone or array value
            token:       integer representing token encountered.  In almost all cases, this is the same as the 
                         first character encountered.  'n' for null, 't' for true, '{' for object start...
            valIndex:    index start of a stand-alone value or the value in a key/value pair
            valLength:   length of value in UTF-8 bytes - a stand alone value or value in a key/value pair
        )

## Example

Tokenizer tracks no state, it simply sifts through JSON tokens without a care - 
and without overhead.  Validating numbers and unicode escape sequences, keeping track of depth and paths,
validating open/closed objects and arrays, searching for key patterns...  any of that is 
up to the callback.

Here is an example copied from **test.js** showing how to write a callback that outputs token summary info:

    tokenize = require('qb-json-tok');
    
    // useful token constants:
    var STRING = 0x22       // "  (double-quote)
    var NUMBER = 0xF1       // code for any number
    
    function format_callback(opt) {
        var log = opt.log || console.log;
        var tok2str = function tok2char(tok) {
            switch(tok) {
    
                // only these 2 tokens non-intuitive
                case STRING:  return 'S';
                case NUMBER:  return 'N';
    
                // other tokens are intuitive... char codes
                //    '{' for object start,
                //    't' for true,
                //    'f' for false,
                //    'n' for null...
                default:    return String.fromCharCode(tok);
            }
        }
        return function(buf, keyIndex, keyLength, tok, valIndex, valLength) {
            var vstr =
                tok2str(tok) +
                ((tok === NUMBER || tok === STRING) ? valLength : '') +
                '@' + valIndex;
            if(keyIndex === -1) {  // not a key-value pair
                log(vstr);
            } else {               // a key-value pair
                var kstr = 'K' + keyLength + '@' + keyIndex;
                log(kstr + ':' + vstr);
            }
        }
    }

    tokenize(a_utf8_encoded_json_file, format_callback);
    

**test.js** has some more examples and also shows ways to easily create 
UTF-8 encoded JSON in memory from javascript.