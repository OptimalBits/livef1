
var livef1 = require('../livef1');

var env = process.env;

if(env.LIVEF1_USER && env.LIVEF1_PASSWD){
  livef1(env.LIVEF1_USER, env.LIVEF1_PASSWD, function(packet){
    console.log(packet);
  }).then(function(result){
    console.log(result)
  }, function(err){
    console.log(err);
  })
}else{
  console.log("Error: missing environment variables LIVEF1_USER and LIVEF1_PASSWD");
  console.log("Error: Export these variables with your data from formula1.com and try again.");
}
