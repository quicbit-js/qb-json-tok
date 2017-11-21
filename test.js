var test = require('test-kit').tape()
var utf8 = require('qb-utf8-ez')
var tokenize = require('.')

// useful token constants:
var TOK = tokenize.TOK

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

  return function format_callback (buf, koff, klim, tok, voff, vlim, info) {
    var val_str
    var vlen = vlim - voff
    var ret = -1    // returning 0 halts process, > 0 continues at that index.  other values (neg, undefined,...) continue as normal.
    switch (tok) {
      case TOK.STR:
        val_str = 'S' + vlen + '@' + voff
        break
      case TOK.NUM:
        val_str = 'N' + vlen + '@' + voff
        break
      case TOK.ERR:
        var tok_str = ', tok: ' + (info.tok > 32 ? '"' + String.fromCharCode(info.tok) + '"' : info.tok)
        val_str = '!' + vlen + '@' + voff + ' ' + info.where + tok_str
        ret = return_on_err
        break
      default:
        val_str = String.fromCharCode(tok) + '@' + voff
    }
    if (koff === -1) {
      log(val_str)                                            // value only
    } else {
      log('K' + (klim - koff) + '@' + koff + ':' + val_str)      // key and value
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
      [ 'src',             'off',  'lim',                'exp'                                ],
      [ '"x"',             0,       null,          [ 'S3@0', 'E@3']                           ],
      [ '-3.05',           0,       null,          [ 'N5@0', 'E@5' ]                          ],
      [ '-3.05',           1,       null,          [ 'N4@1', 'E@5' ]                          ],
      [ '  true',          0,       null,          [ 't@2', 'E@6' ]                           ],
      [ ' false  ',        0,       null,          [ 'f@1', 'E@8' ]                           ],
      [ ' false  ',        1,       null,          [ 'f@1', 'E@8' ]                           ],
      [ '[3.05E-2]',       0,       null,          [ '[@0', 'N7@1', ']@8', 'E@9' ]            ],
      [ '[3.05E-2]',       4,       5,             [ 'N1@4', 'E@5' ]            ],
      [ '{"a":1}',         0,       null,          [ '{@0','K3@1:N1@5','}@6', 'E@7' ]         ],
      [ '{"a" :1}',        0,       null,          [ '{@0','K3@1:N1@6','}@7', 'E@8' ]         ],
      [ '{"a": 1}',        0,       null,          [ '{@0','K3@1:N1@6','}@7', 'E@8' ]         ],
      [ '"\\""',           0,       null,          [ 'S4@0', 'E@4' ]                          ],
      [ '"\\\\"',          0,       null,          [ 'S4@0', 'E@4' ]                          ],
      [ '\t\t"x\\a\r"  ',  0,       null,          [ 'S6@2', 'E@10']                          ],
      [ '"\\"x\\"a\r\\""', 0,       null,          [ 'S11@0', 'E@11']                         ],
      [ ' [0,1,2]',        0,       null,          [ '[@1','N1@2','N1@4','N1@6',']@7','E@8']  ],
      [ '["a", "bb"] ',    0,       null,          [ '[@0','S3@1','S4@6',']@10', 'E@12' ]     ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null, null,   [ 'S3@0','N1@5','n@9','N5@15','t@23', 'f@29', 'E@34']         ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null, null,   [ '[@0','S3@1','N3@5','{@11','K3@13:[@19','S3@20','S3@25',']@28','}@30',']@34', 'E@35' ] ],
    ],
    function (input, off, lim, cb_opt) {
      cb_opt = cb_opt || {}
      var hector = t.hector()
      cb_opt.log = hector
      var cb = format_callback(cb_opt)
      tokenize(cb, utf8.buffer(input), off, lim)
      return hector.arg(0)
    }
  )
})

