var test = require('test-kit').tape()
var tokenize = require('.')
var utf8 = require('qb-utf8-ez')

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

function format_callback (opt) {
  var log = opt.log || console.log
  var return_on_err = opt.ret_on_err
  var return_fn = opt.return_fn || function (ret) { return ret }      // controls return value for testing

  return function format_callback (buf, key_off, key_len, tok, val_off, val_len, err) {
    var val_str
    var ret = -1    // returning 0 halts process, > 0 continues at that index.  other values (neg, undefined,...) continue as normal.
    switch (tok) {
      case STRING:
        val_str = 'S' + val_len + '@' + val_off
        break
      case NUMBER:
        val_str = 'N' + val_len + '@' + val_off
        break
      case ERROR:
        val_str = ('!' + val_len + '@' + val_off + ': ' + JSON.stringify(err))
        ret = return_on_err
        break
      default:
        val_str = String.fromCharCode(tok) + '@' + val_off
    }
    if (key_off === -1) {
      log(val_str)                                            // value only
    } else {
      log('K' + key_len + '@' + key_off + ':' + val_str)      // key and value
    }

    return return_fn(ret)  // 0 will halt.  a positive number will parse at that offset. anything else will continue to next.
  }
}

// a formatting callback is a good way to understand the output of the tokenizer.  See readme.
//
//     'S4@0' means String, length 4 bytes, at offset zero.  (length includes the quotes).
//     'K3@1' means Key, length 3 bytes, at offset 1
//     'N3@5' means Number, length 3 bytes, at offset 5
//     'n@9'  means null at offset 9                         (null length is always 4 bytes)
//     't@23' means true at offset 23 ...
test('tokenize', function (t) {
  t.tableAssert(
    [
      [ 'input',             'tok_opt',  'cb_opt',         'exp'                                               ],
      [ '"\\""',              null,       null,            [ 'S4@0' ]                                          ],
      [ '"\\\\"',             null,       null,            [ 'S4@0' ]                                          ],
      [ '{"a":1}',            null,       null,            [ '{@0','K3@1:N1@5','}@6' ]                         ],
      [ '{"a" :1}',           null,       null,            [ '{@0','K3@1:N1@6','}@7' ]                         ],
      [ '{"a": 1}',           null,       null,            [ '{@0','K3@1:N1@6','}@7' ]                         ],
      [ '-3.05',              null,       null,            [ 'N5@0' ]                                          ],
      [ '  true',             null,       null,            [ 't@2' ]                                           ],
      [ ' false',             null,       null,            [ 'f@1' ]                                           ],
      [ '"x"',                null,       null,            [ 'S3@0']                                           ],
      [ '\t\t"x\\a\r"  ',     null,       null,            [ 'S6@2']                                           ],
      [ '"\\"x\\"a\r\\""',    null,       null,            [ 'S11@0']                                          ],
      [ ' [0,1,2]',           {end: END}, null,            [ '[@1','N1@2','N1@4','N1@6',']@7','E@8']           ],
      [ '["a", "bb"] ',       null,       null,            [ '[@0','S3@1','S4@6',']@10' ]                      ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null, null,   [ 'S3@0','N1@5','n@9','N5@15','t@23', 'f@29']         ],
      [ '["a",1.3 \n\t{ "b" : ["v", "w"]\n}\t\n ]', null, null,   [ '[@0','S3@1','N3@5','{@11','K3@13:[@19','S3@20','S3@25',']@28','}@30',']@34' ] ],

      // errors
      [ '"ab',                null,       null,                    [ '!3@0: {"tok":34,"msg":"unterminated string"}' ]  ],
      [ '"\\\\\\"',            null,       null,                   [ '!5@0: {"tok":34,"msg":"unterminated string"}' ]  ],
      [ '"abc"%',             null,       {ret_on_err: 0},         [ 'S5@0', '!1@5: {"tok":0,"msg":"unexpected character"}' ]  ],
      [ '0*',                 null,       null,                    [ 'N1@0', '!1@1: {"tok":0,"msg":"unexpected character"}' ]  ],
      [ '{"a":3^6}',          null,       {ret_on_err: 0},         [ '{@0', 'K3@1:N1@5', '!1@6: {"tok":0,"msg":"unexpected character"}' ]  ],
      [ '{"a":3^6}',          null,       {ret_on_err: -1},        [ '{@0', 'K3@1:N1@5', '!1@6: {"tok":0,"msg":"unexpected character"}', 'N1@7', '}@8' ]  ],
      [ '{"a":3^6}',          null,       {ret_on_err: null},      [ '{@0', 'K3@1:N1@5', '!1@6: {"tok":0,"msg":"unexpected character"}', 'N1@7', '}@8' ]  ],
      [ '{"a":^}',            null,       {ret_on_err: 0},         [ '{@0', 'K3@1:!1@5: {"tok":0,"msg":"unexpected character"}' ]  ],
      [ '"ab',                null,       {ret_on_err: 0},         [ '!3@0: {"tok":34,"msg":"unterminated string"}' ]  ],
      [ '0*',                 null,       {ret_on_err: 0},         [ 'N1@0', '!1@1: {"tok":0,"msg":"unexpected character"}' ] ],
      [ '0*',                 null,       {ret_on_err: -1},        [ 'N1@0', '!1@1: {"tok":0,"msg":"unexpected character"}' ] ],
      [ '{"a":1,"b:2,"c":3}', null,       {ret_on_err: undefined}, [
        '{@0',
        'K3@1:N1@5',
        'S6@7',
        '!1@13: {"tok":0,"msg":"unexpected character"}',
        '!4@14: {"tok":34,"msg":"unterminated string"}'
      ]],
    ],
    function (input, tok_opt, cb_opt) {
      cb_opt = cb_opt || {}
      var hector = t.hector()
      cb_opt.log = hector
      var cb = format_callback(cb_opt)
      tokenize(utf8.buffer(input), cb, tok_opt)
      return hector.arg(0)
    }
  )
})

