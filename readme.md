# qb-json-tok

[![npm][npm-image]][npm-url]
[![downloads][downloads-image]][npm-url]
[![bitHound Dependencies][proddep-image]][proddep-link]
[![dev dependencies][devdep-image]][devdep-link]
[![code analysis][code-image]][code-link]

[npm-image]:       https://img.shields.io/npm/v/qb-json-tok.svg
[downloads-image]: https://img.shields.io/npm/dm/qb-json-tok.svg
[npm-url]:         https://npmjs.org/package/qb-json-tok
[proddep-image]:   https://www.bithound.io/github/quicbit-js/qb-json-tok/badges/dependencies.svg
[proddep-link]:    https://www.bithound.io/github/quicbit-js/qb-json-tok/master/dependencies/npm
[devdep-image]:    https://www.bithound.io/github/quicbit-js/qb-json-tok/badges/devDependencies.svg
[devdep-link]:     https://www.bithound.io/github/quicbit-js/qb-json-tok/master/dependencies/npm
[code-image]:      https://www.bithound.io/github/quicbit-js/qb-json-tok/badges/code.svg
[code-link]:       https://www.bithound.io/github/quicbit-js/qb-json-tok

Fast (~350 MB/sec) and light (1.6 kb *zero dependecy*) tokenizer for custom JSON/UTF-8 parsers.

qb-json-tok allows flexibility and efficiency by performing minimum processing 
and leaving heavy-lifting, such as value decoding, as optional work for the callback (delegate)