test('tokenize - errors', function (t) {
  t.tableAssert(
    [
      [ 'input',             'tok_opt',  'cb_opt',                'exp'                                                      ],
      [
        ',[,:["b"]',          null,       null,
        [ '!1@0 before first value, tok: ","', '[@1', '!1@2 in array, before first value, tok: ","', '!1@3 in array, before first value, tok: ":"', '[@4', 'S3@5', ']@8', 'E@9' ]
      ],
      [ '"ab',                null,       null,                     [ '!3@0 within first value, tok: """', 'E@3' ]  ],
      [ '"\\\\\\"',           null,       null,                     [ '!5@0 within first value, tok: """', 'E@5' ]  ],
      [ '"abc"%',             null,       {ret_on_err: 0},          [ 'S5@0', '!1@5 after value, tok: "%"' ]  ],
      [ '0*',                 null,       null,                     [ 'N1@0', '!1@1 after value, tok: "*"', 'E@2' ]  ],
      [ '0{',                 null,       null,                     [ 'N1@0', '!1@1 after value, tok: "{"', 'E@2' ]  ],
      [ '1,2n',               null,       null,                     [ 'N1@0', 'N1@2', '!1@3 after value, tok: "n"', 'E@4' ] ],
      [ '1f',                 null,       null,                     [ 'N1@0', '!1@1 after value, tok: "f"', 'E@2' ] ],
      [ '[3.05E-2',           null,       null,                     [ '[@0', '!7@1 in array, within first value, tok: "N"', 'E@8' ]  ],
      [ '[3.05E-2,4.',        null,       null,                     [ '[@0', 'N7@1', '!2@9 in array, within value, tok: "N"', 'E@11' ]  ],
      [ '{"a":3^6}',          null,       {ret_on_err: 0},          [ '{@0', 'K3@1:N1@5', '!1@6 in object, after value, tok: "^"' ] ],
      [ '{"a":3^6}',          null,       {ret_on_err: -1},         [ '{@0', 'K3@1:N1@5', '!1@6 in object, after value, tok: "^"', '!1@7 in object, after value, tok: "6"', '}@8', 'E@9' ]  ],
      [ '{"a":3^6}',          null,       {ret_on_err: null},       [ '{@0', 'K3@1:N1@5', '!1@6 in object, after value, tok: "^"', '!1@7 in object, after value, tok: "6"', '}@8', 'E@9' ]  ],
      [ '{"a":^}',            null,       {ret_on_err: 0},          [ '{@0', 'K3@1:!1@5 in object, before value, tok: "^"' ]  ],
      [ '"ab',                null,       {ret_on_err: 0},          [ '!3@0 within first value, tok: """' ]  ],
      [ '0*',                 null,       {ret_on_err: 0},          [ 'N1@0', '!1@1 after value, tok: "*"' ] ],
      [ '0*',                 null,       {ret_on_err: -1},         [ 'N1@0', '!1@1 after value, tok: "*"', 'E@2' ] ],
      [ '{"a":1,"b:2,"c":3}', null,       {ret_on_err: undefined},  [ '{@0', 'K3@1:N1@5', 'K6@7:!1@13 in object, after key, tok: "c"', '!1@14 in object, after key, tok: """', 'N1@16', '}@17', 'E@18' ] ],
    ],
    function (input, tok_opt, cb_opt) {
      cb_opt = cb_opt || {}
      var hector = t.hector()
      cb_opt.log = hector
      var cb = format_callback(cb_opt)
      tokenize(cb, utf8.buffer(input))
      return hector.arg(0)
    }
  )
})