test('callback return', function (t) {
  t.tableAssert(
    [
      [ 'input',     'at_tok', 'ret',    'exp'                                          ],
      [ '{"a":1}',    0,        6,        [ '{@0','}@6' ]                               ],
      [ '{"a":1}',    1,        6,        [ '{@0','K3@1:N1@5','}@6' ]                   ],
      [ '{"a":1}',    2,        6,        [ '{@0','K3@1:N1@5','}@6','}@6' ]             ],
      [ '{"a":1}',    3,        6,        [ '{@0','K3@1:N1@5','}@6' ]                   ],
      [ '{"a":1}',    2,        0,        [ '{@0','K3@1:N1@5','}@6' ]                   ],
      [ '{"a":1}',    2,        1,        [ '{@0','K3@1:N1@5','}@6','K3@1:N1@5','}@6' ] ],
      [ '{"a":1}',    2,        2,        [ '{@0','K3@1:N1@5','}@6','!1@2: {"tok":0,"msg":"unexpected character"}','!4@3: {"tok":34,"msg":"unterminated string"}' ]     ],
      [ '{"a":1}',    2,        3,        [ '{@0','K3@1:N1@5','}@6','!4@3: {"tok":34,"msg":"unterminated string"}' ]     ],
      [ '{"a":1}',    2,        4,        [ '{@0','K3@1:N1@5','}@6','N1@5','}@6' ]      ],
      [ '{"a":1}',    2,        5,        [ '{@0','K3@1:N1@5','}@6','N1@5','}@6' ]      ],
      [ '{"a":1}',    2,        6,        [ '{@0','K3@1:N1@5','}@6','}@6' ]             ],
      [ '{"a":1}',    2,        7,        [ '{@0','K3@1:N1@5','}@6' ]                   ],
      [ '{"a":1}',    2,        8,        [ '{@0','K3@1:N1@5','}@6' ]                   ],
      [ '{"a":1}',    2,        0,        [ '{@0','K3@1:N1@5','}@6' ]                   ],
      [ '{"a":1}',    2,        null,     [ '{@0','K3@1:N1@5','}@6' ]                   ],
      [ '["a","b"]',  2,        null,     [ '[@0','S3@1','S3@5',']@8' ]                 ],
      [ '["a","b"]',  2,        0,        [ '[@0','S3@1','S3@5' ]                       ],
      [ '["a","b"]',  2,        1,        [ '[@0','S3@1','S3@5','S3@1','S3@5',']@8' ]   ],
      [ '["a","b"]',  2,        4,        [ '[@0','S3@1','S3@5','S3@5',']@8' ]          ],
      [ '["a","b"]',  2,        5,        [ '[@0','S3@1','S3@5','S3@5',']@8' ]          ],
      [ '["a","b"]',  2,        8,        [ '[@0','S3@1','S3@5',']@8' ]                 ],
      [ '["a","b"]',  1,        1,        [ '[@0','S3@1','S3@1','S3@5',']@8' ]          ],
      [ '["a","b"]',  1,        4,        [ '[@0','S3@1','S3@5',']@8' ]                 ],
      [ '["a","b"]',  1,        5,        [ '[@0','S3@1','S3@5',']@8' ]                 ],
      [ '["a","b"]',  1,        8,        [ '[@0','S3@1',']@8' ]                        ],
      [ '["a","b"]',  1,        9,        [ '[@0','S3@1' ]                              ],
      [ '["a","b"]',  1,        0,        [ '[@0','S3@1' ]                              ],
      [ '["a","b"]',  1,        null,     [ '[@0','S3@1','S3@5',']@8' ]                 ],
    ],
    function (input, at_tok, cb_ret) {
      var hector = t.hector()
      var cur_tok = 0
      var cb = format_callback({
        log: hector,
        return_fn: function (ret) {
          if (cur_tok !== -1 && cur_tok++ === at_tok) {
            cur_tok = -1  // no more returns
            return cb_ret
          } else {
            return ret
          }
        }
      })
      tokenize(utf8.buffer(input), cb)
      return hector.arg(0)
    }
  )
})
