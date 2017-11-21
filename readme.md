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

Fast (~200 MB/sec) *NOW WITH VALIDATION*, light (2 kb *zero dependecy*) tokenizer for custom JSON/UTF-8 parsers.

**qb-json-tok now includes validation and incremental parsing - as of version 3.0!**

qb-json-tok allows flexibility and efficiency by performing minimum processing 
and leaving heavy-lifting, such as value decoding, as optional work for the callback (delegate)

**Complies with the 100% test coverage and minimum dependency requirements** of 
[qb-standard](http://github.com/quicbit-js/qb-standard) . 


## Install

    npm install qb-json-tok

## UPDATED API (OVERHAULED FROM 2.2.2)

The tokenize function has been updated significantly to support validation, context and recovery options
and *almost* at speeds approximately as fast the prior non-validating version (**200 MB/second** compared with 350).
That's a big benefit at a still very high speed.

You can't get much faster than a single integer array lookup in javascript, and so json-tok defines 
an integer-to-integer state map using a single integer array call for state transition - and uses an integer stack 
for depth changes and brace-matching.  

The parse graph is defined in about 30 lines that map integer context-state + ascii to the allowed context-states:

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
    map( CTX_OBJ | BEFORE|KEY,        '"',        CTX_OBJ | AFTER|KEY )  // etc ...
    
    // end array or object context - context will be set by checking stack
    map( CTX_ARR | BEFORE|FIRST|VAL,  ']',        AFTER|VAL )   // empty array
    map( CTX_ARR | AFTER|VAL,         ']',        AFTER|VAL )
    map( CTX_OBJ | BEFORE|FIRST|KEY,  '}',        AFTER|VAL )   // empty object
    map( CTX_OBJ | AFTER|VAL,         '}',        AFTER|VAL )
    
simple and fast - that's how we like our software at Quickbit.

## tokenize(callback src, off, lim)
  

The tokenizer is a function with four inputs:

    src:       A UTF-8 encoded array containing ANY JSON value such as an object, quoted
               string, array, or valid JSON number.  IOW, it doesn't have to be a {...} object.
               
    callback:  A function called for each token encountered.
    
        src:        the buffer being parsed
        koff:       index of key start (inclusive) in current object, in arrays koff is -1
        klim:       index of key limit (non-inclusive) in current object, in arrays koff is -1
        token:      integer representing the type encountered.  In most cases, token is the ASCII of the 
                    first character encountered.  'n' for null, 't' for true, '{' for object start.
                    TOK defines these token codes by name:
                        
                    {
                      STR: 34,        // '"'
                      END: 69,        // 'E'
                      NUM: 78,        // 'N'
                      ARR_BEG: 91,    // '['
                      ARR_END: 93,    // ']'
                      FAL: 102,       // 'f'
                      NUL: 110,       // 'n'
                      TRU: 116,       // 't'
                      OBJ_BEG: 123,   // '{'
                      OBJ_END: 125,   // '}'
                      ERR: 0,         // error. check err_info for information
                    }
                        
                        
        voff:       index of value offset (inclusive) in current object or array
        vlim:       index of value limit (non-inclusive) in current object or array
        
        info:       (object) if tok === TOK.ERR or tok === TOK.END, then info holds details that can be 
                    used to recover or handle values split across buffers.
                     
        return:     the value returned controls processing: 
                        returning 0 halts the tokenizer.
                        returning a positive number will continue tokenizing at that offset (it is not possible to return to 0)
                                (backtrack or skip forward).  Note that
                                jumping to the value 'xyz' of a key value pair:
                                        { "a": "xyz" }...
                                will make the tokenizer return just a string value
                                
                        returning anything else (undefined, null, negative number) - will cause 
                                processing to continue.
                     
    state            for incremental parsing, you can pass the state object returned by the end callback into this argument.

## Ends and Errors

Buffer termination and errors are also indicated by the token 'tok'.  This means that if we handle codes in a single switch
statement, error and end cases will fall into the default case instead of being forgotten and unchecked.

    function callback (src, koff, klim, tok, voff, vlim, info) {
        switch (tok) {
            case TOK.NUM:
                ...
            case TOK.ERR:                           // if we forgot to handle this case, the default case will get it.
                return my_error_handler(err_info)
            default:
                error('case not handled')       
        }
    }
    
Then 'info' object has more information for ERR and END cases.  In conjuction with the return-control to 
reset parsing position, info allows you to define recovery strategies for error cases and parsing 
values split across buffers.

fields:

    info
    {
      msg:    (string) message explaining the issue
      where:  (string) where the error occurred relative to tokens being parsed.  where codes are defined in
              INFO_WHERE: {
                BEFORE_KEY:     'before_key',  // before an object key was started (before the first '"')
                IN_KEY:         'in_key',      // inside an object key (before the second '"')
                AFTER_KEY:      'after_key',   // after an object key, but before the colon ':'
                BEFORE_VAL:     'before_val',  // before an object or array value (after the comma, colon, or starting array brace
                IN_VAL:         'in_val',      // inside an object or array value (includes uncertain number cases like 12.3<end>)
                AFTER_VAL:      'after_val',   // after an object or array value, but before the comma or closing array or object brace
              }
    }

## Example

Tokenizer tracks minimal state, it simply sifts through JSON tokens without a care - 
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
  