
var livef1 = require('../livef1');
var env = process.env;

//
// Test using pre-downloaded keyframe
//

if(env.LIVEF1_USER && env.LIVEF1_PASSWD){
  livef1.login(env.LIVEF1_USER, env.LIVEF1_PASSWD, function(packet){
    var fs = require('fs');
    var buffer = fs.readFileSync('fixtures/keyframe_00379.bin');

    livef1.streamify(buffer);
    livef1.parseStream(buffer, cookie, function(packet){
      console.log(packet)
    });
  }, function(err){
    console.log(err);
  });
}