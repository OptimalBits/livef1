
var livef1 = require('../livef1');

//
// Test using pre-downloaded keyframe
//

livef1.login("manuel@optimalbits.com", "mierda350").then(function(cookie){
  var fs = require('fs');
  var buffer = fs.readFileSync('fixtures/keyframe_00379.bin');

  livef1.streamify(buffer);
  livef1.parseStream(buffer, cookie, function(packet){
    console.log(packet)
  });
}, function(err){
  console.log(err);
})
