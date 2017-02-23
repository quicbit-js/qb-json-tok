var test = require('test-kit').tape()
var tokenize = require('.')
var utf8 = require('qb-utf8-ez')

var TOK = {
    // returned token types
    OBJ_BEG:    123,    // '{'
    OBJ_END:    125,    // '}'
    ARR_BEG:    91,     // '['
    ARR_END:    93,     // ']'
    NULL:       110,    // 'n'
    TRUE:       116,    // 't'
    FALSE:      102,    // 'f'
    STRING:     34,     // '"'
    NUMBER:     0xF1,   // special code for any number
    END:        0xF3,   // special code for end-of-buffer
}

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

test('errors', function(t) {
    t.tableAssert([
        [ 'buf',                                   'exp'    ],
        [ '0*',                                     /illegal number/        ],
        [ '"abc"%',                                 /unexpected character/  ],
        [ '"abc',                                   /non-terminated string/  ],
        // [ [0x22,0x83,0x22],                         /non-terminated string/  ],
    ], function(buf) {
        tokenize(utf8.buffer(buf), t.hector())
    }, {assert: 'throws'})
})

// useful token constants:
var STRING = 0x22       // "  (double-quote)
var NUMBER = 0xF1       // code for any number

function format_callback(opt) {
    var log = opt.log || console.log;

    return function format_callback(buf, key_off, key_len, tok, val_off, val_len) {
        var val_str
        switch(tok) {
            case STRING:  val_str = 'S' + val_len; break;
            case NUMBER:  val_str = 'N' + val_len; break;
            default:      val_str = String.fromCharCode(tok);
        }
        val_str += '@' + val_off
        if(key_off === -1) {
            // value only
            log(val_str);
        } else {
            // key and value
            log('K' + key_len + '@' + key_off + ':' + val_str);
        }
    }
}

// a formatting callback is a good way to understand the output of the tokenizer.  See readme.
//
//     'S4@0' means String, length 4 bytes, at offset zero.  (length includes the quotes).
//     'K3@1' means Key, length 3 bytes, at offset 1
//     'N3@5' means Number, length 3 bytes, at offset 5
//     'n@9'  means null at offset 9                         (null length is always 4 bytes)
//     't@23' means true at offset 23 ...
test('format callback', function(t) {
    t.tableAssert([
        [ 'input',              'opt',                       'exp'],
        [ '"\\""',              null,                       [ 'S4@0' ]                                           ],
        [ '{"a":1}',            null,                       [ '{@0','K3@1:N1@5','}@6' ]                         ],
        [ '-3.05',              null,                       [ 'N5@0' ]                                            ],
        [ '"x"',                null,                       [ 'S3@0']                                             ],
        [ '\t\t"x\\a\r"  ',     null,                       [ 'S6@2']                                             ],
        [ '"\\"x\\"a\r\\""',    null,                       [ 'S11@0']                                            ],
        [ ' [0,1,2]',           {end:0x45},                 [ '[@1','N1@2','N1@4','N1@6',']@7','E@8']             ],
        [ '["a", "bb"] ',       null,                       [ '[@0','S3@1','S4@6',']@10' ]                        ],
        [ '"x", 4\n, null, 3.2e5 , true, false',      null, [ 'S3@0','N1@5','n@9','N5@15','t@23', 'f@29']         ],
        [ '{"a",1.3 \n\t{ "b" : ["v", "w"]\n}\t\n }', null, [ '{@0','S3@1','N3@5','{@11','S3@13','[@19','S3@20','S3@25',']@28','}@30','}@34' ] ],
    ], function(input, opt) {
        var hec = t.hector()
        var cb = format_callback({log: hec})
        tokenize(utf8.buffer(input), cb, opt)
        return hec.arg(0)
    })
})