**Complies with the 100% test coverage and minimum dependency requirements** of 
[qb-standard](http://github.com/quicbit-js/qb-standard) . 


## Install

    npm install qb-json-tok

## tokenize(buffer, callback, options)
  
## API

The tokenizer is just a function with four inputs:

    buffer:    A UTF-8 encoded array containing ANY JSON value such as an object, quoted
               string, array, or valid JSON number.  IOW, it doesn't have to be a {...} object.
               
    callback:  A function called for each token encountered.
    
        buffer:      the buffer being parsed
        keyIndex:    index start of a key (in a key/value pair), or -1 if this is a stand-alone or array value
        keyLength:   length of key in UTF-8 bytes (in a key/value pair) or 0 if this is a stand-alone or array value
        token:       integer representing token encountered.  In almost all cases, this is the same as the 
                     first character encountered.  'n' for null, 't' for true, '{' for object start...
        valIndex:    index start of a stand-alone value or the value in a key/value pair
        valLength:   length of value in UTF-8 bytes - a stand alone value or value in a key/value pair
        
        info:        information object for error and end events        
                     if there is an error, err will be an object containing:
                        { 
                            msg:     the error message
                            tok:     the token where the error occured (unterminated string error will have tok: 34) OR
                                     zero if the token was invalid/unknown.
                        }
                     if then end of buffer is reached, this contains the parse state that can be passed to continue parsing
                     
        returns:     the value returned controls processing: 
                        returning zero halts the tokenizer.
                        returning a positive number will continue tokenizing at that offset 
                                (backtrack or skip forward to the returned offset).  Note that
                                jumping to the value 'xyz' of a key value pair:
                                        { "a": "xyz" }...
                                will make the tokenizer return just a string value, not the k
                        returning anything else (undefined, null, negative number) - will cause 
                                processing to continue.
                     
                     NOTE: as of version 2.0, if you want to halt processing on error, you must check
                     the return token for error (zero) and return zero from the function.
    
    options
        end:         the token used to indicate when parsing completes.  defaults to 69 ('E'). this option is only for backward compatibility
        
    state            for incremental parsing, you can pass the state object returned by the end callback into this argument.

## Example

Tokenizer tracks no state, it simply sifts through JSON tokens without a care - 
and without overhead.  Validating numbers and unicode escape sequences, keeping track of depth and paths,
validating open/closed objects and arrays, searching for key patterns...  any of that is 
up to the callback.

Here is an example taken from **example.js** showing how to write a function that outputs 
a token summary:

    var tokenize = require('.')
    var utf8 = require('qb-utf8-ez')           // to create UTF-8 from strings
    
    // useful token constants:
    var STRING = 34       // "  (double-quote)
    var NUMBER = 78       // 'N' token for JSON number
    var ERROR = 0        // ERROR occured - details will be in the err_info object
    // other tokens are intuitive - they are the same char code as the first byte parsed
    // 't' for true
    // 'f' for false
    // 'n' for null
    // '{' for object start
    // '}' for object end
    // '[' for array start
    // ...
    
    function print_tokens (comment, input, opt) {
      opt = opt || {}
      var recover_from
      var cb = function (buf, key_off, key_len, tok, val_off, val_len, err_info) {
        var val_str
        switch (tok) {
          case STRING: val_str = 'S' + val_len + '@' + val_off; break
          case NUMBER: val_str = 'N' + val_len + '@' + val_off; break
          case ERROR: val_str = '!' + val_len + '@' + val_off + ': ' + JSON.stringify(err_info); break
          default: val_str = String.fromCharCode(tok) + '@' + val_off
        }
        if (key_off === -1) {
          console.log(val_str)                                           // value only
        } else {
          console.log('K' + key_len + '@' + key_off + ':' + val_str)     // key and value
        }
        if (tok === ERROR) {
          switch (opt.on_error) {
            case 'stop': return 0
            case 'backup': return recover_from   // a contrived / simple recovery strategy that is more effective at fixing mismatched quotes.
            default: return -1
          }
        }
        recover_from = val_off + (val_len === 1 ? 1 : val_len - 1)
      }
    
      console.log(comment)
      console.log("INPUT: '" + input + "'", opt || '')
      tokenize(utf8.buffer(input), cb, opt)
      console.log('')
    }
    
    print_tokens('simple object', '{"a": 1, "b": 2}')
    print_tokens('stand-alone value', ' 7.234556    ')
    print_tokens('stand-alone incomplete value with the "end" set to \'E\'', '[ -2.3, "hi \\"there\\""', { end: 69 })
    print_tokens('invalid number - stop on error', '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]', { on_error: 'stop' })
    print_tokens('invalid number - continue on error', '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]', { on_error: 'continue' })
    print_tokens('valid json ', '[ -2.3, "aaa", "bb", true, {"a": 1, "b": 2} ]')
    print_tokens('invalid quote - continue', '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]', { on_error: 'continue' })
    print_tokens('invalid quote - continue slow increment', '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]', { on_error: 'backup' })
    
And here is some example output of our formatting callback:

    print_tokens( 'simple object', '{"a": 1, "b": 2}' );
    > simple object
    > INPUT: '{"a": 1, "b": 2}' {}
    > {@0                           // start object at 0
    > K3@1:N1@6                     // 3-byte key at 1 : 1-byte number at 6 
    > K3@9:N1@14                    // 3-byte key at 9 : 1-byte number at 14 
    > }@15                          // end object at 15                                            
    
    print_tokens( 'stand-alone value', ' 7.234556    ' );
    > stand-alone value
    > INPUT: ' 7.234556    ' {}
    > N8@1                          // 8-byte number at 1

    print_tokens( 'stand-alone incomplete value with the "end" set to \'E\'', '[ -2.3, "hi \\\"there\\\""', { end: 69 } );
    > stand-alone incomplete value with the "end" set to 'E'
    > INPUT: '[ -2.3, "hi \"there\""' { end: 69 }
    > [@0                           // start array at 0
    > N4@2                          // 4-byte number at 2
    > S14@8                         // 14-byte string at 8
    > E@22                          // end buffer at 22
    
    print_tokens( 'invalid number - stop on error',     '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]',  { on_error: 'stop' } );
    > invalid number - stop on error
    > INPUT: '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'stop' }
    > [@0                                           // array start at 0
    > N4@2                                          // 4-byte number at 2
    > N1@8                                          // 1-byte number at 8
    > !1@9: {"tok":0,"msg":"unexpected character"}  // unexpected character at 9
    
    print_tokens( 'invalid number - continue on error', '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]',  { on_error: 'continue' } );
    > invalid number - continue on error
    > INPUT: '[ -2.3, 5~, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'continue' }
    > [@0
    > N4@2
    > N1@8
    > !1@9: {"tok":0,"msg":"unexpected character"}
    > S4@12
    > t@18
    > {@24
    > K3@25:N1@30
    > K3@33:N1@38
    > }@39
    > ]@41
    
Here we show two strategies for dealing with errors.  The simple strategy continues far 
ahead... but notice how with a quoting error, this creates a mis-alignment that continues to 
break the parsing.

    print_tokens( 'invalid quote - continue',                '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]',    { on_error: 'continue' } );
    > invalid quote - continue
    > INPUT: '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'continue' }
    > [@0
    > N4@2
    > S7@8
    > !1@15: {"tok":0,"msg":"unexpected character"}
    > !1@16: {"tok":0,"msg":"unexpected character"}
    > S11@17
    > !1@28: {"tok":0,"msg":"unexpected character"}
    > S7@29
    > !1@36: {"tok":0,"msg":"unexpected character"}
    > !7@37: {"tok":34,"msg":"unterminated string"}
    
The simple backup strategy works great to recover from this quote error:

    print_tokens( 'invalid quote - continue with backup', '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]',    { on_error: 'backup' } );
    > invalid quote - continue with backup
    > INPUT: '[ -2.3, "aaa, "bb", true, {"a": 1, "b": 2} ]' { on_error: 'backup' }
    > [@0
    > N4@2
    > S7@8
    > !1@15: {"tok":0,"msg":"unexpected character"}
    > S4@14
    > t@20
    > {@26
    > K3@27:N1@32
    > K3@35:N1@40
    > }@41
    > ]@43
    
... but it may not work
well on other types of errors.  If your system needs to handle smart-recovery from bad
files, the speed of the tokenizer could allow many strategies to be actively tried across
a large sample region and choose the best recovery option of a variety tried.

## API CHANGE NOTE (version 1.x -> 2.x)

**In version 2.0, returns codes and error handling changed as follows:**
  
1. 0xF1 is no longer used for Number token.  ASCII 78 ('N') is used instead.
    
2. Exceptions are no longer thrown during processing.  Instead, a 0 (zero) token
   is passed to the callback with value index and length showing the location and span of
   the error.

3. The callback return value is no longer simply a truthy value that indicates
   whether to stop.  The return value, if greater than zero, is the index
   at which to continue processing.  If zero, processing will halt.  If negative
   or anyting else (null/undefined) processing continues.
    
Changes 2 and 3 were important in that they allowed the tokenizer to stay simple and fast, 
while giving a fine degree of control over unexpected sequences in a way that aligns 
naturally with the handling in the callback.  All that is required to manage errors is to 
add an <code>if( token === 0 )</code> or <code>case 0:</code> statement to the callback.  The change of the
Number token to 'N' also simplified handling of output since, unlike 0xF1, it mapped naturally to an 
ASCII character like all the other ()non-error) tokens.
  