test('callback return', function (t) {
  t.tableAssert(
    [
      [ 'input',     'at_tok', 'cb_ret',  'exp'                                          ],
      [ '{"a":1}',    0,        6,        [ '{@0','}@6', 'E@7' ]                               ],
      [ '{"a":1}',    1,        6,        [ '{@0','K3@1:N1@5','}@6', 'E@7' ]                   ],
      [ '{"a":1}',    2,        6,        [ '{@0', 'K3@1:N1@5', '}@6', '!1@6 after value, tok: "}"', 'E@7' ]            ],
      [ '{"a":1}',    3,        6,        [ '{@0','K3@1:N1@5','}@6', 'E@7' ]                   ],
      [ '{"a":1}',    1,        0,        [ '{@0', 'K3@1:N1@5' ]                         ],
      [ '{"a":1}',    1,        4,        [ '{@0', 'K3@1:N1@5', '!1@4 in object, after value, tok: ":"', '!1@5 in object, after value, tok: "1"', '}@6', 'E@7' ] ],
      [ '{"a":1}',    2,        5,        [ '{@0', 'K3@1:N1@5', '}@6', '!1@5 after value, tok: "1"', '!1@6 after value, tok: "}"', 'E@7' ]   ],
      [ '{"a":1}',    2,        6,        [ '{@0', 'K3@1:N1@5', '}@6', '!1@6 after value, tok: "}"', 'E@7' ]         ],
      [ '{"a":1}',    2,        7,        [ '{@0','K3@1:N1@5','}@6', 'E@7' ]                   ],
      [ '{"a":1}',    2,        8,        [ '{@0','K3@1:N1@5','}@6', 'E@8' ]                   ],
      [ '{"a":1}',    2,        0,        [ '{@0','K3@1:N1@5','}@6' ]                          ],
      [ '{"a":1}',    2,        null,     [ '{@0','K3@1:N1@5','}@6', 'E@7' ]                   ],
      [ '["a","b"]',  2,        null,     [ '[@0','S3@1','S3@5',']@8', 'E@9' ]                 ],
      [ '["a","b"]',  2,        0,        [ '[@0','S3@1','S3@5' ]                              ],
      [ '["a","b"]',  2,        1,        [ '[@0', 'S3@1', 'S3@5', '!1@1 in array, after value, tok: """', '!1@2 in array, after value, tok: "a"', '!1@3 in array, after value, tok: """', 'S3@5', ']@8', 'E@9' ]  ],
      [ '["a","b"]',  2,        4,        [ '[@0', 'S3@1', 'S3@5', 'S3@5', ']@8', 'E@9' ] ],
      [ '["a","b"]',  2,        5,        [ '[@0', 'S3@1', 'S3@5', '!1@5 in array, after value, tok: """', '!1@6 in array, after value, tok: "b"', '!1@7 in array, after value, tok: """', ']@8', 'E@9' ]   ],
      [ '["a","b"]',  2,        8,        [ '[@0','S3@1','S3@5',']@8', 'E@9' ]                 ],
      [ '["a","b"]',  3,        8,        [ '[@0', 'S3@1', 'S3@5', ']@8', '!1@8 after value, tok: "]"', 'E@9' ] ],
      [ '["a","b"]',  1,        4,        [ '[@0', 'S3@1', 'S3@5', ']@8', 'E@9' ]   ],
      [ '["a","b"]',  1,        7,        [ '[@0', 'S3@1', '!1@7 in array, after value, tok: """', ']@8', 'E@9' ]   ],
      [ '["a","b"]',  1,        8,        [ '[@0','S3@1',']@8', 'E@9' ]                        ],
      [ '["a","b"]',  1,        9,        [ '[@0','S3@1', 'E@9' ]                              ],
      [ '["a","b"]',  1,        0,        [ '[@0','S3@1' ]                                     ],
      [ '["a","b"]',  1,        null,     [ '[@0','S3@1','S3@5',']@8', 'E@9' ]                 ],
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
      tokenize(cb, utf8.buffer(input))
      return hector.arg(0)
    }
  )
})

test('state_to_str', function (t) {
  t.table_assert([
    [ 'state',                'exp' ],
    [ 0x100,                  'in object, value' ],
    [ 0x100,                  'in object, value' ],
    [ 0x200,                  'in array, value' ],
    [ null,                   'undefined' ],
  ], tokenize.state_to_str)
})