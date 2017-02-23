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
var NUMBER = 0xF1       // token for JSON number
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

    return function format_callback(buf, key_off, key_len, tok, val_off, val_len) {
        var val_str;
        switch(tok) {
            case STRING:  val_str = 'S' + val_len; break;
            case NUMBER:  val_str = 'N' + val_len; break;
            default:      val_str = String.fromCharCode(tok);
        }
        val_str += '@' + val_off;
        if(key_off === -1) {
            log(val_str);                                           // value only
        } else {
            log('K' + key_len + '@' + key_off + ':' + val_str);     // key and value
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
        [ '{"a":1}',             null,                      [ '{@0','K3@1:N1@5','}@6' ]                         ],
        [ '{"a" :1}',            null,                      [ '{@0','K3@1:N1@6','}@7' ]                         ],
        [ '{"a": 1}',            null,                      [ '{@0','K3@1:N1@6','}@7' ]                         ],
        [ '-3.05',              null,                       [ 'N5@0' ]                                            ],
        [ '"x"',                null,                       [ 'S3@0']                                             ],
        [ '\t\t"x\\a\r"  ',     null,                       [ 'S6@2']                                             ],
        [ '"\\"x\\"a\r\\""',    null,                       [ 'S11@0']                                            ],
        [ ' [0,1,2]',           {end:0x45},                 [ '[@1','N1@2','N1@4','N1@6',']@7','E@8']             ],
        [ '["a", "bb"] ',       null,                       [ '[@0','S3@1','S4@6',']@10' ]                        ],
        [ '"x", 4\n, null, 3.2e5 , true, false',      null, [ 'S3@0','N1@5','n@9','N5@15','t@23', 'f@29']         ],
        [ '["a",1.3 \n\t{ "b" : ["v", "w"]\n}\t\n ]', null, [ '[@0','S3@1','N3@5','{@11','K3@13:[@19','S3@20','S3@25',']@28','}@30',']@34' ] ],
    ], function(input, opt) {
        var hec = t.hector()
        var cb = format_callback({log: hec})
        tokenize(utf8.buffer(input), cb, opt)
        return hec.arg(0)
    })
})
