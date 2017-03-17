var tokenize = require('..')
var utf8 = require('qb-utf8-ez')

// json could be a handy library 'qb-json-ez' with ability to generate types (once schema is implemented)
// json.generate(schema, options)
//
//    schema:       a json schema
//    options:
//        generate: object with type keys and function values that generate dummy data:
//              generate( type, path, i ) -> output type for the given info
//
//
var json = {
  generate: function gen_json (str_value, buf_size) {
    var sample_buf = utf8.buffer('"' + str_value + '"')
    var slen = sample_buf.length
    var vals = []
    for (var rem = buf_size - 8; rem >= slen; rem -= (slen + 1)) {   // -8 for {v:[...]) +1 for first, +1 for commas after
      vals.push(sample_buf)
    }
    if (rem > 1) {       // need at least 2 bytes to quote
      var part = utf8.escape_illegal(sample_buf.slice(0, rem))
      part[0] = 34
      part[part.length - 1] = 34
      vals.push(part)
    }
    return utf8.join([
      utf8.buffer('{"v":['),
      utf8.join(vals, ','),
      utf8.buffer(']}')
    ], '')
  }
}

function time_tokenize (sample, buf_size, total_bytes) {
  var buf = json.generate(sample, buf_size)
  console.log('buf size:', buf.length)
  var times =  total_bytes / buf_size
  var keys = 0, vals = 0
  var cb = function (buf, ki, klen,tok, vi, vlen) {
    if (ki !== -1) keys++
    vals++
  }
  var t0 = performance.now()
  for (var n = 0; n < times; n++) {
    tokenize(buf, cb)
  }
  console.log(keys, 'keys', vals, 'vals')
  var ms = performance.now() - t0
  var mbs = total_bytes / (ms * 1000)
  console.log('tokenize: ' + (buf_size / 1000) + 'kb buffers ' + times + ' times in ' + ms + ' ms.  ' +  mbs + ' mb per sec.')
}

if (typeof window !== 'undefined') {
  window.document.ptest = Object.assign({}, window.document.ptest, {
    time_tokenize: time_tokenize
  })
}
