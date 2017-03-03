var test = require('test-kit').tape()
var tokenize = require('.')
var utf8 = require('qb-utf8-ez')

test('callback stop', function(t) {
    var stop_cb = function(stop_after) {
        var call_count = 0
        var ret = function() {
            return ++call_count === stop_after
        }
        ret.call_count = function() { return call_count }
        return ret
    }
    t.tableAssert([
        [ 'input',      'stop',  'exp' ],
        [ '[1,2,3]',     1,       1 ],
        [ '[1,2,3]',     2,       2 ],
        [ '[1,2,3]',     3,       3 ],
        [ '["a","b"]',   2,       2 ],
    ], function(input, stop) {
        var buf = utf8.buffer(input)
        var cb = stop_cb(stop)
        tokenize(buf, cb)
        return cb.call_count()
    })

})

// useful token constants:
var ERROR  = 0        // ERROR          (parser-defined)
var STRING = 34       // "  QUOTE       (parser-defined)
var NUMBER = 78       // 'N' NUMBER     (parser-defined)
var END    = 69       // 'E' END        (our chosen end token:   option.end)

// other tokens are intuitive - they are the same char code as the first byte parsed
// 't' for true
// 'f' for false
// 'n' for null
// '{' for object start
// '}' for object end
// '[' for array start
// ...

function format_callback(opt) {
    var log = opt.log || console.log;
    var halt_on_err = opt.halt_on_err == null || opt.halt_on_err

    return function format_callback(buf, key_off, key_len, tok, val_off, val_len, err) {
        var val_str;
        var stop = false
        switch(tok) {
            case STRING: val_str = 'S' + val_len + '@' + val_off; break;
            case NUMBER: val_str = 'N' + val_len + '@' + val_off; break;
            case ERROR:
                val_str = ('!' + val_len + '@' + val_off + ': ' + JSON.stringify(err));
                stop = halt_on_err;
                break;
            default:     val_str = String.fromCharCode(tok) + '@' + val_off;
        }
        if(key_off === -1) {
            log(val_str);                                           // value only
        } else {
            log('K' + key_len + '@' + key_off + ':' + val_str);     // key and value
        }
        return stop
    }
}

// a formatting callback is a good way to understand the output of the tokenizer.  See readme.
//
//     'S4@0' means String, length 4 bytes, at offset zero.  (length includes the quotes).
//     'K3@1' means Key, length 3 bytes, at offset 1
//     'N3@5' means Number, length 3 bytes, at offset 5
//     'n@9'  means null at offset 9                         (null length is always 4 bytes)
//     't@23' means true at offset 23 ...
test.only('tokenize', function(t) {
    t.tableAssert(
        [
            [ 'input',             'tok_opt',    'cb_opt',              'exp'],
            [ '{"a":1,"b:2,"c":3}', null,  {halt_on_err:0}, [
                '{@0',
                'K3@1:N1@5',
                'S6@7',
                '!1@13: {"tok":0,"msg":"unexpected character"}',
                '!4@14: {"tok":34,"msg":"unterminated string"}'
            ]],
            [ '"\\""',              null,       null,            [ 'S4@0' ]                                           ],
            [ '{"a":1}',             null,      null,            [ '{@0','K3@1:N1@5','}@6' ]                         ],
            [ '{"a" :1}',            null,      null,            [ '{@0','K3@1:N1@6','}@7' ]                         ],
            [ '{"a": 1}',            null,      null,            [ '{@0','K3@1:N1@6','}@7' ]                         ],
            [ '-3.05',              null,       null,            [ 'N5@0' ]                                            ],
            [ '"x"',                null,       null,            [ 'S3@0']                                             ],
            [ '\t\t"x\\a\r"  ',     null,       null,            [ 'S6@2']                                             ],
            [ '"\\"x\\"a\r\\""',    null,       null,            [ 'S11@0']                                            ],
            [ ' [0,1,2]',           {end:END},  null,            [ '[@1','N1@2','N1@4','N1@6',']@7','E@8']             ],
            [ '["a", "bb"] ',       null,       null,            [ '[@0','S3@1','S4@6',']@10' ]                        ],
            [ '"ab',                null,       null,            [ '!3@0: {"tok":34,"msg":"unterminated string"}' ]  ],
            [ '"abc"%',             null,       null,            [ 'S5@0', '!1@5: {"tok":0,"msg":"unexpected character"}' ]  ],
            [ '0*',                 null,       null,            [ '!2@0: {"tok":78,"msg":"illegal number"}'  ]  ],
            [ '{"a":3^6}',          null,       null,            [ '{@0', 'K3@1:!2@5: {"tok":78,"msg":"illegal number"}' ]  ],
            [ '"ab',                null,       {halt_on_err:0}, [ '!3@0: {"tok":34,"msg":"unterminated string"}' ]  ],
            [ '0*',                 null,       {halt_on_err:0}, [ '!2@0: {"tok":78,"msg":"illegal number"}'  ]  ],
            [ '{"a":3^6}',          null,       {halt_on_err:0}, [ '{@0', 'K3@1:!2@5: {"tok":78,"msg":"illegal number"}', 'N1@7', '}@8' ]  ],
            [ '"x", 4\n, null, 3.2e5 , true, false',      null, null,   [ 'S3@0','N1@5','n@9','N5@15','t@23', 'f@29']         ],
            [ '["a",1.3 \n\t{ "b" : ["v", "w"]\n}\t\n ]', null, null,   [ '[@0','S3@1','N3@5','{@11','K3@13:[@19','S3@20','S3@25',']@28','}@30',']@34' ] ],
        ],
        function(input, tok_opt, cb_opt) {
            cb_opt = cb_opt || {}
            var hector = t.hector()
            cb_opt.log = hector
            var cb = format_callback(cb_opt)
            tokenize(utf8.buffer(input), cb, tok_opt)
            return hector.arg(0)
        }
    )
})
